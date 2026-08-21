# Chrome Toolkit Changelog

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
