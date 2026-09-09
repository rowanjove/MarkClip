# Yezhai / MarkClip v1.5

[简体中文](README.md) | [English](README.en.md)

Yezhai is a local-first web clipping and Markdown archiving tool. A page is captured, extracted, standardized and rendered on the device; the result is Markdown plus metadata, optional assets and an optional sanitized HTML snapshot.

v1.5 supports Chrome/Edge/Firefox, declarative JSON/YAML Recipes, Defuddle + Readability fallback, built-in and custom profiles, highlights, Side Panel/Firefox Sidebar, batch queues, deterministic ZIP bundles and opt-in exporters. AI post-processing is disabled by default and can never replace the original Markdown.

The extension requests `activeTab` for one-shot capture. Site and all-sites floating UI use separate optional permissions and dynamic content-script registration. No account, backend, telemetry or cloud library is required.

See [BROWSER_SUPPORT.md](./BROWSER_SUPPORT.md), [PRIVACY.md](./PRIVACY.md), [SECURITY.md](./SECURITY.md), [DEVELOPMENT.md](./DEVELOPMENT.md) and [RELEASE.md](./RELEASE.md).
