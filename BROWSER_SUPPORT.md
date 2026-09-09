# 浏览器支持与发布 smoke

## v1.5 承诺

- Chrome 120+：MV3、`activeTab` 按需注入、Side Panel、动态站点脚本。
- Edge 120+：使用 Chromium 构建，需在目标稳定版完成一次加载解压包 smoke。
- Firefox 140+：MV3、Sidebar、`optional_permissions`、`browser_specific_settings` 和 `data_collection_permissions: none` 已纳入构建检查。
- Safari：没有宣称直接加载 Chrome 包；`src/browser/compatibility.ts` 固定能力边界，使用 Chrome MV3 输出经 Safari Web Extension Converter / Xcode 转换，Side Panel 映射为 Safari popover 或 app-extension window。转换后的签名和商店提交流程需在 macOS 验证。

## 权限一致性

默认不注册全站脚本。页面一次性使用 `activeTab`；指定站点使用 `https://host/*` 独立授权；全站使用用户主动授予的 `<all_urls>`。启动、安装、权限变更时会 reconcile 动态脚本，撤销权限会注销对应脚本。

## 自动门禁

```bash
npm run check:full
npm run test:e2e:modern
npm run test:e2e
npm run test:e2e:chrome
npm run package:modern
```

现代 Chrome/Firefox manifest、图标和权限由 `npm run check:modern-manifest` 检查；Safari 路线由 `npm run check:safari-route` 检查。公网 real-site smoke 只作为低频人工验证，不作为稳定快照。

## 人工清单

普通 HTTPS 页执行正文、选区、整页、复制、Markdown 下载、Assets ZIP、Highlights、Side Panel、Recipe 和 Diagnostics；再验证 chrome:// / PDF / 扩展页会给出可执行错误。刷新与 SPA 跳转后确认没有残留 toolbar、重复 bootstrap 或混用旧页面结果。Firefox 复核同一主路径，Edge 复核加载解压包与下载权限。
