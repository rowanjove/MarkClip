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

## 权限理由（Chrome Web Store 隐私权规范 / Privacy Practices）

在 Chrome Web Store 开发者后台的「隐私权规范」（Privacy practices）标签页中，针对各项权限需填写的说明理由如下：

### 1. contextMenus
- **中文（可直接复制）**：
  > 用于在网页右键菜单中提供快捷摘录入口，允许用户通过鼠标右键快速将选中文本、链接或当前网页直接转换为 Markdown 并进行复制或保存，无需频繁点击顶部工具栏弹窗。
- **英文（English Justification）**：
  > Used to provide right-click context menu options that allow users to quickly clip selected text, links, or the entire web page directly to Markdown without opening the extension popup.

### 2. downloads
- **中文（可直接复制）**：
  > 用于在用户点击保存或导出时，将浏览器本地转换生成的 Markdown 文档（.md 文件）以及包含图片和元数据的离线资料包（ZIP 文件）下载并保存到用户的本地磁盘。
- **英文（English Justification）**：
  > Used to save and download the locally generated Markdown documents (.md files) and offline archive packages (ZIP files containing images and metadata) to the user's local disk upon their explicit request.

### 3. sidePanel
- **中文（可直接复制）**：
  > 用于在浏览器原生侧边栏（Side Panel）中展示常驻的 Markdown 实时预览、编辑器与批量任务队列，让用户在不遮挡当前网页且弹窗不自动关闭的情况下，对照浏览网页并编辑与保存摘录内容。
- **英文（English Justification）**：
  > Used to display the persistent Markdown editor, live preview, and batch clipping queue in Chrome's side panel, allowing users to review, edit, and organize clips side-by-side with web pages without the popup auto-dismissing.

