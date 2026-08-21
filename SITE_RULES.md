# 站点规则

MarkClip 支持把站点级规则保存在 `chrome.storage.local` 的 `siteRules` 数组中。规则只使用精确域名/子域匹配和 CSS selector，不执行任意脚本。

示例：

```json
[
  {
    "host": "docs.example.com",
    "selector": "main.article-body",
    "titleSelector": "h1",
    "removeImages": false,
    "localizeImages": false,
    "template": "---\ntitle: \"{{title}}\"\nsource: \"{{url}}\"\n---\n\n{{content}}"
  }
]
```

规则字段：

- `host`：域名，支持 `example.com` 和 `*.example.com`。
- `selector`：正文 CSS selector；匹配内容不足时自动回退到通用提取。
- `titleSelector`：可选的标题 selector。
- `removeImages`：是否对该站点默认移除图片。
- `localizeImages`：是否尝试把可访问的图片内嵌为 data URL；失败时保留原链接。
- `template`：可选 Markdown 模板，支持 `{{title}}`、`{{url}}`、`{{date}}`、`{{source}}`、`{{content}}`，以及 `safe_name`、`lower`、`upper` 过滤器。

规则示例仅用于开发和高级用户配置；默认情况下不写入任何站点规则。
