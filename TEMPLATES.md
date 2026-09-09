# Template 2.0

模板只读取 `ClipMetadata` 和 `content`，不执行 JavaScript。支持变量 `{{title}}`、`{{url}}`、`{{canonicalUrl}}`、`{{authors}}`、`{{tags}}`、`{{capturedAt}}`、`{{content}}`，以及 `lower`、`upper`、`trim`、`safe_name`、`join`、`replace`、`default`、`yaml`、`json`、`date` filter。

```text
---
title: {{ title | yaml }}
tags:
{% for tag in tags %}- {{ tag | yaml }}
{% endfor %}---

{{ content }}
```

条件支持 `if tags`、`if authors.size > 0` 等有限比较；循环最多 100 项，模板 200k、输出 1MB，危险关键字和属性访问会被拒绝。
