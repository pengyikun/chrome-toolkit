# Chrome Toolkit

A [Raycast](https://raycast.com) extension that makes it easier to work with Google Chrome on macOS.

Copy URLs, grab Markdown links, pull out page HTML or cookies, jump between tab groups, and more — all from Raycast.

## What it does

- **Copy URL / Markdown link** from the active tab
- **Extract HTML** or **cookies** from the current page
- **Search cookies** by name
- **Search and switch tab groups** (expanded, collapsed, or ungrouped)
- **Open Chrome pages** like Extensions, Settings, or Flags
- **Open in Atlas** — send the current tab to ChatGPT Atlas

## Setup

1. macOS with Google Chrome installed
2. Grant Raycast **Automation** permission for Chrome:
   *System Settings → Privacy & Security → Automation → Raycast → Google Chrome*
3. For tab group search, also grant **Accessibility** permission:
   *System Settings → Privacy & Security → Accessibility → Raycast*

> Cookie extraction uses `document.cookie`, so HttpOnly cookies won't show up — that's a browser security thing, not a limitation of this extension.

## How it works

Chrome doesn't expose tab groups through its AppleScript API, so this extension uses two approaches:

- **AppleScript** for standard tab operations (URL, title, cookies, HTML, switching tabs)
- **macOS Accessibility API** (System Events) to walk Chrome's UI tree and detect tab groups

## Development

```bash
npm install
npm run dev        # hot reload in Raycast
npm test           # run tests
npm run lint       # lint
```

## License

[MIT](LICENSE)
