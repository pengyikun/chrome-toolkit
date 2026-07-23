/** Chrome is not running on the system. */
export class BrowserNotRunningError extends Error {
  constructor() {
    super("Google Chrome is not running");
    this.name = "BrowserNotRunningError";
  }
}

/** Chrome is running but has no open windows. */
export class NoWindowError extends Error {
  constructor() {
    super("No Chrome window is open");
    this.name = "NoWindowError";
  }
}

/** Raycast does not have Automation permission for Chrome. */
export class AutomationPermissionError extends Error {
  constructor() {
    super(
      "Raycast is not permitted to control Google Chrome. Enable it in System Settings → Privacy & Security → Automation.",
    );
    this.name = "AutomationPermissionError";
  }
}

/** Raycast does not have Accessibility permission (needed for UI scripting). */
export class AccessibilityPermissionError extends Error {
  constructor() {
    super(
      "Raycast is not permitted to read Chrome's UI. Enable Raycast in System Settings → Privacy & Security → Accessibility.",
    );
    this.name = "AccessibilityPermissionError";
  }
}

/** Chrome's "Allow JavaScript from Apple Events" setting is turned off. */
export class JavaScriptDisabledError extends Error {
  constructor() {
    super(
      "Chrome blocks JavaScript from Apple Events. In Chrome, enable View → Developer → Allow JavaScript from Apple Events.",
    );
    this.name = "JavaScriptDisabledError";
  }
}

/** Chrome returned an unparseable response. */
export class UnexpectedResponseError extends Error {
  constructor(detail?: string) {
    super(
      `Unexpected response from Google Chrome${detail ? `: ${detail}` : ""}`,
    );
    this.name = "UnexpectedResponseError";
  }
}
