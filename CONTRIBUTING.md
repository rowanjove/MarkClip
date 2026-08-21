# 贡献指南

## 开发

```bash
npm ci
npm run check
npm run check:security
```

扩展可以通过 `chrome://extensions` 的“加载已解压的扩展程序”运行。默认不注册全站脚本；转换当前页面时从 Popup 按需注入。

## 修改转换逻辑

请先添加或更新 `test/fixtures` 和 JSDOM 集成断言，再修改提取或 Markdown 规则。涉及真实浏览器生命周期时，补充 `test/e2e` 测试；公网页面只用于非阻塞的人工或定时巡检。

## 提交要求

- 保持 `npm run check` 和 `npm run check:security` 通过；
- 不新增远程脚本、动态 `eval` 或未经说明的权限；
- 更新转换格式时同步更新 `CHANGELOG.md`；
- 更新 vendored Readability/Turndown 时同步更新 `THIRD_PARTY_NOTICES.md` 的版本来源和 hash；
- 一个 PR 聚焦一个阶段或一个行为变化，避免把权限、UI 和转换格式混在一起。
