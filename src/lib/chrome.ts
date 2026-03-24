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
  const script = `
${TAB_CONTAINER_PREAMBLE}
        set results to ""

        repeat with el in (every UI element of tabContainer)
          if role of el is "AXGroup" then
            try
              set groupDesc to ""
              repeat with inner in (every UI element of el)
                if role of inner is "AXTabGroup" then
                  set groupDesc to description of inner
                  exit repeat
                end if
              end repeat

              if groupDesc is not "" then
                if results is not "" then
                  set results to results & ${rs}
                end if
                set groupData to groupDesc
                repeat with inner in (every UI element of el)
                  if role of inner is "AXRadioButton" then
                    set tabDesc to ""
                    try
                      set tabDesc to description of inner
                    end try
                    set groupData to groupData & ${fs} & tabDesc
                  end if
                end repeat
                set results to results & groupData
              end if
            end try
          end if
        end repeat

        return results
${TAB_CONTAINER_EPILOGUE}
  `;
  const result = await runChromeScript(script, UI_TIMEOUT_MS);
  if (!result.trim()) return [];

  return result.split("\u001E").map((record) => {
    const parts = record.split(FIELD_SEPARATOR);
    const groupDesc = parts[0] ?? "";
    const tabDescs = parts.slice(1);

    // Chrome exposes each tab twice: once as "Part of unnamed group"
    // (a metadata entry) and once as "Part of <group name>" (the actual tab).
    // Keep only the actual tab entries to get the correct count.
    const actualTabs = tabDescs.filter(
      (d) => !d.includes("Part of unnamed group"),
    );
    // Fall back to all entries if filtering removes everything
    const tabs = actualTabs.length > 0 ? actualTabs : tabDescs;

    return {
      name: parseTabGroupName(groupDesc),
      tabs: tabs.map(parseTabTitle),
    };
  });
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
 * Extracts the tab title from an AX radio-button description.
 * Format: `Tab Title - Part of group_name[ - Memory usage - NNN MB]`
 */
function parseTabTitle(desc: string): string {
  return desc.replace(/\s*-\s*Part of .+$/, "").trim() || desc.trim();
}

/**
 * Switches to a specific tab within a tab group via System Events.
 * Uses a 0-based tabIndex to identify the tab (skipping "unnamed group"
 * metadata entries, matching the filtered list shown in the UI).
 */
export async function switchToTabGroup(
  groupName: string,
  tabIndex = 0,
): Promise<void> {
  const safeName = groupName.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const script = `
${TAB_CONTAINER_PREAMBLE}
        set targetName to "${safeName}"
        set targetIndex to ${tabIndex}

        repeat with el in (every UI element of tabContainer)
          if role of el is "AXGroup" then
            try
              repeat with inner in (every UI element of el)
                if role of inner is "AXTabGroup" then
                  set groupDesc to description of inner
                  if groupDesc contains targetName then
                    -- Iterate radio buttons, skip "unnamed group" metadata,
                    -- and click the one at the target index.
                    set idx to 0
                    repeat with tabEl in (every radio button of el)
                      set tabDesc to ""
                      try
                        set tabDesc to description of tabEl
                      end try
                      if tabDesc does not contain "Part of unnamed group" then
                        if idx is equal to targetIndex then
                          click tabEl
                          return "OK"
                        end if
                        set idx to idx + 1
                      end if
                    end repeat
                    -- Fallback: click the first radio button
                    try
                      click radio button 1 of el
                    on error
                      perform action "AXPress" of inner
                    end try
                    return "OK"
                  end if
                  exit repeat
                end if
              end repeat
            end try
          end if
        end repeat

        return "NOT_FOUND"
${TAB_CONTAINER_EPILOGUE}
  `;
  const result = await runChromeScript(script, UI_TIMEOUT_MS);
  if (result.trim() === "NOT_FOUND") {
    throw new Error(`Tab group "${groupName}" not found`);
  }
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
