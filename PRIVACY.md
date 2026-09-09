# 页摘隐私政策

最后更新：2026-09-09

页摘默认在浏览器本地完成网页读取、Defuddle/Readability 识别、标准化、Markdown 渲染和 ZIP 生成，不需要账户、后端或遥测。网页内容、浏览历史、Markdown、剪贴板和诊断不会自动上传。

## 权限

- `activeTab`：用户主动点击扩展时读取当前页。
- `scripting`：按需注入本地 bootstrap；不会静态注入所有网页。
- `storage`：保存设置、Recipe、模板和权限偏好。
- `contextMenus` / `commands`：用户主动触发右键菜单或快捷键。
- `downloads`：用户主动保存 Markdown 或 ZIP。
- `optional_host_permissions`（Chrome）/`optional_permissions`（Firefox）：仅在用户开启站点或全站悬浮、明确进行需要多页读取的批量操作，或主动启用 AI 并配置服务地址时请求；关闭时撤销并注销动态脚本。

## 可选网络行为

Remote 图片模式只保留链接；Embed/Assets 模式会由当前网页上下文请求图片，图片不会发送给页摘服务器。配置并主动调用 GitHub、WebDAV、Joplin 或 AI Provider 时，数据会按目标服务协议发送；这些能力默认不配置、不调用。AI 默认关闭，关闭时零 AI 请求；AI 失败保留原始 Markdown。

## 凭据与诊断

Exporter/API 密钥只在用户明确选择记住时保存在本地设置分区，界面默认掩码；不记住时保存设置会丢弃密钥，需要再次输入。Diagnostics、ZIP 的 `metadata.json` 和设置导出都不会包含凭据。导出设置时，凭据必须由用户单独确认（当前 UI 默认不提供凭据导出）。

## 资料包

Snapshot 是用户主动选择的附件，生成前会去除脚本、样式、嵌入媒体、自动加载资源和事件属性，并有大小上限；Markdown 始终是主数据。ZIP 还包括 `article.md`、`metadata.json`、`diagnostics.json` 与图片资源。

完整安全约束见：[SECURITY.md](./SECURITY.md)。
