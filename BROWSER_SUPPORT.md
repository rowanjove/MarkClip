# 浏览器支持与发布 smoke

## 当前承诺

- Chrome 120+：目标浏览器，Manifest V3、动态 content script 和可选 host permission 已通过本地 Chromium E2E。
- Edge 120+：使用 Chromium 同一套扩展 API，发布前需在稳定版 Edge 手工完成下列 smoke。
- Firefox/Safari：暂不作为发布承诺；动态脚本注册、权限模型和 MV3 API 需要独立适配与构建。

## 发布前手工清单

1. 普通 HTTPS 页面：正文、整页、选择区域、复制和下载各执行一次。
2. 页面包含相对链接、懒加载图片、代码块、表格和公式：确认 Markdown 中 URL 已绝对化且没有 `javascript:`。
3. Chrome Web Store/Edge 内置页、`chrome://`、扩展页和 PDF：确认弹窗显示可解释错误，不出现无限 loading。
4. 开启悬浮按钮后刷新和切换 SPA 路由：确认只出现一个面板；关闭开关后撤销权限并移除面板。
5. 关闭弹窗、重复点击转换、页面销毁后重试：确认没有重复注入或未处理异常。

## 自动化门禁

```bash
npm run check
npm run check:security
$env:RUN_BROWSER_E2E='1'; npm run test:e2e
$env:RUN_CHROME_CDP_E2E='1'; npm run test:e2e:chrome
$env:RUN_LIVE_SMOKE='1'; npm run test:live
```

浏览器 E2E 默认使用 Playwright 管理的 Chromium，避免依赖开发机是否安装 Chrome。较新的官方 Chrome branded build 会忽略 `--load-extension` 侧载参数，因此 `CHROME_PATH` 只适用于明确支持侧载的 Chromium/Chrome for Testing；稳定版 Chrome/Edge 请按上面的手工清单，在 `chrome://extensions` 中开启开发者模式并使用“加载已解压的扩展程序”验证。

`test:e2e:chrome` 会启动隔离的稳定 Chrome profile，通过官方 CDP `Extensions.loadUnpacked` 加载工作树，不修改用户现有浏览器 profile；该路径用于可重复的稳定版 Chrome smoke。

最近一次验收（2026-08-31）：Playwright Chromium E2E、稳定版 Chrome CDP smoke 和公开页面 live smoke 均通过；当前环境未安装 Edge，因此 Edge 仍需在目标机器复核。

参考：[Playwright Chrome 扩展测试说明](https://playwright.dev/docs/chrome-extensions)、[Chromium Extensions 关于移除 branded Chrome 侧载参数的说明](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/1-g8EFx2BBY)。
