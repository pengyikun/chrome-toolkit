# Chrome Toolkit

A [Raycast](https://raycast.com) extension for working with Google Chrome on macOS — copy URLs, extract HTML and cookies, and jump between tab groups without leaving your keyboard.

## Commands

| Command                                       | Description                                           |
| --------------------------------------------- | ----------------------------------------------------- |
| **Copy Chrome URL**                           | Copy the URL of the active tab                        |
| **Copy Chrome Markdown Link**                 | Copy the active tab as a `[title](url)` Markdown link |
| **Extract Chrome HTML**                       | View and copy the body HTML of the active tab         |
| **Extract Chrome Cookies**                    | Copy the active tab's cookies as JSON                 |
| **Search Chrome Cookie**                      | Search cookies by name and copy a name or value       |
| **Search Chrome Tab Group**                   | Search tab groups and tabs, then switch to one        |
| **Open Chrome Extensions / Settings / Flags** | Jump straight to the `chrome://` pages                |
| **Open in Atlas**                             | Open the active tab in the ChatGPT Atlas browser      |

## Requirements

- macOS with Google Chrome installed
- Permissions, granted on first use or in _System Settings → Privacy & Security_:
  - **Automation** → Raycast → Google Chrome (all commands)
  - **Accessibility** → Raycast (tab group search)
- For HTML and cookie extraction, enable **View → Developer → Allow JavaScript from Apple Events** in Chrome

Cookie extraction reads `document.cookie`, so HttpOnly cookies are not included. HTML and cookie extraction automatically copy on load and refresh. Both automatic and manual copies are concealed from clipboard history; concealment does not encrypt clipboard contents or hide them from other applications.

HTML extraction accepts up to 5,000,000 UTF-16 code units and cookies up to 1,000,000. Both previews show at most 100,000 body code units, with titles limited to 500 and URLs to 2,000. Long URLs are shown as shortened plain text; browser actions and copied content retain the full values. Serialized automation responses are limited to 32 MiB UTF-8. Oversized extraction fails without replacing the clipboard; accepted content is copied in full. If copying fails, the loaded preview and manual Copy action remain available.

## How it works

Chrome's AppleScript dictionary does not expose tab groups, so the extension combines two mechanisms:

- **AppleScript** for tab operations: URLs, titles, cookies, HTML, and switching tabs
- **macOS Accessibility API** (System Events) to read tab groups from Chrome's tab strip

Tab group detection supports Chrome's English accessibility labels. A role-based traversal excludes page content and is bounded to 2,000 elements and 12 levels. Both quoted and bullet-separated English group descriptions must match native titles and counts exactly. It verifies native tab snapshots around the accessibility read and retries an inconsistent read once. Discovery has a shared 15-second subprocess budget, followed by at most 5 seconds for a fresh native fallback. If permissions, an unsupported layout/language, or a timeout prevents group discovery, the command shows a fresh **All Tabs** list with a warning instead of guessing group membership. The first matching tab is selected instead of the warning, and a selected tab is preserved across filtering and refresh when it remains present. Refresh remains available in error and empty states.

Tab selections carry native window/tab IDs, so closing or reordering earlier tabs and changing the front window do not reuse stale positions. A moved or closed target requires refresh. Chrome only exposes index-based activation: the extension resolves the ID immediately before selection and verifies it afterward, but cannot make concurrent browser mutations atomic.

Automation responses use JSON with validation. Pending reads are cancelled when superseded or the view unmounts. Refresh requests during an automatic clipboard write coalesce into one subsequent read. An already-started clipboard write cannot be revoked, but late success notifications are suppressed. Notification failures do not turn successful copies into errors or block refresh.

## Development

```bash
nvm use           # Node 22
npm ci
npm run dev        # hot reload in Raycast
npm test           # unit and command-view tests
npm run test:native # macOS subprocess contracts; no Chrome session required
npm run test:chrome # opt-in: real Chrome, disposable windows, Automation/Accessibility required
npm run test:coverage
npm run build -- --output dist # build without replacing the installed extension
npm run typecheck  # TypeScript type check
npm run lint       # lint + format check
```

The extension is not on the Raycast Store; `npm run dev` installs it into your local Raycast.

## License

[MIT](LICENSE)

## Validation notes

The refactor was validated under Node 22 with a clean lockfile installation, type checking, lint, tests and isolated builds. Native smoke tests on disposable Chrome windows verified stable-ID selection after earlier-tab closure and front-window changes, closed-target rejection, and HTML extraction. Native JSON serialization, output limits and localized permission-code preservation have automated subprocess tests.

On Chrome 153.0.8010.37, live disposable-window probes verified the new traversal on blank windows and expanded groups with pinned tabs, and exposed the new bullet-separated group-label grammar now supported by the parser. A sanitized unnamed-group AX fixture is committed. The full `test:chrome` smoke **has not passed**: collapse attempts did not consistently produce a collapsed group, and the UI tool subsequently reported concurrent user changes. Live collapsed-group compatibility and native Raycast visual/keyboard behavior remain unverified. No system permissions were reset.

Run `npm run test:chrome` only while Chrome is idle. It uses disposable incognito windows to avoid saving fixture groups, guards the front-window identity before UI mutations, closes tracked windows in cleanup, and restores the original front window. It requires English Chrome menus and JavaScript from Apple Events. It is opt-in and not part of CI. See [AUDIT-FOLLOWUP.md](AUDIT-FOLLOWUP.md) for resolution evidence and remaining checks.
