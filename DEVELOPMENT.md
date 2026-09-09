# Development

项目使用 WXT + TypeScript + ES Modules，UI 保持 Vanilla DOM。核心模块位于 `src/core`，入口位于 `src/entrypoints`，共享契约位于 `src/shared`。

```bash
npm ci
npm run dev
npm run typecheck
npm run test:modern
npm run check:full
```

Chrome/Firefox 生产构建分别写入 `.output/chrome-mv3` 和 `.output/firefox-mv3`；`npm run package:modern` 生成安装包、源码包和 SHA256SUMS。保持 Recipe/Template 声明式，不把业务逻辑放入 Popup/Side Panel，不提交 `.output` 或 `dist`。
