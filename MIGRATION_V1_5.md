# v1.4 → v1.5 migration

首次启动读取旧 `page2md:*`、`obsidianVault`、`obsidianPathTemplate` 和 `siteRules`，校验后写入 `yezai:settings:v2`，并记录 `yezai:settings:migration:v2` 完成时间。主题、模式、图片选项、浮窗偏好、Obsidian 配置和规则都会保留；旧键不会主动删除，以便一个大版本周期内回退。

旧规则会转换成 `migrated-*` Recipe。无法验证的项不删除，而是禁用并在 Options 显示 warning。升级后若撤销站点/全站权限，动态脚本会同步注销；不会默认请求 `<all_urls>`。
