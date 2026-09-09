# Changelog

## 1.5.0 - 2026-09-09

统一第二代架构升级：

- WXT + TypeScript + ES Modules，Chrome/Edge/Firefox manifest 与 Safari Converter 兼容路线。
- 页面/站点/全站三级权限、动态脚本 reconcile、Options/Side Panel、右键菜单和快捷键。
- Defuddle → Readability → Semantic Smart 提取链，Recipe 2.0、Metadata Pipeline 与 Diagnostics。
- URL/代码/表格/数学/脚注/Callout 标准化；CommonMark/GFM/Obsidian profile 与可编辑自定义 Profile。
- Recipe 支持 JSON/YAML 文本或文件导入导出，Profile 与 Recipe 均经过声明式 schema 验证。
- Remote/Remove/Embed/Assets 图片模式、并发下载/去重/大小超时限制、Metadata/Diagnostics/Snapshot ZIP。
- 安全 Template 2.0、批量队列暂停/取消/重试、Highlights、高级 Export Adapter 和可选 AI Provider。
- 增加现代 Vitest/fixture、跨浏览器构建、权限/许可证/security/package/release gate。

## 1.4.0 - 2026-09-01

### 2026-09-01 · 页摘界面与稳定性更新

独立发布 v1.4.0 安装包，保留历史 v1.3.0 Release；产品名改为“页摘”，包名前缀继续使用 `markclip`。

- 重新设计“页摘”图标：用开放页面轮廓与向右移出的金色摘录替代通用折角纸张，同步工具栏、浮窗和商店图标资源。
- 对外名称改为“页摘”，更新 16/48/128 图标，并保留旧内部命名空间与本地设置键以兼容升级。
- 重做 Popup、页面快捷入口和选择区域提示，去掉渐变光晕、过度圆角和泛化 AI 文案；补齐滚动、焦点、Escape 关闭和忙碌状态。
- 增加品牌与界面规范，记录颜色、尺寸、交互和无障碍验收基线，并统一扩展管理页与工具栏图标声明。
- 修复设置改变后复用旧结果、编辑器快捷键被拦截、浮窗偏好不同步、页面 `data-action` 误触发和浮窗出屏问题。
- 加固大页面分块转换、SPA 导航来源快照、懒加载/最大图片选择和图片内嵌超时/大小限制。
- 修复异步准备期间 SPA 跳转导致来源与内容混用、窄视口浮窗面板越界、隐藏与初始化竞争导致入口复现，以及网页无法加载浮窗图标；仅将 `icons/icon48.png` 声明为网页可访问资源，并补充回归测试。
- README 展示新图标、深浅主题弹窗与浮窗截图，并补充素材生成方式、测试范围和历史 Release 区别；详细验收记录见 `VISUAL_REVIEW.md`。

## 1.3.0 - 2026-08-22

- Reduced default page access by removing permanent host permissions and static all-page scripts.
- Added optional, user-enabled registration for the floating UI.
- Normalized relative links, image URLs, lazy image attributes and `srcset` values.
- Hardened fenced code blocks, task lists, strikethrough and basic GFM tables.
- Added JSDOM conversion integration tests, message validation and manifest checks.
- Added optional Obsidian URI export, current-window batch export and local image embedding.
- Added aligned GFM tables, conversion diagnostics and a user-visible cancellation path.

## 1.2.0

- Initial MarkClip release with main-content, full-page and picked-region Markdown export.
