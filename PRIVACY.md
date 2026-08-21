# MarkClip 隐私政策

最后更新：2026-08-22

MarkClip 是一个将网页内容转换为 Markdown 的 Chrome 扩展。所有转换过程都在用户本地浏览器中完成。

## 数据收集

MarkClip 不收集、存储、出售、传输或共享用户个人数据。

MarkClip 不会上传网页内容、浏览记录、生成的 Markdown 或剪贴板内容到任何服务器。

“内嵌图片”是可选功能：开启后，扩展会在当前网页上下文中请求图片并把可访问的栅格图片转换为本地 data URL；不会把图片上传到 MarkClip 或其他后端。跨域或失败的图片保留原链接。

“Obsidian”按钮会把用户主动选择的 Markdown 通过本机 `obsidian://` URI 交给已安装的 Obsidian 应用；该 URI 不经过 MarkClip 服务器。

## 本地处理

MarkClip 只在用户主动操作时读取当前网页内容，例如点击复制、下载、刷新，或使用页面悬浮面板。

网页提取、正文识别和 Markdown 转换都在用户设备本地完成。

## 权限用途

MarkClip 仅为核心 Markdown 导出功能使用 Chrome 扩展权限：

- `activeTab`：在用户主动调用扩展时访问当前标签页。
- `scripting`：向当前网页注入本地扩展脚本和打包在扩展内的转换库。
- `clipboardWrite`：当用户点击复制时，将生成的 Markdown 写入剪贴板。
- `storage`：保存本地偏好设置，包括主题、导出模式、是否移除图片链接、是否内嵌图片、Obsidian 路径模板、悬浮按钮显示状态和位置。
- `optional_host_permissions`：仅当用户主动开启“页面悬浮按钮”或点击“批量导出”时，允许访问普通网页；关闭悬浮功能后可以撤销该授权。

MarkClip 默认不注册全站 content script。用户点击扩展按钮后，扩展只按需向当前标签页注入本地转换脚本。

## 第三方服务

MarkClip 不使用远程后端，不接入第三方统计分析服务。

扩展内打包的第三方库，例如 Turndown 和 Mozilla Readability，只在本地浏览器中运行。

## 联系方式

如有隐私相关问题，请通过本 GitHub 仓库联系项目维护者。

---

# MarkClip Privacy Policy

Last updated: 2026-05-26

MarkClip converts web page content to Markdown locally in your browser.

MarkClip does not collect, store, sell, transmit, or share personal data. It does not upload page content, browsing history, generated Markdown, or clipboard contents to any server.
