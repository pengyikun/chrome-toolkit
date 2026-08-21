import { runAppleScript } from "@raycast/utils";
import {
  AccessibilityPermissionError,
  AutomationPermissionError,
  BrowserNotRunningError,
  JavaScriptDisabledError,
  NoWindowError,
  UnexpectedResponseError,
} from "./errors";

/** Default timeout for AppleScript calls (URL/title). */
const DEFAULT_TIMEOUT_MS = 5_000;

/** Extended timeout for heavy operations (HTML extraction). */
const HTML_TIMEOUT_MS = 15_000;

/** Extended timeout for UI-traversal operations (System Events). */
const UI_TIMEOUT_MS = 10_000;

/**
 * ASCII Unit Separator (U+001F) — used as a field delimiter in AppleScript
 * multi-value returns. Virtually never appears in URLs, titles, or HTML.
 */
const FIELD_SEPARATOR = "\u001F";

/** ASCII Record Separator (U+001E) — delimits records in multi-record returns. */
const RECORD_SEPARATOR = "\u001E";

/**
 * Maps an AppleScript error into a typed domain error.
 * Recognises our sentinel error numbers (osascript reports them as `(1001)`)
 * and common macOS failure strings.
 */
function mapAppleScriptError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);

  // Our sentinel errors surface as e.g. `execution error: CHROME_NOT_RUNNING
  // (1001)` — match the token, or the number in its end-of-message position,
  // so an incidental "(1001)" elsewhere in an error can't misclassify it.
  const sentinel =
    message.match(/\((100[1-4])\)\s*$/)?.[1] ??
    message.match(
      /\b(CHROME_NOT_RUNNING|CHROME_NO_WINDOW|TAB_OUT_OF_RANGE|CHROME_TAB_STRIP)\b/,
    )?.[1];

  if (sentinel === "1001" || sentinel === "CHROME_NOT_RUNNING") {
    throw new BrowserNotRunningError();
  }
  if (sentinel === "1002" || sentinel === "CHROME_NO_WINDOW") {
    throw new NoWindowError();
  }
  if (sentinel === "1003" || sentinel === "TAB_OUT_OF_RANGE") {
    throw new UnexpectedResponseError(
      "tab no longer exists (it may have been closed)",
    );
  }
  if (sentinel === "1004" || sentinel === "CHROME_TAB_STRIP") {
    throw new UnexpectedResponseError(
      "could not read Chrome's tab strip (Chrome's UI layout may have changed)",
    );
  }
  // Chrome's View → Developer → Allow JavaScript from Apple Events is off
  if (message.includes("JavaScript through AppleScript")) {
    throw new JavaScriptDisabledError();
  }
  // macOS Accessibility denial (System Events UI scripting);
  // -25211 survives localisation
  if (message.includes("assistive access") || message.includes("-25211")) {
    throw new AccessibilityPermissionError();
  }
  // macOS Automation permission denials (-1743 survives localisation)
  if (
    message.includes("Not authorized") ||
    message.includes("not authorized") ||
    message.includes("Not authorised") ||
    message.includes("not authorised") ||
    message.includes("-1743") ||
    message.includes("Apple events")
  ) {
    throw new AutomationPermissionError();
  }
  // Fallback: Chrome process not found
  if (
    message.includes("Application isn't running") ||
    message.includes("is not running")
  ) {
    throw new BrowserNotRunningError();
  }

  throw new Error(`Could not communicate with Google Chrome. ${message}`);
}

/**
 * Executes an AppleScript against Chrome with structured error handling.
 * The script MUST use `error … number 1001/1002/…` for state guards
 * instead of returning sentinel strings.
 *
 * osascript terminates its output with a newline that is not part of the
 * script's return value, so a single trailing newline is stripped here —
 * otherwise it leaks into the last field of multi-field responses.
 */
async function runChromeScript(
  script: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<string> {
  try {
    const result = await runAppleScript(script, { timeout: timeoutMs });
    return result.replace(/\r?\n$/, "");
  } catch (error) {
    mapAppleScriptError(error);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Returns the URL of the active Chrome tab. */
export async function getActiveTabUrl(): Promise<string> {
  const script = `
    if application "Google Chrome" is not running then error "CHROME_NOT_RUNNING" number 1001
    tell application "Google Chrome"
      if (count of windows) is 0 then error "CHROME_NO_WINDOW" number 1002
      set tabURL to URL of active tab of front window
      if tabURL is missing value then return ""
      return tabURL
    end tell
  `;
  const result = await runChromeScript(script);
  return result.trim();
}

/** Returns the URL and title of the active Chrome tab. */
export async function getActiveTabInfo(): Promise<{
  url: string;
  title: string;
}> {
  const fs = "character id 31"; // AppleScript for U+001F
  const script = `
    if application "Google Chrome" is not running then error "CHROME_NOT_RUNNING" number 1001
    tell application "Google Chrome"
      if (count of windows) is 0 then error "CHROME_NO_WINDOW" number 1002
      set currentTab to active tab of front window
      set tabURL to URL of currentTab
      if tabURL is missing value then set tabURL to ""
      set tabTitle to title of currentTab
      if tabTitle is missing value then set tabTitle to ""
      return (tabURL as string) & ${fs} & (tabTitle as string)
    end tell
  `;
  const result = await runChromeScript(script);
  const sepIndex = result.indexOf(FIELD_SEPARATOR);
  if (sepIndex < 0) {
    throw new UnexpectedResponseError("missing field separator in tab info");
  }
  return {
    url: result.slice(0, sepIndex),
    title: result.slice(sepIndex + 1),
  };
}

/** Returns the raw cookie string, URL, and title of the active Chrome tab. */
export async function getActiveTabCookies(): Promise<{
  cookies: string;
  url: string;
  title: string;
}> {
  const fs = "character id 31";
  const script = `
    if application "Google Chrome" is not running then error "CHROME_NOT_RUNNING" number 1001
    tell application "Google Chrome"
      if (count of windows) is 0 then error "CHROME_NO_WINDOW" number 1002
      set currentTab to active tab of front window
      set tabCookies to execute currentTab javascript "document.cookie"
      if tabCookies is missing value then set tabCookies to ""
      set tabURL to URL of currentTab
      if tabURL is missing value then set tabURL to ""
      set tabTitle to title of currentTab
      if tabTitle is missing value then set tabTitle to ""
      return (tabTitle as string) & ${fs} & (tabURL as string) & ${fs} & (tabCookies as string)
    end tell
  `;
  const result = await runChromeScript(script);
  const first = result.indexOf(FIELD_SEPARATOR);
  const second = result.indexOf(FIELD_SEPARATOR, first + 1);
  if (first < 0 || second < 0) {
    throw new UnexpectedResponseError(
      "missing field separators in cookies response",
    );
  }
  return {
    title: result.slice(0, first),
    url: result.slice(first + 1, second),
    cookies: result.slice(second + 1),
  };
}

export interface TabGroup {
  name: string;
  tabs: string[];
  collapsed: boolean;
  /** 1-based Chrome tab indices for each tab in this group. */
  tabIndices: number[];
}

/**
 * Upper bound on tabs attributed to a single group — guards against a
 * nonsense count parsed from a malformed AX description.
 */
const MAX_GROUP_TABS = 500;

/**
 * Shared AppleScript fragment that navigates Chrome's accessibility tree
 * to reach the tab container:
 *   window → group 1⁴ → tab group 1 → (group with scroll areas)
 *            → last scroll area → group 1 → group 1
 * The path is version-dependent, so any navigation failure is reported as
 * error 1004 (except Accessibility-permission denials, which are re-raised).
 */
const TAB_CONTAINER_PREAMBLE = `
    if application "Google Chrome" is not running then error "CHROME_NOT_RUNNING" number 1001
    tell application "Google Chrome"
      if (count of windows) is 0 then error "CHROME_NO_WINDOW" number 1002
    end tell

    tell application "System Events"
      tell process "Google Chrome"
        try
          set frontWin to front window
          set base to group 1 of group 1 of group 1 of group 1 of frontWin
          set tabGroupEl to tab group 1 of base

          -- Find the group that contains scroll areas (the tab strip area)
          set tabStripGroup to missing value
          repeat with g in (every group of tabGroupEl)
            try
              if (count of (every scroll area of g)) > 0 then
                set tabStripGroup to g
                exit repeat
              end if
            end try
          end repeat
          if tabStripGroup is missing value then error "CHROME_TAB_STRIP" number 1004

          -- The last scroll area holds the actual tabs
          set scrollAreas to every scroll area of tabStripGroup
          set tabScrollArea to last item of scrollAreas
          set tabContainer to group 1 of group 1 of tabScrollArea
        on error errMsg number errNum
          if errMsg contains "assistive access" then error errMsg number errNum
          error "CHROME_TAB_STRIP" number 1004
        end try
`;

const TAB_CONTAINER_EPILOGUE = `
      end tell
    end tell
`;

/**
 * Returns the tab groups in the front Chrome window.
 * Uses System Events (macOS Accessibility API) to read tab group elements
 * from Chrome's tab strip, since Chrome's AppleScript dictionary does not
 * expose tab groups natively.
 *
 * The AX script only reports raw facts — one record per tab-strip element:
 *   `T`                          an ungrouped tab (AXRadioButton)
 *   `G` FS description FS count  a tab group and its visible tab-button count
 * All index arithmetic happens here in TypeScript, where it is testable.
 *
 * Limitations: the AX descriptions are produced by Chrome's English
 * localisation; and the two AppleScript phases are separate snapshots, so
 * tabs opened or closed between them can misalign titles until a refresh.
 */
export async function getTabGroups(): Promise<TabGroup[]> {
  const fs = "character id 31";
  const rs = "character id 30";

  // Phase 1: all tab titles, in native tab order (includes collapsed tabs).
  const titlesScript = `
    if application "Google Chrome" is not running then error "CHROME_NOT_RUNNING" number 1001
    tell application "Google Chrome"
      if (count of windows) is 0 then error "CHROME_NO_WINDOW" number 1002
      set allTitles to title of every tab of front window
      set out to ""
      repeat with i from 1 to (count of allTitles)
        if i > 1 then set out to out & ${fs}
        set t to item i of allTitles
        if t is not missing value then set out to out & (t as string)
      end repeat
      return out
    end tell
  `;
  const titlesResult = await runChromeScript(titlesScript);
  const allTitles = titlesResult ? titlesResult.split(FIELD_SEPARATOR) : [];

  // Phase 2: walk the AX tree and emit one raw record per element.
  const axScript = `
${TAB_CONTAINER_PREAMBLE}
        set out to ""
        repeat with el in (every UI element of tabContainer)
          set rec to ""
          try
            set elRole to role of el
            if elRole is "AXRadioButton" then
              set rec to "T"
            else if elRole is "AXGroup" then
              set groupDesc to ""
              repeat with inner in (every UI element of el)
                if role of inner is "AXTabGroup" then
                  set groupDesc to description of inner
                  exit repeat
                end if
              end repeat
              if groupDesc is not "" then
                set btnCount to count of (every radio button of el)
                set rec to "G" & ${fs} & groupDesc & ${fs} & (btnCount as string)
              end if
            end if
          end try
          if rec is not "" then
            if out is not "" then set out to out & ${rs}
            set out to out & rec
          end if
        end repeat
        return out
${TAB_CONTAINER_EPILOGUE}
  `;
  const axResult = await runChromeScript(axScript, UI_TIMEOUT_MS);
  if (!axResult.trim()) return [];

  const groups: TabGroup[] = [];
  const ungroupedIndices: number[] = [];
  let chromeIdx = 1;

  for (const record of axResult.split(RECORD_SEPARATOR)) {
    const [kind, desc = "", visible = ""] = record.split(FIELD_SEPARATOR);
    if (kind === "T") {
      ungroupedIndices.push(chromeIdx);
      chromeIdx += 1;
    } else if (kind === "G") {
      // Expanded groups expose one radio button per tab; collapsed groups
      // expose none, so the count comes from the AX description instead.
      const visibleTabs = parseInt(visible, 10);
      const tabCount = visibleTabs > 0 ? visibleTabs : collapsedTabCount(desc);
      const tabs = allTitles.slice(chromeIdx - 1, chromeIdx - 1 + tabCount);
      groups.push({
        name: parseTabGroupName(desc),
        tabs: tabs.length > 0 ? tabs : parseCollapsedTabs(desc),
        collapsed: desc.includes("Collapsed"),
        tabIndices: Array.from({ length: tabCount }, (_, i) => chromeIdx + i),
      });
      chromeIdx += tabCount;
    }
  }

  // Build the "Ungrouped" section from the remaining tab indices
  if (ungroupedIndices.length > 0) {
    groups.push({
      name: "Ungrouped",
      tabs: ungroupedIndices.map((i) => allTitles[i - 1] ?? `Tab ${i}`),
      collapsed: false,
      tabIndices: ungroupedIndices,
    });
  }

  return groups;
}

/**
 * Extracts the user-set group name from the AXTabGroup description.
 * Format: ` <group name> - "<first tab title>" and X Other Tabs - Expanded`
 *     or: ` <group name> - "<first tab title>" - Expanded`
 * The group name is the text before the first ` - "`.
 */
function parseTabGroupName(desc: string): string {
  const match = desc.match(/^\s*(.+?)\s+-\s+"/);
  return match?.[1] ?? desc.trim();
}

/**
 * Number of tabs in a collapsed group, derived from its AX description:
 * `name - "First Tab" and N Other Tabs - Collapsed` → N + 1.
 */
function collapsedTabCount(desc: string): number {
  const match = desc.match(/and\s+(\d+)\s+Other\s+Tabs?\b/i);
  const others = match?.[1] ? parseInt(match[1], 10) : 0;
  return Math.min(1 + others, MAX_GROUP_TABS);
}

/**
 * Extracts tab titles from a collapsed group's AXTabGroup description.
 * Returns the first tab title plus placeholders for the remaining tabs.
 * Used only when the native title list does not cover the group.
 */
function parseCollapsedTabs(desc: string): string[] {
  const titleMatch = desc.match(/"([^"]+)"/);
  const first = titleMatch?.[1] ?? "Untitled";
  const rest = Array.from(
    { length: collapsedTabCount(desc) - 1 },
    (_, i) => `Tab ${i + 2}`,
  );
  return [first, ...rest];
}

/**
 * Switches to a tab using Chrome's native `active tab index`.
 * Works for both expanded and collapsed groups — no AX interaction needed.
 * @param chromeTabIndex 1-based Chrome tab index
 */
export async function switchToTab(chromeTabIndex: number): Promise<void> {
  if (!Number.isInteger(chromeTabIndex) || chromeTabIndex < 1) {
    throw new RangeError(`Invalid Chrome tab index: ${chromeTabIndex}`);
  }
  const script = `
    if application "Google Chrome" is not running then error "CHROME_NOT_RUNNING" number 1001
    tell application "Google Chrome"
      if (count of windows) is 0 then error "CHROME_NO_WINDOW" number 1002
      set tabCount to count of tabs of front window
      if ${chromeTabIndex} > tabCount then
        error "TAB_OUT_OF_RANGE" number 1003
      end if
      set active tab index of front window to ${chromeTabIndex}
    end tell
  `;
  await runChromeScript(script);
}

/** Returns the body HTML, URL, and title of the active Chrome tab. */
export async function getActiveTabHtml(): Promise<{
  html: string;
  url: string;
  title: string;
}> {
  const fs = "character id 31";
  const script = `
    if application "Google Chrome" is not running then error "CHROME_NOT_RUNNING" number 1001
    tell application "Google Chrome"
      if (count of windows) is 0 then error "CHROME_NO_WINDOW" number 1002
      set currentTab to active tab of front window
      set tabHTML to execute currentTab javascript "document.body ? document.body.outerHTML : document.documentElement.outerHTML"
      if tabHTML is missing value then set tabHTML to ""
      set tabURL to URL of currentTab
      if tabURL is missing value then set tabURL to ""
      set tabTitle to title of currentTab
      if tabTitle is missing value then set tabTitle to ""
      return (tabTitle as string) & ${fs} & (tabURL as string) & ${fs} & (tabHTML as string)
    end tell
  `;
  const result = await runChromeScript(script, HTML_TIMEOUT_MS);
  const first = result.indexOf(FIELD_SEPARATOR);
  const second = result.indexOf(FIELD_SEPARATOR, first + 1);
  if (first < 0 || second < 0) {
    throw new UnexpectedResponseError(
      "missing field separators in HTML response",
    );
  }
  return {
    title: result.slice(0, first),
    url: result.slice(first + 1, second),
    html: result.slice(second + 1),
  };
}
