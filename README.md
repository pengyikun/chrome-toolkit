# Chrome Toolkit

A [Raycast](https://raycast.com) extension for working with Google Chrome on macOS — copy URLs, extract HTML and cookies, and jump between tab groups without leaving your keyboard.

## Commands

| Command | Description |
| --- | --- |
| **Copy Chrome URL** | Copy the URL of the active tab |
| **Copy Chrome Markdown Link** | Copy the active tab as a `[title](url)` Markdown link |
| **Extract Chrome HTML** | View and copy the body HTML of the active tab |
| **Extract Chrome Cookies** | Copy the active tab's cookies as JSON |
| **Search Chrome Cookie** | Search cookies by name and copy a name or value |
| **Search Chrome Tab Group** | Search tab groups and tabs, then switch to one |
| **Open Chrome Extensions / Settings / Flags** | Jump straight to the `chrome://` pages |
| **Open in Atlas** | Open the active tab in the ChatGPT Atlas browser |

## Requirements

- macOS with Google Chrome installed
- Permissions, granted on first use or in *System Settings → Privacy & Security*:
  - **Automation** → Raycast → Google Chrome (all commands)
  - **Accessibility** → Raycast (tab group search)
- For HTML and cookie extraction, enable **View → Developer → Allow JavaScript from Apple Events** in Chrome

Cookie extraction reads `document.cookie`, so HttpOnly cookies are not included.

## How it works

Chrome's AppleScript dictionary does not expose tab groups, so the extension combines two mechanisms:

- **AppleScript** for tab operations: URLs, titles, cookies, HTML, and switching tabs
- **macOS Accessibility API** (System Events) to read tab groups from Chrome's tab strip

Tab group detection parses Chrome's accessibility labels, which are English-only — it may not work with Chrome running in another language.

## Development

```bash
npm install
npm run dev        # hot reload in Raycast
npm test           # unit tests
npm run lint       # lint + format check
```

The extension is not on the Raycast Store; `npm run dev` installs it into your local Raycast.

## License

[MIT](LICENSE)
