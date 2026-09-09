# Export Adapter

所有导出器只消费统一 `ClipResult`，不重新解析网页。每个目标都返回 `ExportResult`，并把认证、冲突、取消和网络错误映射为可执行提示。

| 目标 | 结果 | 说明 |
| --- | --- | --- |
| Clipboard | Markdown | 用户主动复制 |
| Markdown | `.md` | 浏览器下载 |
| Bundle | `-bundle.zip` | Markdown、Metadata、Diagnostics、Assets 一起下载 |
| ZIP | `.zip` | 可选 `original.html` Snapshot 的完整资料包 |
| Obsidian | `obsidian://new` | 仅通过本机 URI，不经过页摘服务器 |
| GitHub | API commit | 需用户配置安全 endpoint/repo/token；默认冲突，显式选择 overwrite 才更新已有文件 |
| WebDAV | PUT | 需用户配置 endpoint 和凭据，路径经过 URL 编码 |
| Joplin | `/notes` | 需用户配置本地 Web Clipper API endpoint/token |

远程目标默认关闭；token/password 不进入 Diagnostics、日志或设置导出。浏览器无法原子下载目录，因此 Bundle 使用和 ZIP 相同的确定性归档格式。
