# Site Recipes 2.0

Recipe 是声明式适配器，不执行脚本、`eval`、远程代码或任意用户 JavaScript。Options 支持 JSON/YAML 文本或文件导入、验证与导出；两种格式均经过同一 schema 与安全约束检查。

```json
{
  "id": "example-article",
  "name": "Example Article",
  "version": 1,
  "priority": 50,
  "matches": [{"host": "example.com", "pathRegex": "^/article/"}],
  "capture": {"selector": "article", "fallback": "smart"},
  "exclude": ["nav", ".share"],
  "metadata": {"siteName": {"value": "Example"}},
  "transform": {"preserveTables": true, "preserveCode": true, "preserveCallouts": true, "imageMode": "remote"}
}
```

匹配支持 host/wildcard host、path/pathRegex、query、selectorPresent 和 metaPresent。Options 会先做 schema、selector、host/path 和危险字段检查；无效规则不覆盖旧配置。内置 Recipe 位于 `src/core/recipes/builtin.ts`，用户 Recipe 会在可诊断的 fallback 链中运行。
