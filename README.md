# Chrome Helper

A [Raycast](https://raycast.com) extension with utilities for Google Chrome — copy URLs, grab Markdown links, extract page HTML, export/search cookies, search & switch tab groups, open Chrome pages, and open tabs in Atlas.

## Commands

| Command | Description | Mode |
| --- | --- | --- |
| **Copy Chrome URL** | Copy the URL of the active Chrome tab to the clipboard | No-view |
| **Copy Chrome Markdown Link** | Copy the active tab's URL and title as a `[title](url)` Markdown link | No-view |
| **Extract Chrome HTML** | Extract the body HTML of the active tab, display it, and copy to clipboard | View |
| **Extract Chrome Cookies** | Extract cookies from the active tab as a JSON array and copy to clipboard | View |
| **Search Chrome Cookie** | Search cookies by name from the active tab and copy name or value | View |
| **Search Chrome Tab Group** | Search tab groups (expanded, collapsed, and ungrouped) and switch to any tab | View |
| **Open Chrome Extensions** | Open the Chrome extensions page | No-view |
| **Open Chrome Settings** | Open the Chrome settings page | No-view |
| **Open Chrome Flags** | Open the Chrome flags page | No-view |
| **Open in Atlas** | Open the active Chrome tab URL in [ChatGPT Atlas](https://openai.com) browser | No-view |

## Prerequisites

- **macOS** — the extension communicates with Chrome via AppleScript and System Events
- **Google Chrome** installed and running
- **Raycast** must have Automation permission for Chrome
  _System Settings → Privacy & Security → Automation → Raycast → Google Chrome_
- **Search Chrome Tab Group** additionally requires Accessibility permission for Raycast
  _System Settings → Privacy & Security → Accessibility → Raycast_

> **Note:** Extract/Search Chrome Cookies uses `document.cookie`, which only exposes non-HttpOnly cookies. HttpOnly cookies are inaccessible from JavaScript by design.

## Architecture

The extension uses two complementary mechanisms to interact with Chrome:

- **Chrome AppleScript API** — for tab data (`title`, `URL`, `active tab index`), cookie/HTML extraction, and tab switching
- **System Events (macOS Accessibility API)** — for tab group detection, since Chrome's AppleScript dictionary does not expose tab groups natively

Tab group detection walks Chrome's accessibility tree to identify group names and map each group to Chrome tab indices. Tab switching uses Chrome's native `set active tab index`, which works reliably for both expanded and collapsed groups.

## Development

```bash
# Install dependencies
npm install

# Start development server (hot reload in Raycast)
npm run dev

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Lint
npm run lint

# Lint and auto-fix
npm run fix-lint

# Build for production
npm run build
```

## Project Structure

```
src/
├── copy-url.ts              # Copy URL command
├── copy-markdown-link.ts    # Copy Markdown link command
├── extract-html.tsx         # Extract HTML command (view)
├── extract-cookies.tsx      # Extract cookies command (view)
├── search-cookie.tsx        # Search cookie by name command (view)
├── search-tab-group.tsx     # Search tab groups & switch tabs (view)
├── open-chrome-extensions.ts # Open extensions page command
├── open-chrome-settings.ts  # Open settings page command
├── open-chrome-flags.ts     # Open flags page command
├── open-in-atlas.ts         # Open in Atlas command
├── lib/
│   ├── chrome.ts            # AppleScript + System Events interface to Chrome
│   ├── cookies.ts           # Cookie string parser
│   ├── errors.ts            # Typed error classes
│   ├── markdown.ts          # Markdown escaping utilities
│   ├── toast-error.ts       # Centralized error toast handler
│   └── __tests__/           # Unit tests for all lib modules
└── __mocks__/
    └── @raycast/api.ts      # Raycast API mock for testing
```

## Testing

Tests use [Vitest](https://vitest.dev) with `@raycast/api` mocked via a module alias. All library modules have comprehensive test coverage (92 tests across 6 test files).

```bash
npm test
```

## License

MIT
