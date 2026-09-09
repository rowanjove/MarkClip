# Third-party notices

页摘 bundles the following libraries locally. They do not make network requests as part of conversion.

## Mozilla Readability

- File: `lib/readability.js`
- Upstream: https://github.com/mozilla/readability
- License: Apache License 2.0
- Bundled SHA-256: `34dcab3d0832d0019f02990eed6b6124e029e8c32b9f0c6f2550544ff8dff174`
- The original license notice is retained in the bundled source file.

## Turndown

- File: `lib/turndown.js`
- Upstream: https://github.com/mixmark-io/turndown
- License: MIT
- Bundled SHA-256: `c97187f436d41638bf7acf346a39d9d42f2f2c02af18245a297c09e796f8e46f`
- The original license notice is retained in the bundled source file.

When updating either dependency, record the upstream version, source commit and hash in this file and rerun the conversion regression suite.

## v1.5 npm dependencies

The WXT/TypeScript/Vitest toolchain is used only at build/test time; runtime
dependencies are bundled locally and do not make conversion requests by
themselves.

| Package | Version | License | Source | Use |
| --- | --- | --- | --- | --- |
| `defuddle` | 0.19.3 | MIT | https://github.com/kepano/defuddle | local article extraction and metadata |
| `@mozilla/readability` | 0.6.0 | Apache-2.0 | https://github.com/mozilla/readability | extraction fallback |
| `turndown` | 7.2.4 | MIT | https://github.com/mixmark-io/turndown | HTML to Markdown |
| `fflate` | 0.8.3 | MIT | https://github.com/101arrowz/fflate | deterministic ZIP archives |
| `yaml` | 2.9.0 | ISC | https://github.com/eemeli/yaml | bounded Recipe YAML import/export |
| `wxt` | 0.21.4 | MIT | https://github.com/wxt-dev/wxt | cross-browser extension build |
| `typescript` | 7.0.2 | Apache-2.0 | https://github.com/microsoft/TypeScript | static type checking |
| `vitest` | 5.0.0 | MIT | https://github.com/vitest-dev/vitest | modern unit tests |
| `jsdom` | 26.1.0 | MIT | https://github.com/jsdom/jsdom | fixture DOM tests |
| `playwright` | 1.62.1 | Apache-2.0 | https://github.com/microsoft/playwright | browser E2E |
| `eslint` | 10.10.0 | MIT | https://github.com/eslint/eslint | static analysis |
| `prettier` | 3.9.6 | MIT | https://github.com/prettier/prettier | formatting |
| `@types/chrome` | 0.2.9 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped | browser API types |
| `@types/turndown` | 5.0.6 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped | Turndown types |
| `@types/node` | 26.5.0 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped | Node/WXT config types |

Versions above are the direct dependency baselines recorded for v1.5. The
lockfile remains authoritative for transitive packages; a dependency update
must rerun `npm run check:licenses` and refresh this table.
