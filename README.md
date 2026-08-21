# MarkClip - 网页转 Markdown

MarkClip 是一个 Chrome MV3 扩展，用来把网页正文、框选区域或整页内容转换成干净的 Markdown，方便复制到笔记、知识库或 AI Agent 对话里。

当前发布目标为支持 Manifest V3 的 Chromium 浏览器（Chrome、Edge 等）。Firefox/Safari 需要单独验证浏览器 API 和动态 content script 权限模型后再发布。

浏览器支持范围和发布前 smoke 清单见：[BROWSER_SUPPORT.md](./BROWSER_SUPPORT.md)。

它面向中文用户设计，适合把网页资料整理到 Obsidian、Notion、Markdown 文档，或投喂给 Claude、ChatGPT 等 AI 工具。

## 主要功能

- 智能提取网页正文，优先使用 Mozilla Readability。
- 支持框选一个或多个页面区域，只导出你需要的内容。
- 支持全页转换，适合网页归档。
- 一键复制 Markdown 到剪贴板。
- 一键下载 `.md` 文件。
- 可选打开 Obsidian URI，把当前内容写入默认 vault。
- 可选批量导出当前窗口中的多个网页标签页。
- 可在弹窗预览区直接编辑 Markdown 和文件标题后再复制或下载。
- 可选移除图片链接，减少 AI token 消耗。
- 可选将可访问图片内嵌为 data URL；失败时保留原链接。
- 自动添加 `title`、`source`、`date` frontmatter，方便溯源。
- 在普通网页显示可拖动悬浮面板，减少重复点击扩展按钮。
- 支持深色 / 浅色界面。

## 隐私说明

MarkClip 在浏览器本地完成网页提取和 Markdown 转换。

MarkClip 不上传网页内容，不收集浏览记录，不使用远程服务器处理页面数据，也不接入统计分析服务。

完整隐私政策见：[PRIVACY.md](./PRIVACY.md)。

高级用户可以参考：[SITE_RULES.md](./SITE_RULES.md) 配置站点级 selector 和 Markdown 模板。
导出目标和本地优先限制见：[EXPORT_TARGETS.md](./EXPORT_TARGETS.md)。

## 本地安装

1. 打开 Chrome 的 `chrome://extensions`。
2. 开启右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择本项目文件夹。

首次安装默认不会向所有网页注入脚本。打开扩展弹窗即可按需转换当前页面；如果开启“页面悬浮按钮”，扩展会单独请求可选的网页访问权限，关闭该功能后可以撤销动态注册。

## 开发与测试

运行检查和测试：

```bash
npm install
npm run check
```

`npm test` 包含纯函数、JSDOM 转换集成和 manifest 回归测试。浏览器 E2E 使用本地 fixture，避免依赖公网。

## English

MarkClip is a Chrome MV3 extension that converts the current web page, selected page regions, or full page content into clean Markdown locally in the browser.

It does not collect user data or upload page content to any server.
