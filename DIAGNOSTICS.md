# Diagnostics

Side Panel 的 Diagnostics 标签展示本次 `ClipResult.diagnostics`：提取器、Recipe 命中、正文 selector、fallback 链、原始/提取节点与文本长度、移除原因、Metadata 来源、图片成功/失败统计和分阶段耗时。诊断留在本机，不上传、不包含 exporter/AI 密钥。

常见处理：受限页面改用普通 HTTP(S) 页面；正文为空尝试选区；Recipe 未命中会自动回退；图片失败保留原链接；`DOM_TOO_LARGE` 使用选区模式；导出认证失败只需检查对应目标凭据。
