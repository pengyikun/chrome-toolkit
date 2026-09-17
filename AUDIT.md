# Chrome Toolkit codebase audit

Audit date: 2026-09-18. Baseline: `3ec824cd6efec469b2a14616879f9e092d9576b4`.

**Verdict: a lean, readable utility with useful safeguards, but not yet robust enough to call production hardened.** The main weaknesses are at external-system boundaries: stable tab identity, lossless response framing, accessibility snapshot validation, and asynchronous lifecycle ownership. A rewrite or additional architectural framework is unnecessary.

The findings below describe the original baseline. The subsequent implementation addresses all eight findings; see the resolution record at the end for current evidence and remaining native compatibility checks.

## Scope and validation

Reviewed every production source module, all eight existing test files, test mocks, package manifest and lockfile, TypeScript/ESLint/Vitest configuration, GitHub Actions and Dependabot configuration, README, changelog, generated API declarations, and ignore rules. Inspected the installed Raycast utilities source maps to verify subprocess behavior. Image assets were validated by Raycast lint; they were not a design-review target. No applicable AGENTS.md was found in the workspace or its ancestor directories.

| Check              | Result                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------------- |
| TypeScript         | `npm run typecheck` passed                                                                                 |
| Existing tests     | 128 passed across 8 files                                                                                  |
| Coverage           | 72.5% statements, 66.66% branches, 73.86% lines                                                            |
| Lint               | `npm run lint` passed, including online manifest/author validation                                         |
| Build              | All 10 command entry points built with `npm run build -- --output /private/tmp/chrome-toolkit-audit-build` |
| Dependencies       | `npm audit --json` completed: 0 known vulnerabilities reported                                             |
| Targeted probes    | 6 temporary unit probes confirmed the observed faulty behavior; removed after execution                    |
| Native integration | Chrome AX traversal, permission prompts, real tab switching and Raycast rendering were not exercised live  |

The shell ran Node 26.8.2 and npm 11.19.1. The repository and CI target Node 22; that runtime was not validated locally. Installed Raycast API/utils were 2.0.5/2.3.0, with React 19.0.0. Initial sandboxed lint and npm audit attempts failed on DNS; the subsequent network-enabled runs passed. The default build could not write to the installed Raycast extension directory; the isolated output build passed instead. These initial failures were environment constraints, not application defects.

The coverage report gives `src/lib` 100% statement coverage, but all four view commands have 0%. AppleScript is mocked, so that 100% does not establish script correctness, compatibility with Chrome's accessibility tree, or behavior under native permission failures. No critical vulnerability or shell-injection path was established by this audit; that is not a guarantee of their absence.

## Findings

P2 denotes a functional defect that should be fixed in the next hardening pass. P3 denotes a lower-impact correctness or diagnostic defect. Ordering within P2 reflects recommended remediation priority.

### 1. P2 — Tab positions are used as identity across mutable snapshots

Locations: `src/lib/chrome.ts:198`, `src/lib/chrome.ts:284`, `src/lib/chrome.ts:411`, `src/search-tab-group.tsx:30`.

The list stores only 1-based indices. At selection time, `switchToTab` applies the stored index to whichever Chrome window is currently frontmost. Its range check verifies that an index exists, not that it still identifies the displayed tab.

Example: load `[A, B, C]`, close A, then select the displayed B (index 2). The script selects C and the UI reports that it switched to B. Changing the front window can select an unrelated tab in another window. This follows directly from the generated script and data model; a live desktop reproduction was not performed.

Fix: capture window ID and tab ID in the native snapshot, carry them through the list, and resolve the intended tab in the intended window when acting. Fail clearly if the target has disappeared. Validate the AX/native mapping before assigning those identities. Replace parallel `tabs`/`tabIndices` arrays with a single array of tab records.

Acceptance: closing or reordering earlier tabs, switching front windows, and removing the target must never cause another tab to be selected under the old title.

### 2. P2 — Unmount does not invalidate pending loads or their side effects

Locations: `src/lib/use-chrome-data.ts:43`, `src/lib/use-chrome-data.ts:56`, `src/lib/use-chrome-data.ts:67`.

The request counter changes only on reload. The mount effect has no cleanup, so an in-flight request remains current after the consumer unmounts. Both `onSuccess` and failure toasts still run. HTML/cookie commands use `onSuccess` to write the clipboard automatically.

Two deferred-promise probes confirmed that resolving after unmount calls `onSuccess`, and rejecting after unmount calls `showChromeError`. If the runtime remains alive, an abandoned extraction can overwrite a newer clipboard value or emit an irrelevant toast. Native Raycast process lifetime was not tested, so the demonstrated guarantee is the hook's behavior, not every command-dismissal scenario.

Fix: invalidate the request during effect cleanup. Propagate an AbortSignal into `runAppleScript` where practical, cancel superseded reads, and guard notifications after awaited side effects. Define whether reload is allowed while a clipboard operation is in flight; the existing request guard cannot undo an already-started write. React documents cleanup on unmount and an ignore guard for asynchronous fetching: [useEffect](https://react.dev/reference/react/useEffect).

Acceptance: late success and failure after unmount have no effects; stale requests do not copy or notify; rapid reloads do not accumulate unnecessary osascript processes.

### 3. P2 — Unescaped separators allow title text to corrupt response fields

Locations: `src/lib/chrome.ts:180`, `src/lib/chrome.ts:184`, `src/lib/chrome.ts:295`, `src/lib/chrome.ts:337`, `src/lib/chrome.ts:447`.

U+001F and U+001E are uncommon, but the framing protocol never escapes them. Titles and group descriptions are external data. Cookie/HTML responses put the title before the URL and split at the first two separators. A separator in a title therefore changes the parsed URL and payload. The title list and AX record format have the same structural weakness.

A probe returned `Title<FS>https://wrong.example<FS>https://actual.example<FS>session=abc`. The parser accepted `https://wrong.example` as the page URL and put the real URL inside the cookie payload. This demonstrates a parsing defect with adversarial input; preservation of those control characters through a current live Chrome installation was not verified. The incorrect URL would also feed the view's Open in Browser action.

Fix: use a lossless structured encoding, such as a JSON envelope, at the automation boundary and validate the decoded shape. For JavaScript extraction, collect title, location and payload in a single evaluation to reduce navigation races. Do not make a trusted URL field depend on delimiter rarity.

Acceptance: separators, quotes, Unicode, empty strings and multiline text round-trip without field changes; malformed envelopes are rejected.

### 4. P2 — Collapsed-group counts can be parsed from the page title

Locations: `src/lib/chrome.ts:344`, `src/lib/chrome.ts:350`, `src/lib/chrome.ts:385`.

`collapsedTabCount` finds the first `and N Other Tabs` anywhere in a description, including inside its quoted first-tab title or the user-set group name. `desc.includes("Collapsed")` similarly treats any occurrence as the state.

A probe used `work - "Research and 9 Other Tabs" and 1 Other Tab - Collapsed`. A two-tab group was counted as ten tabs; the subsequent ungrouped tab received index 11 instead of 3. This is possible with ordinary printable text and shifts every later group. The 500-tab clamp also silently shifts subsequent groups when an actual group exceeds that size.

Fix: parse and validate the terminal metadata suffix, separately from names/titles, and require a complete supported format. Reject counts inconsistent with the native snapshot. A safety limit should reject or mark an unsupported group; silently changing a count corrupts positional arithmetic.

Acceptance: titles/group names containing `and N Other Tabs`, `Collapsed`, quotes and punctuation do not affect counts or state; excessive counts produce an explicit unsupported-data result.

### 5. P2 — Partial AX reads are silently treated as complete snapshots

Locations: `src/lib/chrome.ts:303`, `src/lib/chrome.ts:320`, `src/lib/chrome.ts:329`, `src/lib/chrome.ts:336`.

The per-element AppleScript `try` suppresses failures and skips elements. TypeScript ignores unknown record kinds and never verifies that the total reconstructed tabs equals the native title count. Native titles and AX groups are also collected in separate calls without checking that the same window and tab ordering survived both phases.

One probe supplied two native titles and an AX group count of four. The result contained two titles and four indices with no error. The existing test named `ignores malformed records` explicitly accepts an incomplete mapping. An omitted element earlier in the strip shifts the interpretation of all later elements, even when the resulting indices are in bounds.

Fix: distinguish irrelevant UI controls from failures reading recognized tab/group elements; validate record shape, safe integer counts, total tab count and window identity. Reject or retry inconsistent snapshots with a bounded retry. Where an unsupported AX layout prevents group discovery, an explicitly ungrouped native-tab fallback can remain useful without fabricating memberships.

Acceptance: skipped recognized elements, malformed records, count mismatches and mid-read tab/window changes produce a bounded retry or clear error, never an actionable guessed mapping.

### 6. P2 — Empty and failed search views have no refresh action

Locations: `src/search-cookie.tsx:26`, `src/search-cookie.tsx:62`, `src/search-tab-group.tsx:50`, `src/search-tab-group.tsx:95`.

Refresh is attached only to each List.Item. Initial errors and zero-result views have no items and no root List actions. After granting permission, opening Chrome, or loading a page with cookies, the user cannot invoke the command's refresh action from that empty view and must reopen the command. A search with no matches also removes the refresh action. Empty-view text incorrectly attributes a filtered miss to the browser containing no data.

Fix: put Refresh in a List-level action panel or empty-view actions, with the same shortcut. Distinguish an empty source from a query with no matches. Raycast exposes both List actions and EmptyView actions in its [List API](https://developers.raycast.com/api-reference/user-interface/list).

Acceptance: initial failure, empty source and zero-match searches all retain an accessible refresh action; recovering after permission changes does not require restarting the command.

### 7. P3 — The AppleScript catch loses localized permission errors

Location: `src/lib/chrome.ts:249`.

The outer TypeScript mapper recognizes numeric accessibility denial `-25211`, but the AX preamble preserves errors only when the English text contains `assistive access`. A localized denial raised inside that try block is replaced with sentinel 1004 before TypeScript sees it, producing layout-error guidance instead of permission guidance.

The existing localized-denial test mocks a final `-25211` rejection and bypasses this AppleScript translation. It therefore cannot establish the intended behavior.

Fix: preserve relevant numeric permission errors in AppleScript before mapping unknown traversal failures. Add a script-boundary/native fixture test covering localized error text. This finding is based on source control flow; permission prompts were not changed or exercised live.

### 8. P3 — Trailing newlines are stripped twice

Location: `src/lib/chrome.ts:108`.

The installed `@raycast/utils` 2.3.0 implementation already calls `handleOutput({ stripFinalNewline: true }, stdoutResult)`. The local wrapper then removes another final newline. A legitimate trailing newline in returned title data is lost. Current tests incorrectly model utils as returning the raw osascript terminator, so they reinforce the extra stripping.

A probe supplied a utils-level response whose title legitimately ended in a newline and confirmed that the wrapper removed it. Verified against the installed source map; the same output-normalization logic appears in the [upstream implementation](https://github.com/raycast/utils/blob/main/src/run-applescript.ts).

Fix: remove redundant transport normalization and make mocks reflect the dependency's actual contract. Structured serialization from finding 3 further reduces this ambiguity. Impact is low because the extraction expressions normally return HTML with a closing tag and cookie strings without a final newline.

## Architecture, leanness and safety assessment

| Dimension       | Assessment                                                                                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Leanness        | Good. Ten thin commands, two declared runtime dependencies, pure parsing/rendering helpers and one shared loader are proportionate to the task.             |
| Robustness      | Incomplete. Incorrect snapshots and mutable positions can be presented as successful results; lifecycle cleanup is missing.                                 |
| Efficiency      | Sensible linear TypeScript processing and a bounded HTML preview. Native AX traversal is the likely dominant cost; no live latency benchmark was performed. |
| Safety          | Good shell boundary and concealed cookie copies; weaker trust boundary around returned text and stale side effects.                                         |
| Maintainability | Clear names, strict TypeScript and centralized errors. The combined automation/parsing module is the main place to simplify interfaces.                     |
| Verification    | Useful unit suite, CI, lockfile and dependency updates; weak native-contract and view-level coverage.                                                       |

Worth preserving:

- `execFile` uses argument arrays rather than shell interpolation. Atlas accepts only HTTP/HTTPS URLs. The only dynamic AppleScript insertion is a validated numeric tab index.
- Cookie payloads are copied with `concealed: true`; there is no application-level network upload or persistent cookie store in reviewed source.
- HTML is displayed in a dynamically sized code fence and its preview is truncated; the full body is retained for copying.
- Chrome operations have timeouts, familiar failures have actionable errors, and newer fetches invalidate older results while mounted.
- Cookie parsing preserves embedded equals signs and duplicate names in an array.
- Strict TypeScript, `noUncheckedIndexedAccess`, CI and Dependabot provide useful baseline discipline.

Additional hardening opportunities, separate from the confirmed defects:

1. **Bound payloads before transport.** The 100,000-character HTML preview cap applies after extraction and buffering. Installed utils has an approximately 80-million-character UTF-8 decoded-output guard, but that is not an application memory budget. Add an explicit extraction-size policy and clear oversized-page errors; stress-test large pages. Cookie previews currently have no display cap.
2. **Complete Markdown boundary handling.** Escaping omits HTML angle brackets/entities in titles; error strings are interpolated directly into Detail Markdown. Rendering impact depends on Raycast's Markdown implementation and was not demonstrated. Use one plain-text escaping policy and parser/render-level tests rather than string-pattern tests alone. The truncation notice also claims content is on the clipboard even when copying failed.
3. **Tighten CI supply-chain settings.** Set explicit minimal workflow permissions and consider immutable action commit pins with Dependabot updates. Current mutable action tags and inherited token permissions are hardening opportunities, not evidence of compromise. Match local validation to Node 22 and run a clean `npm ci` in an isolated checkout before release.
4. **Treat clipboard concealment as history exclusion, not encryption.** HTML may also contain tokens or private data; decide and document whether HTML copies should be concealed. Cookie-value visibility is intentional product behavior, but a reveal control could reduce accidental screen exposure.

Avoid adding a generic browser-provider hierarchy, dependency-injection framework or more state-management machinery. The highest-value simplification is a smaller reliable contract: a stable tab record, a validated structured response, and one lifecycle-aware loader. The three fixed Chrome-page wrapper commands are appropriate Raycast entry points and do not need to be collapsed merely to reduce file count.

## Recommended implementation sequence

1. Fix loader cleanup and make Refresh available in empty/error states; cover the actual commands' clipboard and recovery behavior.
2. Replace ambiguous response framing and correct the utils newline contract.
3. Carry stable window/tab identities, separate AX parsing into a pure module, validate snapshots and fail explicitly on unsupported labels or layouts.
4. Preserve numeric permission failures at the AppleScript boundary and add narrow native-contract fixtures.
5. Run controlled macOS/Raycast smoke tests with disposable tabs: collapsed/expanded/unnamed groups, duplicate titles, pinned tabs, tab closure/reordering, window changes, disabled permissions, navigation during extraction, and large pages. Re-run under Node 22.

The key first-principles rules are: position is not identity; external text is not a protocol without encoding; incomplete observations are not successful snapshots; asynchronous work belongs to a lifecycle; and test coverage only measures the code actually executed. Applying those rules addresses the main risks without growing the project substantially.

## Refactor resolution record

All eight baseline findings have implementation and regression coverage:

| Finding                  | Resolution                                                                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1: positional identity   | Native window/tab IDs, late index resolution and post-selection ID verification; live closure/window-change smoke tests passed            |
| 2: lifecycle             | AbortSignal propagation, cleanup invalidation, guarded copy notifications and coalesced refreshes; deferred-promise and view tests passed |
| 3: delimiters            | Validated JSON transport; native Foundation round-trip plus hostile-title tests passed                                                    |
| 4: label parsing         | Parse terminal metadata against the exact native first-tab title; adversarial names/titles and counts beyond 500 covered                  |
| 5: incomplete snapshots  | Reject malformed/partial records and changed native snapshots; one retry, then fresh All Tabs fallback with a persistent warning          |
| 6: recovery actions      | Root Refresh in both lists; error, empty-source and zero-match tests passed                                                               |
| 7: localized permissions | Preserve numeric native codes inside the script; actual osascript error-contract tests passed                                             |
| 8: double stripping      | Removed wrapper normalization; JSON preserves data newlines                                                                               |

Additional hardening includes extraction/transport limits, concealed HTML, semantic Markdown parser tests, safe URL schemes, payload-free subprocess errors, pinned CI action SHAs and minimal workflow permissions. No runtime dependency was added; CommonMark and its types are development-only. The Vitest config is now explicitly ESM.

Validation runtime: Node 22.23.2. A separate temporary checkout completed a clean `npm ci`, typecheck, tests and isolated build. Dependency installation reported zero known vulnerabilities. All ten commands build without installing over the user's existing extension.

Native smoke evidence: disposable windows verified native ID snapshots, selecting the intended tab after closing an earlier tab, selecting it after a different window became frontmost, HTML JSON extraction, and rejection after closing the target. Test windows were closed and cleanup verified by their IDs. System permissions were not changed.

Remaining compatibility validation: live AX traversal encountered `System Events` error -10000 at the tab-container path, so expanded/collapsed/pinned group behavior could not be verified on this installation. The pure reconciliation cases and fresh fallback are tested. Tab reordering is covered by identity/snapshot logic but was not performed in the native smoke test. Raycast visual rendering is not implied by the functional command mocks or CommonMark tests.

Residual platform limits: Chrome offers index-based activation, so ID resolution plus verification detects races but cannot prevent every transient selection during concurrent browser mutation. A clipboard write already handed to Raycast cannot be cancelled. Concealed clipboard content remains readable by other applications.

Final verification: 165 standard tests passed across 12 files; five opt-in native cases are skipped by the standard run and pass in `npm run test:native` (10 tests including five shared extraction-program cases). Coverage: 95.44% statements, 91.40% branches, 97.93% lines. Final Node 22 typecheck, full online Raycast lint, all ten command builds, and `git diff --check` passed; `npm audit --json` reported zero known vulnerabilities.

The GUI check could not run: `orca computer capabilities --json` reported `runtime_unavailable`; `orca open --json` then returned `runtime_open_timeout` with “Timed out waiting for an Orca desktop window. The runtime may still be running headlessly.” No Raycast rendering success is claimed, and the refactor was not installed over the existing local extension.
