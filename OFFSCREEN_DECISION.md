# Offscreen conversion decision

The first implementation keeps Readability and Turndown in the page's isolated content-script world instead of adding a Chrome offscreen document.

Reasons:

- The extension already needs a DOM clone from the active page; moving only the converter would add serialization and lifecycle complexity.
- The new node/character thresholds and conversion deadline prevent unbounded work.
- Conversion now yields between chunks and reports `extractMs`, `convertMs` and `totalMs` for real-world measurement.
- An offscreen document should be introduced only if telemetry or a reproducible fixture shows unacceptable long tasks after these guards.

Revisit trigger: p95 conversion above 1 second for the 100 KB fixture, or a reproducible page-main-thread long task above 200 ms. If triggered, add an offscreen document with a dedicated message protocol and retain the existing integration fixtures.
