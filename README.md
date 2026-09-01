# 页摘 · Yezhai — 网页转 Markdown

[简体中文](README.md) | [English](README.en.md)

页摘是一款 Chrome／Edge 扩展，可将网页正文、选定区域或整页内容转换为 Markdown。你可以复制文本、下载文件，或通过 Obsidian URI 保存到笔记库。提取和格式转换在浏览器本地完成，不上传页面内容。

项目曾使用 MarkClip 名称，仓库地址仍为 `rowanjove/MarkClip`。当前版本为 **v1.4.0**，界面以中文为主。

[下载 v1.4.0](https://github.com/rowanjove/MarkClip/releases/download/v1.4.0/markclip-1.4.0.zip) · [更新记录](CHANGELOG.md) · [报告问题](https://github.com/rowanjove/MarkClip/issues)

![页摘浅色弹窗：范围选择、Markdown 预览和保存操作](visual-regression/popup-light.png)

## 安装与使用

1. 下载并解压安装 ZIP 到固定目录。
2. 在 Chrome 打开 `chrome://extensions/`，或在 Edge 打开 `edge://extensions/`。
3. 开启“开发者模式”，点击“加载已解压的扩展程序”。
4. 选择包含 `manifest.json` 的目录，不要直接选择 ZIP 文件。
5. 打开需要摘录的网页，点击扩展图标，选择正文、区域或整页。
6. 检查预览，按需修改标题和 Markdown，再复制或下载。

升级已解压版本时，先备份原目录，再将新版本解压到原目录，在扩展管理页点击“重新加载”，并刷新已打开的网页。不要先卸载扩展，以免删除本地设置。

开发者也可以克隆仓库后直接加载项目目录：

```bash
git clone https://github.com/rowanjove/MarkClip.git
cd MarkClip
```

## 提取与导出

- 正文提取优先使用 Mozilla Readability，适合文章和教程。
- 区域选择支持一个或多个页面区域，适合只保留部分资料。
- 整页转换适合页面归档，但结果仍取决于网页结构。
- Markdown 可复制、下载为 `.md`，或通过 Obsidian URI 写入默认 vault。
- 可批量导出当前窗口的多个网页标签页。
- 预览区允许编辑 Markdown 和文件标题。
- 自动添加 `title`、`source`、`date` frontmatter，便于追溯来源。
- 图片可保留链接、移除链接，或尝试内嵌为 data URL；获取失败时保留原链接。
- 支持浅色／深色界面，以及可拖动的页面悬浮入口。

![页摘页面悬浮入口](visual-regression/floating-light.png)

截图来自本地演示页面，不含用户数据。截图不是完整导出链路的验收证明。

## 权限与隐私

页摘不收集浏览记录，不使用远程服务器处理页面，也不接入统计分析服务。图片内嵌需要从图片来源获取可访问的资源；本地处理不等于所有操作都不发出网络请求。

首次安装不会向所有网页注入脚本。打开弹窗可按需转换当前页面；开启“页面悬浮按钮”时，扩展会请求可选的网页访问权限。关闭该功能后可以撤销动态注册。

完整说明见 [隐私政策](PRIVACY.md)。

## 支持范围与限制

当前发布目标是支持 Manifest V3 的 Chromium 浏览器，包括 Chrome 和 Edge。Firefox、Safari 尚未完成对应浏览器 API 和权限模型验证，不能按同样步骤保证可用。

导出质量受页面 DOM、可访问图片和内容加载状态影响。图片内嵌的显示效果取决于目标 Markdown 工具；通过 Obsidian URI 导出需要本机具备相应处理程序。英文文档不代表扩展界面已完成英文本地化。

[浏览器支持](BROWSER_SUPPORT.md) · [导出目标与限制](EXPORT_TARGETS.md) · [站点规则与模板](SITE_RULES.md)

## 本地开发

项目无需构建即可作为已解压扩展加载。开发工具需要 Node.js 和 npm；安装锁定依赖后运行：

```bash
npm ci
npm run check
```

检查包含语法、manifest 和回归测试。浏览器 E2E 使用本地 fixture；实际使用网页仍需单独验证。

| 命令 | 用途 |
| --- | --- |
| `npm run test:e2e` | 运行浏览器 E2E 测试 |
| `npm run check:security` | 第三方依赖检查与依赖审计 |
| `npm run package` | 在 `dist/` 生成发布包 |
| `npm run icons:generate` | 更新图标 |
| `npm run store-assets:generate` | 更新商店素材 |
| `npm run ui-review:capture` | 重拍 UI 截图 |

截图和浏览器测试需要 Playwright Chromium，可通过 `npx playwright install chromium` 安装。改动扩展代码后，在浏览器重新加载扩展并刷新目标网页。不要将 `dist/` 发布产物提交为源码。

## 文档与贡献

[贡献指南](CONTRIBUTING.md) · [设计规范](DESIGN_GUIDE.md) · [商店素材](STORE_LISTING.md) · [视觉验收记录](VISUAL_REVIEW.md)

内部 `MarkClip*` 命名空间、`page2md:*` 设置键和 `markclip` 打包名称暂时保留，以兼容既有设置和工具。

## 许可

项目采用 [MIT License](LICENSE)。第三方组件的许可和署名见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
