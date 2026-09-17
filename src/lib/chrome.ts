import { runAppleScript } from "@raycast/utils";
import {
  AccessibilityPermissionError,
  AutomationPermissionError,
  BrowserNotRunningError,
  JavaScriptDisabledError,
  NoWindowError,
  UnexpectedResponseError,
  PayloadTooLargeError,
} from "./errors";
import {
  AX_SCRIPT,
  COOKIE_LIMIT,
  EXTRACT_SCRIPT,
  extractionJavaScript,
  HTML_LIMIT,
  MAX_OUTPUT_BYTES,
  SNAPSHOT_SCRIPT,
  SWITCH_SCRIPT,
  TAB_INFO_SCRIPT,
} from "./chrome-scripts";
import {
  parseSnapshot,
  reconcileGroups,
  TabRef,
  TabSearchResult,
} from "./tab-groups";
export type {
  ChromeTab,
  TabGroup,
  TabRef,
  TabSearchResult,
} from "./tab-groups";

function mapAppleScriptError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  const code = message.match(/\((-?\d+)\)\s*$/)?.[1];
  if (code === "1001") throw new BrowserNotRunningError();
  if (code === "1002") throw new NoWindowError();
  if (code === "1003")
    throw new UnexpectedResponseError("tab moved or closed; refresh the list");
  if (code === "1004")
    throw new UnexpectedResponseError("could not read Chrome's tab groups");
  if (code === "1005") throw new PayloadTooLargeError();
  if (code === "1006") throw new UnexpectedResponseError();
  if (message.includes("JavaScript through AppleScript"))
    throw new JavaScriptDisabledError();
  if (code === "-25211" || message.includes("assistive access"))
    throw new AccessibilityPermissionError();
  if (code === "-1743" || /not authori[sz]ed/i.test(message))
    throw new AutomationPermissionError();
  if (/Application isn't running|is not running/.test(message))
    throw new BrowserNotRunningError();
  // Subprocess errors may include stdout (HTML or credentials). Never surface it.
  throw new Error(
    "Could not communicate with Google Chrome. Refresh and try again.",
  );
}

async function runChromeScript(
  script: string,
  args: string[] = [],
  signal?: AbortSignal,
  timeout = 5_000,
): Promise<unknown> {
  signal?.throwIfAborted();
  let text: string;
  try {
    text = await runAppleScript(script, args, { timeout, signal });
  } catch (error) {
    signal?.throwIfAborted();
    mapAppleScriptError(error);
  }
  signal?.throwIfAborted();
  if (Buffer.byteLength(text, "utf8") > MAX_OUTPUT_BYTES)
    throw new PayloadTooLargeError();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new UnexpectedResponseError("invalid JSON response");
  }
}

export async function getActiveTabInfo(
  signal?: AbortSignal,
): Promise<{ url: string; title: string }> {
  const value = await runChromeScript(TAB_INFO_SCRIPT, [], signal);
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !value.every((s: unknown) => typeof s === "string")
  ) {
    throw new UnexpectedResponseError("invalid tab info");
  }
  return { url: value[0] as string, title: value[1] as string };
}

export async function getActiveTabUrl(signal?: AbortSignal): Promise<string> {
  return (await getActiveTabInfo(signal)).url;
}

async function extract(
  kind: "html" | "cookies",
  signal?: AbortSignal,
): Promise<{ title: string; url: string; body: string }> {
  const value = await runChromeScript(
    EXTRACT_SCRIPT,
    [extractionJavaScript(kind)],
    signal,
    kind === "html" ? 15_000 : 5_000,
  );
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new UnexpectedResponseError();
  if ("error" in value && value.error === "too-large")
    throw new PayloadTooLargeError();
  if (
    !("title" in value) ||
    typeof value.title !== "string" ||
    !("url" in value) ||
    typeof value.url !== "string" ||
    !("body" in value) ||
    typeof value.body !== "string"
  ) {
    throw new UnexpectedResponseError("invalid extracted page");
  }
  if (value.body.length > (kind === "html" ? HTML_LIMIT : COOKIE_LIMIT))
    throw new PayloadTooLargeError();
  return { title: value.title, url: value.url, body: value.body };
}

export async function getActiveTabHtml(signal?: AbortSignal) {
  const { body, ...page } = await extract("html", signal);
  return { ...page, html: body };
}
export async function getActiveTabCookies(signal?: AbortSignal) {
  const { body, ...page } = await extract("cookies", signal);
  return { ...page, cookies: body };
}

async function snapshot(signal?: AbortSignal) {
  return parseSnapshot(await runChromeScript(SNAPSHOT_SCRIPT, [], signal));
}

export async function getTabGroups(
  signal?: AbortSignal,
): Promise<TabSearchResult> {
  let reason = "Chrome's group layout is unsupported or changed while reading.";
  for (let attempt = 0; attempt < 2; attempt++) {
    const before = await snapshot(signal);
    let records: unknown;
    try {
      records = await runChromeScript(AX_SCRIPT, [], signal, 10_000);
    } catch (error) {
      signal?.throwIfAborted();
      if (
        error instanceof BrowserNotRunningError ||
        error instanceof NoWindowError
      )
        throw error;
      if (
        error instanceof AccessibilityPermissionError ||
        error instanceof AutomationPermissionError
      ) {
        reason = error.message;
        break;
      }
      // An AX timeout or unreadable layout must not prevent native tab search.
      continue;
    }
    const after = await snapshot(signal);
    try {
      return {
        kind: "grouped",
        groups: reconcileGroups(before, records, after),
      };
    } catch (error) {
      if (!(error instanceof UnexpectedResponseError)) throw error;
    }
  }
  const fresh = await snapshot(signal);
  return {
    kind: "all-tabs",
    tabs: fresh.tabs,
    warning: `Group information unavailable. ${reason}`,
  };
}

export async function switchToTab(target: TabRef): Promise<void> {
  if (
    !target ||
    typeof target.windowId !== "string" ||
    !target.windowId ||
    typeof target.tabId !== "string" ||
    !target.tabId
  ) {
    throw new TypeError("Invalid Chrome tab reference");
  }
  const result = await runChromeScript(SWITCH_SCRIPT, [
    target.windowId,
    target.tabId,
  ]);
  if (!Array.isArray(result) || result.length !== 1 || result[0] !== true)
    throw new UnexpectedResponseError();
}
