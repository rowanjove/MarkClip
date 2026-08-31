# 页摘统一升级计划

> 目标：在保持“本地处理、轻量、网页转 Markdown”核心定位的前提下，把当前可用的 MVP 升级成权限合理、输出可信、可回归验证、可持续迭代的浏览器扩展。
>
> 计划来源：仓库代码审查、现有测试结果，以及对 [MarkDownload](https://github.com/deathau/markdownload)、[Obsidian Web Clipper](https://github.com/obsidianmd/obsidian-clipper)、[MarkSnip](https://github.com/daxid/MarkSnip) 的实现和测试体系对标。

## 实施状态（2026-08-31）

核心 Stage 0–3 与 Stage 4 产品能力已落地。本地测试共 83 项（80 通过、3 个浏览器测试默认跳过），另行执行 Chromium 扩展 E2E、稳定版 Chrome CDP smoke、打包和安全门禁。浏览器检查仍保留为显式门禁，未在每次普通检查中默认启动；Edge 发布仍需按同一手工清单在目标机器复核。

## GitHub 对标提炼

- [MarkDownload](https://github.com/deathau/markdownload)：把正文识别、DOM 清洗、Turndown 转换和导出选项分层；本项目对应落地为 `ClipRequest`/`ClipResult`、独立 URL/代码块/GFM helper 和可解释 warnings。
- [Obsidian Web Clipper](https://github.com/obsidianmd/obsidian-clipper)：模板变量、站点规则和本地目标是高复用能力；本项目落地为安全模板过滤器、host/selector 规则、Obsidian URI 与本地图片内嵌。
- [MarkSnip](https://github.com/daxid/MarkSnip)：选区/选择区域必须尊重用户明确选择，并对动态页面提供稳定回退；本项目落地为 range selection、pick selection 合并、SPA 当前 URL 与 Readability fallback diagnostics。

共同经验：转换核心应保持纯本地、可测试、可解释；权限和导出目标必须显式启用；公网网页只用于低频 smoke，不能替代固定 fixture 和真实扩展 E2E。

## 1. 当前基线与目标状态

### 当前基线

- Manifest V3，无构建流程，主要逻辑集中在几个浏览器脚本中。
- 支持正文、选择区域、整页、复制、下载、图片移除和悬浮按钮。
- 计划生成前本地 `node --test` 有 21 项测试，当前全部通过；所有 JavaScript 通过语法检查。
- 依赖以 vendored `lib/readability.js` 和 `lib/turndown.js` 形式存在，缺少版本清单和自动升级审计。
- 本计划生成时工作树基线干净；后续实现变更均以本文件验收项为准。

### 目标状态

```text
用户操作
   ↓
Capture（main / full / selection / pick）
   ↓
Normalize DOM（安全属性、绝对 URL、懒加载、代码块）
   ↓
Extract Strategy（Readability → 语义候选 → 明确诊断）
   ↓
Convert（Turndown + GFM + 可测试自定义规则）
   ↓
Compose（标题、来源、日期、模板化 frontmatter）
   ↓
Deliver（预览、复制、下载、未来的其他目标）
```

各阶段都应有明确输入、输出和错误类型；Popup、浮窗、background 只负责浏览器适配和用户交互，不再承载转换规则。

## 2. 必须解决的问题清单

| ID | 优先级 | 问题 | 目标 |
|---|---|---|---|
| P-01 | P0 | `<all_urls>` host permission 与静态全站 content script 过宽 | 默认使用 `activeTab` 按需注入；悬浮按钮改为用户主动授权的可选能力 |
| P-02 | P0 | `href/src` 保留相对路径 | 以 `document.baseURI` 统一转换为绝对 URL，并定义协议白名单 |
| P-03 | P1 | 自定义 fenced-code 规则覆盖 Turndown 健壮实现 | 保留代码内容、动态 fence 长度、语言识别和 `<br>` 换行 |
| P-04 | P1 | full 模式仍删除 header/footer/aside 等内容 | full 只清除确定的脚本和危险节点；main、pick 使用独立清洗策略 |
| P-05 | P1 | Readability、DOM clone、清洗在主线程同步执行 | 增加阶段耗时、取消/超时策略和大页面降级；避免一次性阻塞页面 |
| P-06 | P1 | 测试只覆盖纯函数和 manifest | 建立 fixture、真实库集成测试、扩展 E2E 和非阻塞 live smoke |
| P-07 | P2 | frontmatter 转义不完整、标题与文件名来源不一致 | 使用稳定的 YAML scalar 编码；统一 `ClipResult.title` 来源 |
| P-08 | P2 | 浮窗可拖出视口，缺少 pointercancel 和无障碍状态 | 限制位置、处理取消事件、补齐键盘和 ARIA 状态 |
| P-09 | P2 | 缺依赖/许可证/CI/发布元数据 | 增加 package、lockfile、第三方声明、LICENSE、CHANGELOG 和 CI |
| P-10 | P3 | 站点差异和用户定制能力不足 | 在稳定核心后增加模板、站点规则、GFM/数学公式和更多导出目标 |

## 3. 统一实施路线

以下阶段按依赖顺序执行；每阶段完成后都必须保持上一阶段验收项通过。

### Stage 0：建立工程基线与回归安全网

**目的：** 在修改提取和转换逻辑前，先让错误能够稳定重现。

任务：

- [x] 增加 `package.json`、锁文件和统一脚本：`test`、`lint`、`check`、`test:e2e`。
- [x] 选择 JSDOM（或等价 DOM 环境），把可测试逻辑抽到可复用 helper。
- [x] 建立本地 HTML fixture：已覆盖文章、导航、表格、代码块、相对链接、懒加载图片、列表、SPA 路由和选区。
- [x] 为 fixture 建立 Markdown snapshot，同时保留关键结构断言；异常页面通过统一错误断言覆盖。
- [x] 增加现有问题的回归用例：
  - 相对 `href`、根路径图片和 `<base>`；
  - 代码内容包含三个以上反引号；
  - 代码首尾空白和 `<br>` 换行；
  - full 模式保留 header/footer；
  - article 内部的 header/aside 不被误删；
  - Readability 标题用于 frontmatter、文件名和预览；
  - YAML 标题包含换行、反斜杠、双引号和控制字符；
  - 复制失败、下载失败、受限页面和重复消息。
- [x] 增加 GitHub Actions：语法检查、单元/集成测试、manifest 校验、打包 smoke。

交付物：可在干净环境一条命令运行测试；所有已知缺陷有稳定 fixture；CI 对每个 PR 生效。

### Stage 1：重构为可验证的转换管线

**目的：** 解决正确性问题，并把未来功能放到可扩展边界内。

任务：

- [x] 建立纯数据契约：
  - `ClipRequest { mode, removeImages, url, options }`
  - `ExtractedContent { element, title, source, metadata, diagnostics }`
  - `ClipResult { markdown, title, source, charCount, warnings, timings }`
- [x] 拆分模块：URL、代码块、消息、契约、模板、数学公式、图片、Obsidian、位置约束和站点规则均为独立 helper；`content-extractor.js` 只保留页面编排与策略组合。
  - `capture`：读取 DOM、selection、picked nodes；
  - `sanitize`：删除脚本、事件属性和扩展 UI；
  - `url-normalizer`：解析绝对链接、协议白名单、fragment 和 data URL；
  - `extractor`：Readability、语义候选、full、selection、pick；
  - `converter`：Turndown、GFM、代码块、表格、图片策略；
  - `composer`：frontmatter、模板和正文规范化；
  - `exporter`：clipboard、download、preview。
- [x] 为 main、full、pick 使用不同的清洗策略：
  - main：Readability 优先，fallback 使用候选节点评分，不只取第一个 selector；
  - full：只移除 `script/style/noscript`、不可见危险内容和扩展自身 UI；
  - pick：尊重用户明确选择，避免按全局 `.header/.popup/.menu` 误删；
  - selection：保留跨节点 range、顺序和基本语义。
- [x] 删除或重写当前覆盖 Turndown 的代码块规则：
  - fence 长度按内容自适应；
  - 保留换行和有意义空白；
  - 支持 `language-*`、`lang-*`、常见高亮 class；
  - 支持代码块中的 `<br>` 和高亮 span；
  - 可选的语言自动识别必须可关闭。
- [x] 增加 GFM 规则：表格、task list、删除线；每项都有单元测试和 fixture。
- [x] 统一标题来源：Readability title → document title → `Untitled`；`ClipResult.title`、frontmatter、预览和下载文件名使用同一值。
- [x] frontmatter 使用可靠的 YAML scalar 序列化；禁止原始换行和控制字符破坏结构。
- [x] 保留 `warnings` 和 `diagnostics`，让 UI 能显示“正文回退”“图片被移除”等可解释状态。

交付物：同一份 `ClipResult` 可被 Popup、浮窗和未来导出目标复用；转换结果不依赖 UI 调用方。

### Stage 2：权限、消息和浏览器生命周期治理

**目的：** 降低安装风险和运行时竞态，符合 MV3 的最小授权方向。

任务：

- [x] 默认 manifest 收敛为 `activeTab`、`scripting`、`storage`、`clipboardWrite` 等实际需要的权限。
- [x] 将悬浮按钮改为显式启用：
  - 默认关闭或仅在当前 tab 启用；
  - 使用 `optional_host_permissions`；
  - 授权后通过 `chrome.scripting.registerContentScripts` 动态注册；
  - 提供撤销授权和“仅当前站点”选项。
- [x] 统一 `sendTabMessage` Promise 封装，区分：无 receiver、页面不可脚本化、扩展重载、超时和业务错误。
- [x] 对 runtime message 做 action/mode/payload schema 校验，未知 action 直接拒绝。
- [x] 给并发的 `ensureBootstrap/ensureLibraries` 增加 tab 级锁，避免重复注入。
- [x] 覆盖 SPA 导航、刷新、Popup 关闭、页面销毁和重复启动选择区域；增加 tab 级注入锁、消息超时和可取消转换，扩展热重载由重新 ping/bootstrap 路径兜底。
- [x] 统一下载 URL 生命周期：点击后延迟 revoke，并处理失败回调。
- [x] 浮窗交互补齐：
  - `pointercancel`、`lostpointercapture`；
  - 位置限制在可视区域；
  - `aria-expanded`、`aria-pressed`、键盘完成/取消；
  - 面板打开后焦点管理和 Escape 关闭；
  - 不遮挡页面关键操作。

交付物：默认安装权限最小化；所有受限页面和生命周期错误都有明确提示，不能静默卡死。

### Stage 3：性能、质量门禁与发布准备

**目的：** 把可用性变成可持续发布能力。

任务：

- [x] 为每次转换记录阶段耗时：已记录 extract/convert/compose/total，并在结果中保留 node/text diagnostics。
- [x] 对超大 DOM 增加保护：节点/字符阈值、分块让出主线程、15 秒 deadline 和 Popup 取消按钮均已接入。
- [x] 评估把重转换移入 offscreen document；当前已记录决策和触发阈值，暂不引入额外 MV3 生命周期。
- [x] 建立三层测试：unit、JSDOM integration、Chromium extension E2E 和 packaging smoke 均已加入。
  - unit：URL、文件名、YAML、selection merge、位置约束、消息 schema；
  - integration：真实 Readability/Turndown + JSDOM fixture；
  - E2E：真实 Chromium 扩展、Popup shell 和打包 smoke；新增真实浮窗图标资源加载、4 种视口各 5 个位置、拖动期间面板边界和 Escape 焦点恢复检查。浮窗测试模拟偏好存储并注入真实脚本，尚未覆盖完整权限申请与导出链路；选择区域和转换边界另由 JSDOM/集成测试覆盖，受限页仍需手工或后续浏览器 E2E。
- [x] E2E 使用本地 fixture 和固定 route，不把公网可用性作为 CI 必要条件；CI 会安装 Chromium 并运行真实扩展 smoke。
- [x] 增加低频 live smoke，仅用于发现真实网页变化，失败不阻塞普通 PR。
- [x] 增加安全检查：manifest 权限、消息和 URL allowlist、vendored hash、远程脚本扫描和 `npm audit` 已纳入检查。
  - manifest 权限白名单；
  - 禁止远程脚本、动态 `eval` 和未清洗 HTML 输出；
  - URL 协议 allowlist；
  - 第三方库版本/hash 和许可证审计。
- [x] 增加发布文件：LICENSE、第三方声明、CHANGELOG、支持浏览器说明、限制说明、故障排查和贡献指南已完成。
- [x] 发布前进行 Chrome/Edge smoke：Playwright Chromium Popup shell 和稳定 Chrome CDP smoke 已通过；Edge 提供同等手工清单，需在目标机器复核。

交付物：每个版本可重现构建、可审计依赖、可回滚，有明确发布门槛。

### Stage 4：在核心稳定后的产品能力

**目的：** 把成熟的转换核心扩展到更高价值场景，不提前扩大复杂度。

任务：

- [x] 可编辑 Markdown 预览，支持修改标题和正文后再复制/下载。
- [x] frontmatter 模板和变量：标题、来源、作者、发布日期、站点、标签、摘要。
- [x] 站点级规则：选择器 fallback、图片策略、代码块规则和模板触发器。
- [x] 数学公式、MathML/MathJax、语义表格和更完整的 GFM 支持；当前覆盖对齐表格、task list、删除线、MathML 和 MathJax TeX。
- [x] Obsidian 文件名/文件夹模板与 URI 集成，保持本地优先。
- [x] 批量标签页和批量 Markdown 导出；默认仅在用户主动点击并授权后运行。
- [x] 可选图片本地化；默认关闭、失败保留原链接，不联网上传、不依赖远程后端。

### Stage 5：品牌和界面去 AI 化（2026-08-31）

**目的：** 让扩展更像一个安静、可信的本地工具，降低弹窗、页面浮层和选区提示中的视觉噪声，同时给后续发布保留清晰的品牌边界。

本轮已完成：

- [x] 对外名称改为“页摘”，副标题统一为“网页摘录为 Markdown”；保留 `MarkClip*` JavaScript 命名空间和 `page2md:*` 存储键，避免升级时丢失已有设置。
- [x] 使用纸张、折角和横线组成的本地 SVG 风格 PNG 图标，提供 16/48/128 三种尺寸；图标不使用机器人、星光、渐变光晕或对话气泡等 AI 视觉符号。
- [x] 重排 Popup：固定底部操作栏，内容区独立滚动，预览结果可编辑，状态、错误和取消操作有明确位置；去掉大面积渐变、过度圆角和胶囊式装饰，并尊重 `prefers-reduced-motion`。
- [x] 重做页面快捷入口：使用小型纸张图标、窄面板、平面分隔线和低饱和绿色强调色；面板按视口自动翻转并限制在可见区域内。
- [x] 重做选择区域提示：选区边框、已选标记和操作条使用同一套中性绿色，不再使用高亮蓝和大面积光晕；页面元素的 `data-action` 不会误触发取消。
- [x] Popup、页面浮层和设置变化共享忙碌状态与偏好同步，避免重复点击、旧结果复用和两个入口状态不一致。
- [x] 建立 [DESIGN_GUIDE.md](./DESIGN_GUIDE.md)，固定品牌边界、色彩/尺寸基线、组件行为和无障碍验收项，作为后续视觉改动的审查依据。

后续升级建议：

- [x] 基于本轮内部验收确定浅色为新安装默认主题，固定字号和对比度基线，并补充 Popup/浮层的视觉回归截图；真实用户反馈只用于后续复核，不覆盖已有主题设置。
- [x] 为应用商店准备单色图标、深浅背景图标、截图和中英文一句话说明；发布前检查图标在 16px 工具栏尺寸下仍能辨认折角和横线。
- [x] 增加键盘路径：打开后焦点进入第一个动作，Escape 关闭浮层或收起更多操作，Tab 顺序覆盖范围、图片处理和导出动作。
- [x] 把“发送到 Obsidian”和“批量保存”收进可折叠的更多操作，默认界面只保留最常用的复制、保存和重新提取。
- [x] 确定面向国际发布的英文副标为 “Yezhai · Web to Markdown”，不替换中文品牌、内部命名空间或存储键。
- [x] 记录本轮视觉截图、交互验收项和无障碍检查结果，后续视觉改动沿用同一份记录模板，避免重新堆叠渐变、浮夸动效和泛化 AI 文案。

## 4. 推荐拆分的 PR 顺序

1. `chore: add package, CI, dependency metadata and license notices`
2. `test: add DOM fixtures and conversion regression suite`
3. `refactor: extract normalize/extract/convert/compose core`
4. `fix: normalize relative URLs and harden markdown output`
5. `fix: preserve full-page and picked content semantics`
6. `security: reduce host permissions and validate runtime messages`
7. `fix: harden popup/floating lifecycle and accessibility`
8. `test: add Chromium extension E2E and release checks`
9. `feat: add templates, site rules and advanced Markdown support`

每个 PR 只改变一个阶段边界；禁止在权限重构 PR 中同时混入大规模 UI 或转换格式变化。

## 5. 验收指标与发布门槛

### 正确性

- fixture 中的绝对链接、图片链接、代码块和表格输出符合预期；
- full 模式不删除用户要求的页面内容；
- main 模式在 Readability 失败时有可解释 fallback；
- Markdown 中不存在 `javascript:` 链接；
- 标题、frontmatter、预览和文件名来源一致；
- 图片移除开关不会残留空链接或破坏表格结构。

### 性能

- 典型 100 KB 文章转换在普通机器上 p95 小于 1 秒；
- 大页面有进度/取消/降级行为，不无限阻塞页面；
- 重复点击不会重复注入库或产生多个浮窗。

### 安全与隐私

- 默认安装不要求永久读取所有网站；
- 不包含远程脚本、`eval`、未验证的消息 payload；
- 所有 vendored 库有版本、来源、许可证记录；
- 隐私政策与实际 manifest、content script 行为一致。

### 发布

- CI 全绿；
- 本地 fixture E2E 全绿；
- Chrome/Edge 手工 smoke 通过；
- `git diff --check`、manifest 校验和可重现打包通过；
- CHANGELOG 明确列出权限变化、转换行为变化和已知限制。

## 6. 明确不做的事情

- 不在核心正确性完成前引入云端 AI、远程后端或统计服务；
- 不直接复制大型剪藏器的全部模板、批处理和外部集成系统；
- 不为了“未来可能使用”继续扩大 host permission；
- 不把公网 live test 作为唯一测试依据；
- 不在没有 fixture 和回滚策略的情况下修改 Markdown 格式。

## 7. 执行原则

先用 Stage 0 把问题变成可重复测试，再按 Stage 1–3 收敛核心质量、权限和发布能力，最后才进入 Stage 4 的产品扩展。每个阶段都以可验证交付物结束；若新功能不能复用统一的 `ClipResult` 管线，则先补架构边界，不直接堆到 Popup 或 content script 中。
