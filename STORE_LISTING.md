# 页摘商店发布素材

## 名称与一句话说明

- 中文名称：**页摘 - 网页摘录为 Markdown**
- 中文短说明：**在浏览器本地把网页正文、选择区域或整页内容保存为 Markdown。**
- 英文副标：**Yezhai · Web to Markdown**
- English short description: **Save page content as clean Markdown locally in your browser.**

## 商店长说明

页摘是一个本地优先的 Chrome 扩展，用来摘录网页正文、选择区域或整页内容并转换为 Markdown。你可以先在预览区编辑内容和文件标题，再复制到剪贴板或保存为 `.md` 文件。

- 正文、选择区域和整页三种范围；
- 可选移除图片链接或内嵌可访问图片；
- 支持 Obsidian URI 和当前窗口批量保存；
- 页面快捷入口可拖动，面板不会超出视口；
- 不上传网页内容，不依赖远程 AI 或统计服务。

## 资产清单

### 图标

| 文件 | 用途 |
| --- | --- |
| `icons/icon16.png` | 工具栏小尺寸图标 |
| `icons/icon48.png` | 扩展管理页和快捷入口 |
| `icons/icon128.png` | 商店主图标候选 |
| `store-assets/icon-mono-128.png` | 单色背景/深色印刷候选 |
| `store-assets/icon-on-light-128.png` | 浅色背景候选 |
| `store-assets/icon-on-dark-128.png` | 深色背景候选 |
| `store-assets/icon-preview-256.png` | 摘录图标放大预览 |

### 截图

| 文件 | 内容 |
| --- | --- |
| `visual-regression/popup-light.png` | Popup 浅色默认主题，360×600 |
| `visual-regression/popup-dark.png` | Popup 深色主题，360×600 |
| `visual-regression/floating-light.png` | 浅色网页背景上的页面快捷入口 |
| `visual-regression/floating-dark.png` | 深色网页背景上的页面快捷入口 |

截图由 `npm run ui-review:capture` 生成，图标由 `npm run icons:generate` 和 `npm run store-assets:generate` 生成。发布前应确认截图中没有用户数据、外部站点品牌或临时调试信息。

## 发布前检查

- [x] 中文名、副标题和英文副标已定稿；
- [x] 图标具备透明、单色、浅色背景和深色背景版本；
- [x] 16/48/128 图标尺寸有自动化测试；
- [x] Popup 和浮窗有深浅主题截图；
- [x] 截图不展示网页内容上传、云端处理或 AI 生成承诺；
- [ ] 在目标商店后台上传后复核裁切、缩略图和实际展示对比度；
- [ ] 发布前由另一位使用者完成一次真实操作验收。
