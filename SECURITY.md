# Security model

- MV3 CSP 为 `script-src 'self'; object-src 'self'`；不加载远程脚本。
- 默认只有 `activeTab` 按需读取；站点与全站权限分离，动态脚本按授权注册/注销。
- 所有 HTML 先移除 script/style/iframe/form、事件属性和危险 URL；Recipe 与 Template 是无代码声明式数据。
- 图片有单图/总量/类型/20 秒（覆盖响应体）超时限制；ZIP 使用确定性本地压缩；Snapshot 仅在用户主动选择时生成，并移除可执行内容与自动加载资源。
- Diagnostics、metadata、导出配置不包含凭据；远程 Exporter/AI 仅在用户配置并主动调用时发送数据。
- 发现安全问题请勿公开贴出 token 或页面内容，先通过仓库维护者的安全渠道报告。
