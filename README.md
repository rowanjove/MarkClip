# MarkClip - Web to Markdown

MarkClip is a Chrome MV3 extension that converts web pages into clean Markdown for notes, archives, and AI agent input.

## Features

- Extract the main article content with Readability.
- Pick one or more page regions and export only those areas.
- Export the full page when needed.
- Copy Markdown to the clipboard or download it as a `.md` file.
- Optionally remove image links to reduce token usage.
- Add frontmatter with title, source, and date.
- Use a draggable floating panel on ordinary web pages.
- Switch between light and dark UI themes.

## Privacy

MarkClip runs locally in the browser. It does not upload page content to a server and does not collect user data.

See [PRIVACY.md](./PRIVACY.md) for the full privacy policy.

## Development

Load the project folder as an unpacked extension from `chrome://extensions`.

Run tests with:

```bash
node --test
```
