import { runAppleScript } from "@raycast/utils";
import {
  AutomationPermissionError,
  BrowserNotRunningError,
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

/**
 * Maps an AppleScript error into a typed domain error.
 * Recognises AppleScript error numbers and common macOS failure strings.
 */
function mapAppleScriptError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("1001") || message.includes("CHROME_NOT_RUNNING")) {
    throw new BrowserNotRunningError();
  }
  if (message.includes("1002") || message.includes("CHROME_NO_WINDOW")) {
    throw new NoWindowError();
  }
  // macOS Automation permission denials
  if (
    message.includes("Not authorized") ||
    message.includes("not authorized") ||
    message.includes("Not authorised") ||
    message.includes("not authorised") ||
    message.includes("Apple events") ||
    message.includes("not allowed assistive access")
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
 * The script MUST use `error … number 1001/1002` for state guards
 * instead of returning sentinel strings.
 */
async function runChromeScript(
  script: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<string> {
  try {
    return await runAppleScript(script, { timeout: timeoutMs });
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
      set tabURL to URL of currentTab
      if tabURL is missing value then set tabURL to ""
      set tabTitle to title of currentTab
      if tabTitle is missing value then set tabTitle to ""
      return (tabTitle as string) & ${fs} & (tabURL as string) & ${fs} & tabCookies
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
 * Shared AppleScript fragment that navigates Chrome's accessibility tree
 * to reach the tab container:
 *   window → group 1⁴ → tab group 1 → (group with scroll areas)
 *            → last scroll area → group 1 → group 1
 */
const TAB_CONTAINER_PREAMBLE = `
    if application "Google Chrome" is not running then error "CHROME_NOT_RUNNING" number 1001
    tell application "Google Chrome"
      if (count of windows) is 0 then error "CHROME_NO_WINDOW" number 1002
    end tell

    tell application "System Events"
      tell process "Google Chrome"
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
        if tabStripGroup is missing value then return ""

        -- The last scroll area holds the actual tabs
        set scrollAreas to every scroll area of tabStripGroup
        set tabScrollArea to last item of scrollAreas
        set tabContainer to group 1 of group 1 of tabScrollArea
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
 * Inside the tab container, tab groups appear as AXGroup elements that
 * contain a child AXTabGroup whose `description` holds the group name
 * (e.g. `group 1 - "My Group" and 2 Other Tabs - Expanded`).
 */
export async function getTabGroups(): Promise<TabGroup[]> {
  const fs = "character id 31";
  const rs = "character id 30";
  // Phase 1: get all Chrome tab titles via native AppleScript
  const titlesScript = `
    if application "Google Chrome" is not running then error "CHROME_NOT_RUNNING" number 1001
    tell application "Google Chrome"
      if (count of windows) is 0 then error "CHROME_NO_WINDOW" number 1002
      set allTitles to title of every tab of front window
      set out to ""
      repeat with t in allTitles
        if out is not "" then set out to out & ${fs}
        set out to out & t
      end repeat
      return out
    end tell
  `;
  const titlesResult = await runChromeScript(titlesScript);
  const allTitles = titlesResult ? titlesResult.split(FIELD_SEPARATOR) : [];

  // Phase 2: walk AX tree to get group structure + tab ordering
  // Each L9 element is either an ungrouped tab (AXRadioButton) or a group
  // (AXGroup). By counting in order, we can map groups to Chrome tab indices.
  const axScript = `
${TAB_CONTAINER_PREAMBLE}
        set results to ""
        set ungrouped to ""
        set chromeIdx to 1

        repeat with el in (every UI element of tabContainer)
          set elRole to role of el

          if elRole is "AXRadioButton" then
            -- Ungrouped tab: record its index and advance
            if ungrouped is not "" then
              set ungrouped to ungrouped & ","
            end if
            set ungrouped to ungrouped & (chromeIdx as string)
            set chromeIdx to chromeIdx + 1

          else if elRole is "AXGroup" then
            try
              set groupDesc to ""
              repeat with inner in (every UI element of el)
                if role of inner is "AXTabGroup" then
                  set groupDesc to description of inner
                  exit repeat
                end if
              end repeat

              if groupDesc is not "" then
                -- Count actual tabs in this group for index tracking
                set btnCount to count of (every radio button of el)
                set tabCount to btnCount
                if tabCount is 0 then
                  -- Collapsed: parse count from description
                  set tabCount to 1
                  if groupDesc contains "Other Tab" then
                    set tabCount to tabCount + 1
                  end if
                end if

                if results is not "" then
                  set results to results & ${rs}
                end if
                set results to results & groupDesc & ${fs} & (chromeIdx as string) & ${fs} & (tabCount as string)
                set chromeIdx to chromeIdx + tabCount
              end if
            end try
          end if
        end repeat

        return ungrouped & ${fs} & results
${TAB_CONTAINER_EPILOGUE}
  `;
  const axResult = await runChromeScript(axScript, UI_TIMEOUT_MS);
  if (!axResult.trim()) return [];

  // The AX result is: ungroupedIndices FS groupRecords
  // ungroupedIndices is comma-separated 1-based Chrome tab indices
  // groupRecords is RS-separated, each: desc FS startIndex FS tabCount
  const firstFS = axResult.indexOf(FIELD_SEPARATOR);
  const ungroupedPart = firstFS >= 0 ? axResult.slice(0, firstFS) : axResult;
  const groupsPart = firstFS >= 0 ? axResult.slice(firstFS + 1) : "";

  const groups: TabGroup[] = [];

  if (groupsPart.trim()) {
    for (const record of groupsPart.split("\u001E")) {
      const parts = record.split(FIELD_SEPARATOR);
      const groupDesc = parts[0] ?? "";
      const startIdx = parseInt(parts[1] ?? "1", 10);
      const tabCount = parseInt(parts[2] ?? "1", 10);
      const isCollapsed = groupDesc.includes("Collapsed");

      const tabs = allTitles.slice(startIdx - 1, startIdx - 1 + tabCount);
      const indices = Array.from({ length: tabCount }, (_, i) => startIdx + i);

      groups.push({
        name: parseTabGroupName(groupDesc),
        tabs: tabs.length > 0 ? tabs : parseCollapsedTabs(groupDesc),
        collapsed: isCollapsed,
        tabIndices: indices,
      });
    }
  }

  // Build the "Ungrouped" section from remaining tab indices
  if (ungroupedPart.trim()) {
    const indices = ungroupedPart
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n));
    if (indices.length > 0) {
      const tabs = indices.map((i) => allTitles[i - 1] ?? `Tab ${i}`);
      groups.push({
        name: "Ungrouped",
        tabs,
        collapsed: false,
        tabIndices: indices,
      });
    }
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
  return match ? match[1] : desc.trim();
}

/**
 * Extracts tab titles from a collapsed group's AXTabGroup description.
 * Format: ` group_name - "First Tab Title" and N Other Tab(s) - Collapsed`
 *     or: ` group_name - "First Tab Title" - Collapsed`
 * Returns the first tab title plus placeholders for the remaining tabs.
 */
function parseCollapsedTabs(desc: string): string[] {
  const titleMatch = desc.match(/"([^"]+)"/);
  const firstTitle = titleMatch ? titleMatch[1] : "Untitled";
  const countMatch = desc.match(/and\s+(\d+)\s+Other\s+Tab/i);
  const otherCount = countMatch ? parseInt(countMatch[1], 10) : 0;
  const tabs = [firstTitle];
  for (let i = 0; i < otherCount; i++) {
    tabs.push(`Tab ${i + 2}`);
  }
  return tabs;
}

/**
 * Switches to a tab using Chrome's native `active tab index`.
 * Works for both expanded and collapsed groups — no AX interaction needed.
 * @param chromeTabIndex 1-based Chrome tab index
 */
export async function switchToTab(chromeTabIndex: number): Promise<void> {
  const script = `
    if application "Google Chrome" is not running then error "CHROME_NOT_RUNNING" number 1001
    tell application "Google Chrome"
      if (count of windows) is 0 then error "CHROME_NO_WINDOW" number 1002
      set tabCount to count of tabs of front window
      if ${chromeTabIndex} > tabCount then
        error "Tab index out of range" number 1003
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
      set tabURL to URL of currentTab
      if tabURL is missing value then set tabURL to ""
      set tabTitle to title of currentTab
      if tabTitle is missing value then set tabTitle to ""
      return (tabTitle as string) & ${fs} & (tabURL as string) & ${fs} & tabHTML
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
