# Yezhai · 页摘 — Web to Markdown

[简体中文](README.md) | [English](README.en.md)

Yezhai is a Chrome and Edge extension that converts an article, selected page regions, or a full page into Markdown. Copy text, download a file, or send it to a note vault through Obsidian URI. Extraction and conversion run locally in your browser without uploading page content.

Previously named MarkClip, the project remains in the `rowanjove/MarkClip` repository. The current version is **v1.4.0**. The interface is primarily Chinese.

[Download v1.4.0](https://github.com/rowanjove/MarkClip/releases/download/v1.4.0/markclip-1.4.0.zip) · [Changelog](CHANGELOG.md) · [Report an issue](https://github.com/rowanjove/MarkClip/issues)

![Yezhai light popup with scope selection, Markdown preview, and save controls](visual-regression/popup-light.png)

## Install and use

1. Download the release ZIP and extract it to a permanent directory.
2. Open `chrome://extensions/` in Chrome or `edge://extensions/` in Edge.
3. Enable Developer mode and choose Load unpacked.
4. Select the directory containing `manifest.json`, not the ZIP file.
5. Open a web page, click the extension icon, and choose article, selected regions, or full page.
6. Review the output, optionally edit the title and Markdown, then copy or download.

To upgrade an unpacked installation, back up its directory, extract the new version into that same directory, reload the extension, and refresh open web pages. Do not uninstall the extension first, as doing so can remove local settings.

Developers can also clone the repository and load its directory directly:

```bash
git clone https://github.com/rowanjove/MarkClip.git
cd MarkClip
```

## Extraction and export

- Article extraction prioritizes Mozilla Readability for articles and tutorials.
- Region selection supports one or more page regions.
- Full-page conversion supports page archiving; results still depend on page structure.
- Copy Markdown, download a `.md` file, or write to the default vault through Obsidian URI.
- Batch-export multiple tabs in the current window.
- Edit Markdown and the file title in the preview.
- Include `title`, `source`, and `date` frontmatter for traceability.
- Keep image links, remove them, or attempt to embed images as data URLs; failed fetches retain the original links.
- Use light or dark themes and a draggable in-page launcher.

![Yezhai in-page extraction controls](visual-regression/floating-light.png)

Screenshots use local demo pages without user data. They do not establish that the entire export workflow has passed acceptance testing.

## Permissions and privacy

Yezhai does not collect browsing history, process pages on a remote server, or use analytics services. Embedding images requires fetching accessible resources from their source; local processing does not mean every operation is network-free.

The extension does not inject scripts into every page on first installation. Opening the popup enables on-demand conversion of the current page. Enabling the floating launcher requests optional site access; disabling it allows the dynamic registration to be revoked.

See the [privacy policy](PRIVACY.md) for details.

## Compatibility and limitations

The current release targets Chromium browsers supporting Manifest V3, including Chrome and Edge. Firefox and Safari have not completed equivalent API and permission-model verification, so the same installation procedure is not a supported guarantee.

Export quality depends on page DOM, accessible images, and loaded content. Embedded image rendering depends on the destination Markdown tool. Obsidian URI export requires a local URI handler. This English README does not imply an English-localized interface.

[Browser support](BROWSER_SUPPORT.md) · [Export targets and limits](EXPORT_TARGETS.md) · [Site rules and templates](SITE_RULES.md)

## Local development

No build step is required to load the unpacked extension. Development tools require Node.js and npm. Install locked dependencies and run:

```bash
npm ci
npm run check
```

Checks cover syntax, the manifest, and regression tests. Browser E2E tests use local fixtures; real websites require separate verification.

| Command | Purpose |
| --- | --- |
| `npm run test:e2e` | Run browser E2E tests |
| `npm run check:security` | Check third-party dependencies and run a dependency audit |
| `npm run package` | Generate a release package in `dist/` |
| `npm run icons:generate` | Regenerate icons |
| `npm run store-assets:generate` | Regenerate store assets |
| `npm run ui-review:capture` | Capture UI screenshots |

Screenshots and browser tests require Playwright Chromium, installable with `npx playwright install chromium`. After code changes, reload the extension and refresh the target page. Keep `dist/` release artifacts out of source commits.

## Documentation and contributions

[Contribution guide](CONTRIBUTING.md) · [Design guide](DESIGN_GUIDE.md) · [Store assets](STORE_LISTING.md) · [Visual review](VISUAL_REVIEW.md)

Supporting documents are primarily in Chinese. Internal `MarkClip*` namespaces, `page2md:*` setting keys, and `markclip` package names remain for compatibility with existing settings and tools.

## License

The project uses the [MIT License](LICENSE). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for dependency licenses and attribution.
