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
