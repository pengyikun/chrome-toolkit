# Chrome Toolkit Changelog

## [Reliability Refactor] - {PR_MERGE_DATE}

- Carry native window/tab IDs and verify tab activation instead of reusing saved positions
- Replace delimiter framing with validated JSON and remove redundant newline stripping
- Validate complete group snapshots; use an All Tabs warning fallback for unreadable groups
- Cancel stale/unmounted reads and serialize automatic clipboard writes with coalesced refreshes
- Keep Refresh available in empty/error views and hide stale actions while refreshing
- Conceal HTML copies, cap extraction/preview sizes, and harden Markdown rendering
- Preserve localized native permission codes and keep raw subprocess payloads out of errors
- Add command-view, parser, cancellation and native subprocess regression coverage
- Pin CI actions, reduce token permissions, and validate against Node 22

## [Audit Hardening] - {PR_MERGE_DATE}

- Copy extracted cookies to the clipboard as concealed, keeping session credentials out of clipboard history
- Fix a trailing newline leaking into the last field of multi-value Chrome responses (title, cookies, HTML)
- Consolidate the loading/error/stale-response logic of all view commands into a shared, tested `useChromeData` hook
- Anchor sentinel error matching so unrelated errors can no longer be misclassified
- Show guided permission/setup toasts when switching tabs fails, matching all other commands
- Keep the HTML preview from splitting an emoji at the truncation boundary
- Trim whitespace around parsed cookie names and values (RFC 6265)
- Share the extracted-page Markdown rendering (title, URL, truncated body) between the HTML and cookie commands
- Upgrade to Raycast API 2.x
- Add GitHub Actions CI (typecheck, lint, tests)

## [Initial Version] - {PR_MERGE_DATE}

- Copy active Chrome tab URL or Markdown link to clipboard
- Extract and view body HTML from active Chrome tab
- Extract and search cookies from active Chrome tab
- Search and switch between Chrome tab groups (expanded and collapsed)
- Quick access to Chrome Extensions, Settings, and Flags pages
- Open active Chrome tab URL in ChatGPT Atlas browser
- Guided error messages for Automation, Accessibility, and Chrome's Allow JavaScript from Apple Events permissions
