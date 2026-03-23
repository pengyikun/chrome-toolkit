# Chrome Helper

A [Raycast](https://raycast.com) extension with utilities for Google Chrome — copy URLs, grab Markdown links, extract page HTML, export cookies, and open tabs in Atlas.

## Commands

| Command | Description | Mode |
| --- | --- | --- |
| **Copy Chrome URL** | Copy the URL of the active Chrome tab to the clipboard | No-view |
| **Copy Chrome Markdown Link** | Copy the active tab's URL and title as a `[title](url)` Markdown link | No-view |
| **Extract Chrome HTML** | Extract the body HTML of the active tab, display it, and copy to clipboard | View |
| **Extract Chrome Cookies** | Extract cookies from the active tab as a JSON array and copy to clipboard | View |
| **Open in Atlas** | Open the active Chrome tab URL in [ChatGPT Atlas](https://openai.com) browser | No-view |

## Prerequisites

- **macOS** — the extension communicates with Chrome via AppleScript
- **Google Chrome** installed and running
- **Raycast** must have Automation permission for Chrome  
  _System Settings → Privacy & Security → Automation → Raycast → Google Chrome_

> **Note:** Extract Chrome Cookies uses `document.cookie`, which only exposes non-HttpOnly cookies. HttpOnly cookies are inaccessible from JavaScript by design.

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
├── copy-url.ts            # Copy URL command
├── copy-markdown-link.ts  # Copy Markdown link command
├── extract-html.tsx       # Extract HTML command (view)
├── extract-cookies.tsx    # Extract cookies command (view)
├── open-in-atlas.ts       # Open in Atlas command
├── lib/
│   ├── chrome.ts          # AppleScript interface to Chrome
│   ├── cookies.ts         # Cookie string parser
│   ├── errors.ts          # Typed error classes
│   ├── markdown.ts        # Markdown escaping utilities
│   ├── toast-error.ts     # Centralized error toast handler
│   └── __tests__/         # Unit tests for all lib modules
└── __mocks__/
    └── @raycast/api.ts    # Raycast API mock for testing
```

## Testing

Tests use [Vitest](https://vitest.dev) with `@raycast/api` mocked via a module alias. All library modules have comprehensive test coverage.

```bash
npm test
```

## License

MIT
