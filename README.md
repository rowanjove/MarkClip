# 页摘（MarkClip / Yezhai）

页摘是本地优先的网页摘录与 Markdown 归档工具：网页只在用户设备上经过采集、正文识别、结构标准化，再输出 Markdown、Metadata、图片资源和可选 Snapshot。

当前版本：**v1.5.0**。产品名为「页摘」，仓库保留 `rowanjove/MarkClip`；`page2md:*` 旧设置键和 `markclip` 包名前缀继续保留一个兼容周期。

## 能力

- 正文、选区、整页和多段高亮批注；Smart（Recipe → Defuddle → Readability → Semantic）提取链。
- CommonMark、GFM、Obsidian 三种渲染 profile；表格、代码、数学、脚注、Callout、相对 URL 和懒加载图片标准化。
- Remote / Remove / Embed / Assets 四种图片模式；Assets 与 Metadata、Diagnostics、可选安全 Snapshot 组成独立 ZIP 资料包。
- 声明式 Site Recipe（内置与用户 JSON/YAML 导入），不执行 JavaScript；安全 Template 2.0（变量、filter、条件、循环）。
- 内置与可编辑自定义 Profile，把提取、渲染、图片、模板和导出目标组合成可复用预设。
- Popup 快速保存、Options 高级设置、Chrome Side Panel / Firefox Sidebar、右键菜单和快捷键。
- 批量任务队列支持并发、暂停、取消、失败重试；Clipboard、Markdown、Bundle、ZIP、Obsidian，以及 GitHub/WebDAV/Joplin Adapter。
- AI 后处理为显式可选能力，默认关闭；失败时保留原始 Markdown，密钥不进入诊断或设置导出。
- Chrome、Edge、Firefox 主路径；Safari 使用 Chrome MV3 输出通过 Safari Web Extension Converter 转换（见浏览器文档）。

## 隐私与权限

核心转换不需要账户或后端，默认仅使用 `activeTab` 按需读取当前页面；站点悬浮和全站悬浮分别请求当前 origin 或可选 `<all_urls>`，关闭时注销动态脚本并撤销权限。AI/远程 Exporter 只有在用户配置并主动调用时才发送数据。

详见：[PRIVACY.md](./PRIVACY.md)、[SECURITY.md](./SECURITY.md)、[BROWSER_SUPPORT.md](./BROWSER_SUPPORT.md)。

## 安装

1. 从 Release 下载 `markclip-1.5.0-chrome.zip` 或 `markclip-1.5.0-firefox.zip` 并解压。
2. 在浏览器扩展管理页开启开发者模式，选择“加载已解压的扩展程序”。
3. 升级旧版本时覆盖原目录并点击重新加载，不要先卸载，以保留本地设置；首次启动会自动迁移 `page2md:*` 与 `siteRules`。

## 开发与验证

```bash
npm ci
npm run check:full
npm run test:e2e:modern
npm run release:verify
```

`release:verify` 会执行 legacy 回归、TypeScript/Vitest、Chrome/Firefox 构建、权限/许可证/安全检查、Chromium 与稳定 Chrome smoke、现代包和 ZIP 校验。开发模式使用 `npm run dev`；产物位于 `dist/`（不提交）。

更多说明：[DEVELOPMENT.md](./DEVELOPMENT.md)、[RELEASE.md](./RELEASE.md)、[DIAGNOSTICS.md](./DIAGNOSTICS.md)、[EXPORT_TARGETS.md](./EXPORT_TARGETS.md)。

## 设计边界

页摘只负责“采集 → 结构化 → 导出”，不提供账户、云数据库、书签库、稍后读、协作空间、云端搜索或自动爬虫平台。
