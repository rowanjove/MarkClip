# 可选 AI Post Processor

AI 默认关闭，核心提取不依赖 AI。支持 OpenAI-compatible `/chat/completions` 和本地 Ollama `/api/generate` Provider；请求使用 JSON-only、temperature 0 和超时，结果按 operation schema 校验。

可选操作：summary、tags、keywords、entities、translation、qa。失败、超时、401、429 或非法 JSON 都只产生 warning，原始 `ClipResult.markdown` 不被破坏。密钥仅在用户勾选“记住 API Key”时保存在本地设置分区；否则保存时会丢弃，需要再次输入。密钥不写入 Diagnostics、ZIP 或日志。关闭 AI 时不会创建 Provider，也不会产生 AI 网络请求。
