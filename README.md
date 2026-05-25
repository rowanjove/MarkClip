# MarkClip - 网页转 Markdown

MarkClip 是一个 Chrome MV3 扩展，用来把网页正文、框选区域或整页内容转换成干净的 Markdown，方便复制到笔记、知识库或 AI Agent 对话里。

它面向中文用户设计，适合把网页资料整理到 Obsidian、Notion、Markdown 文档，或投喂给 Claude、ChatGPT 等 AI 工具。

## 主要功能

- 智能提取网页正文，优先使用 Mozilla Readability。
- 支持框选一个或多个页面区域，只导出你需要的内容。
- 支持全页转换，适合网页归档。
- 一键复制 Markdown 到剪贴板。
- 一键下载 `.md` 文件。
- 可选移除图片链接，减少 AI token 消耗。
- 自动添加 `title`、`source`、`date` frontmatter，方便溯源。
- 在普通网页显示可拖动悬浮面板，减少重复点击扩展按钮。
- 支持深色 / 浅色界面。

## 隐私说明

MarkClip 在浏览器本地完成网页提取和 Markdown 转换。

MarkClip 不上传网页内容，不收集浏览记录，不使用远程服务器处理页面数据，也不接入统计分析服务。

完整隐私政策见：[PRIVACY.md](./PRIVACY.md)。

## 本地安装

1. 打开 Chrome 的 `chrome://extensions`。
2. 开启右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择本项目文件夹。

## 开发与测试

运行测试：

```bash
node --test
```

## English

MarkClip is a Chrome MV3 extension that converts the current web page, selected page regions, or full page content into clean Markdown locally in the browser.

It does not collect user data or upload page content to any server.
