# 导出目标

## Obsidian URI

弹窗中的“Obsidian”按钮使用本地 `obsidian://new` URI，把当前预览内容直接交给 Obsidian 默认 vault。高级用户可以在 `chrome.storage.local` 写入：

- `obsidianVault`：可选 vault 名称；为空时使用 Obsidian 默认 vault。
- `obsidianPathTemplate`：文件路径模板，支持 `{{title}}`、`{{date}}`、`{{site}}`，默认 `{{title}}.md`。

路径只保留安全文件名字符和层级，不执行脚本；该功能不会上传内容。

## 批量标签页

“批量导出”会临时请求可选网页访问权限，遍历当前窗口中最多 20 个 HTTP(S) 标签页，复用同一套 `ClipResult` 管线并逐个下载 Markdown。未开启悬浮按钮时，操作完成或失败后会撤销该权限；受限页面会跳过并在弹窗中报告失败数。

## 图片内嵌

“内嵌图片”默认关闭。开启后，页摘仅在当前页面上下文中尝试读取可访问的 HTTP(S) 图片并转成 data URL；跨域或失败的图片保留原链接。图片内嵌可能显著增大 Markdown 文件，应按需使用。
