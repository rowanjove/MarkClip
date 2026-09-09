# Release v1.5

发布前必须在干净依赖上运行：

```bash
npm ci
npm run release:verify
```

门禁覆盖 legacy 回归、TypeScript/Vitest、Chrome/Firefox 构建与 manifest 权限、Safari 路线、npm audit、许可证、Chromium E2E、稳定 Chrome CDP smoke、现代 E2E、ZIP/package smoke。产物为 `dist/markclip-1.5.0-chrome.zip`、`markclip-1.5.0-firefox.zip`、`markclip-1.5.0-source.zip` 和 `SHA256SUMS.txt`。

不自动 commit、tag、上传或部署。人工复核 Edge 和 macOS Safari 转换后的签名包后，才可创建 GitHub Release。
