# Post-refactor audit

Baseline: `7634beaa27862dd3b19812bc1476893b046a91b6` (2026-09-18). This report supersedes the original audit's overall readiness assessment while preserving its historical findings. Production code was not changed during this review.

**Verdict: substantially safer and still lean, but not yet fully production-ready for its advertised tab-group capability.** The previous delimiter corruption, positional tab selection, missing effect cleanup, unsafe Markdown handling, and empty-state recovery have concrete fixes and regression coverage. The remaining findings are narrower: native group compatibility, transient-snapshot recovery, and notification-failure containment.

## Findings, in priority order

### F1 — P2: Native group discovery still fails on the installed Chrome layout

Location: `src/lib/chrome-scripts.ts:95` and `:107`.

The collector selects a fixed hierarchy, takes the last scroll area, then accesses `group 1 of group 1`. A fresh live probe against a disposable blank Chrome window again produced `System Events got an error: AppleEvent handler failed. (-10000)` at the tab-container access. The fixture was closed afterward. This is a current compatibility failure, not merely an untested possibility.

The All Tabs fallback avoids fabricating groups and is a useful safety improvement. It does not restore group names, collapsed state, or searching by group name. Passing mocked parsing tests therefore cannot establish that the main group feature works on this installation. The probe did not exercise real expanded/collapsed groups; their behavior remains unverified.

Recommended correction: replace the single positional path with a bounded, role-based search scoped to Chrome's tab strip. Accept a container only when its recognized tab/group records reconcile with the native snapshot. Keep strict fallback behavior for unknown layouts; do not restore broad exception suppression. Capture sanitized AX fixtures from supported Chrome versions and add an opt-in native compatibility smoke test.

Acceptance: the current supported Chrome version can discover actual expanded, collapsed, unnamed and pinned/ungrouped tabs; unknown layouts still produce a clearly labeled fresh All Tabs fallback.

### F2 — P2: A transient change inside a native snapshot bypasses retry and fallback

Locations: `src/lib/chrome.ts:149`, `:170`; `src/lib/chrome-scripts.ts:53`.

The native snapshot script intentionally raises error 1004 if the front window changes during collection. Both `await snapshot(signal)` calls sit outside the retry-catching blocks. Consequently, this explicit inconsistency signal exits immediately instead of using the remaining attempt or fallback. A change detected by comparing completed snapshots retries; the same change detected inside a snapshot does not.

Two temporary probes confirmed the asymmetry: an initial 1004 caused rejection after exactly one script call; a post-AX 1004 caused rejection after exactly three calls. Each probe queued a valid subsequent snapshot that was never consumed. These are deterministic unit-level reproductions of the control flow, not live timing experiments.

Recommended correction: distinguish snapshot instability from unavailable Chrome, denied native access, cancellation and malformed protocol data. Catch only the transient snapshot condition around the entire discovery attempt; retry once, then attempt the fresh native fallback. Preserve genuine native failures as errors. Use a distinct error code/type instead of overloading the layout sentinel.

Acceptance: window changes during either native read follow the same bounded recovery as before/after mismatches; aborts and genuine permission/process failures still propagate without loops.

### F3 — P3: Failure notifications can escape as unhandled loader rejections

Locations: `src/lib/use-chrome-data.ts:59`, `:69`, `:85`.

The loader catches fetch/copy errors but awaits the failure toast without protecting against rejection of the notification itself. The mount effect starts `void reload()` with no rejection handler. A temporary probe made `showChromeError` reject during a manual reload and confirmed that the notification error escaped the hook. The same path on the discarded mount promise has no consumer.

This is conditional on Raycast's notification call failing; no actual Raycast notification-service failure or command crash was observed. The state itself remains recoverable, so severity is lower than the tab-search defects.

Recommended correction: make failure reporting best-effort at the loader boundary and ensure the effect-started promise is consumed. Keep the original fetch/copy error in state, settle loading, and retain manual retry even when displaying a toast fails. Avoid recursively reporting a toast failure with another toast.

Acceptance: rejection of either success or failure notification never produces an unhandled promise rejection, loses loaded data, or blocks later refreshes.

## Architecture and first-principles assessment

| Dimension       | Assessment                                                                                                                                                                                                                             |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Leanness        | Good: ten thin commands, two declared runtime dependencies, one Chrome module with internal script/parsing modules, and a shared loader. No generic provider framework or unnecessary persistence.                                     |
| Robustness      | Improved, with explicit JSON validation, stable identities, cancellation and conservative fallback. F1 and F2 prevent a full readiness endorsement.                                                                                    |
| Efficiency      | TypeScript transformations are predominantly linear. Native automation round trips and repeated AX attempts dominate likely latency; this review did not benchmark large tab sets.                                                     |
| Safety          | Arguments are passed without shell interpolation, cookies/HTML are concealed, responses are bounded, rendering is escaped, and raw subprocess output is withheld from user errors. No new high/critical vulnerability was established. |
| Maintainability | Interfaces are understandable. Snapshot instability and layout failures need separate domain meanings; overloading them currently produces inconsistent recovery.                                                                      |
| Verification    | Stronger regression suite, but high TypeScript coverage is not coverage of AppleScript execution or Raycast's native UI.                                                                                                               |

The refactor applies useful first principles: identity is separate from position; external text is explicitly encoded; incomplete observations fail conservatively; asynchronous reads have owners; and security checks exist at transport and rendering boundaries. Keep those choices. The next step should deepen the native discovery module, not add more layers around it.

## Improvements that are not confirmed defects

- **Batch native properties.** `SNAPSHOT_SCRIPT` reads ID, title and URL inside a per-tab AppleScript loop. Investigate fetching each property as a list to reduce Apple-event round trips, with identity/count consistency checks. Benchmark before adopting this optimization.
- **Bound total discovery latency.** Individual operations are timed out, but two full attempts and a fresh fallback have no shared deadline. Approximate configured ceilings can approach 45 seconds if each completed operation is near its timeout. This is a budget calculation, not measured latency. Distinguish permanent layout errors from transient instability to avoid retrying work that cannot recover.
- **Validate fallback keyboard UX.** The persistent warning is the first actionable List.Item and offers Refresh. Test initial selection and Return-key behavior so the warning does not displace the first matching tab as the useful primary action. The current mock renders every action as a DOM button and does not simulate native selection. Raycast exposes selection control through its [List interface](https://developers.raycast.com/api-reference/user-interface/list).
- **Budget rendered metadata too.** The 100,000-character cap covers the payload preview, while titles and URLs are rendered in full. Their aggregate source limit is 1,000,000 code units. Consider smaller display-only truncation while retaining original copied data. No actual renderer stall was demonstrated.
- **Keep tests representative.** The native-contract suite exercises serialization and error-handler fragments; it does not compile or execute the complete AX and switching programs in CI. Retain an opt-in browser smoke suite with disposable windows. Do not mistake the five native-only cases for ten additional tests: the native run also repeats five extraction-program cases.

No new runtime dependency, state-management library, general browser abstraction, or broad rewrite is justified. The existing fixed-page entry points are appropriate for Raycast and should remain simple.

## Verification performed in this review

- Re-read all production modules, configuration, dependency declarations, CI/Dependabot rules, mocks and regression coverage; compared the current code to the documented contracts.
- Node 22.23.2: typecheck passed; 165 standard tests passed; the five native-only cases passed in the 10-case native-contract command.
- Coverage: 95.44% statements, 91.40% branches, 97.93% lines. These figures exclude native script-string behavior.
- All ten commands built successfully to an isolated temporary directory.
- Three temporary probes passed by asserting the faulty behavior in F2/F3; removed after execution.
- Live AX check reproduced F1 on a disposable blank Chrome window; no existing user tabs were edited and no permissions were reset.
- Refreshed npm vulnerability audit: zero known vulnerabilities reported. This is not a security guarantee.
- Final full Raycast lint passed, including online manifest validation, ESLint and formatting. An earlier lint attempt saw the temporary, unformatted probe file; that was an audit artifact, not a committed-source failure.
- Raycast visual rendering, production clipboard timing, and real grouped/pinned tab interactions were not exercised in this review. The previous GUI runtime failure was not retried here.

The working branch remains one local commit ahead of origin/main. This audit did not attempt a push, modify application source, or install over the existing Raycast extension.

## Implementation follow-up

The approved defects-and-hardening patch replaces positional AX traversal with a bounded structural tree (2,000 nodes, 12 levels, no AXWebArea traversal). A pure parser rejects ambiguous strips and group labels, combines pinned/regular regions in order, and reconciles the full native snapshot. The existing quoted description grammar remains supported; live Chrome 153.0.8010.37 probes also established the bullet-separated description grammar, including the URL used for blank native titles.

- **F1: implementation complete, native acceptance partial.** Blank-window traversal and expanded/pinned group discovery succeeded on disposable fixtures. The full native smoke did not pass its collapsed-group assertion; separate UI tooling reported concurrent user changes, so further UI actions were stopped. Collapsed live compatibility is not certified. A sanitized captured unnamed-group fixture and deterministic expanded/collapsed/ambiguous/layout-bound tests are permanent. The opt-in smoke uses incognito windows and identity guards for subsequent runs.
- **F2: fixed.** Both native snapshots are inside the transient retry boundary. Snapshot instability, unsupported layouts, AX read failures and timeouts have distinct internal types. Native permission/process/protocol/size failures and cancellation still propagate. Discovery uses a monotonic 15-second budget; fallback requires a fresh native read with a 5-second timeout.
- **F3: fixed.** Failure notifications are contained at the loader boundary, the effect promise is consumed, and failed success notifications do not misreport a successful copy. Tests cover failed fetch/copy notification paths and queued refresh recovery.
- **Additional hardening:** explicit initial tab selection, preservation of matching tab selection, full-value filtering, and surrogate-safe rendered title/URL limits (500/2,000). Copy and browser actions retain original values.

Native Raycast keyboard/visual acceptance remains manual. Property-read batching is deferred until profiling justifies it. No runtime dependencies or public domain API changes were introduced.

Validation for this patch: Node 22 typecheck, Raycast lint/metadata validation, all ten isolated command builds, 185 standard tests, and 10 native-contract tests passed. The native-contract run repeats five standard extraction tests and adds five macOS subprocess tests. Standard coverage: 97.88% lines, 92.23% branches. `npm audit` reported zero vulnerabilities. Six opt-in cases are skipped in the standard run; the separate full Chrome smoke remains unpassed as described above.
