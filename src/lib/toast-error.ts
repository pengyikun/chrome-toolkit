import { showToast, Toast } from "@raycast/api";
import {
  AutomationPermissionError,
  BrowserNotRunningError,
  NoWindowError,
} from "./errors";

/**
 * Displays a contextual failure toast based on the error type.
 * Centralises Chrome-specific error handling for all commands.
 */
export async function showChromeError(
  error: unknown,
  actionLabel: string,
): Promise<void> {
  if (error instanceof BrowserNotRunningError) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Chrome Is Not Running",
      message: "Please open Google Chrome and try again.",
    });
  } else if (error instanceof NoWindowError) {
    await showToast({
      style: Toast.Style.Failure,
      title: "No Chrome Window",
      message: "Please open a Chrome window and try again.",
    });
  } else if (error instanceof AutomationPermissionError) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Permission Required",
      message:
        "Enable Chrome access in System Settings → Privacy & Security → Automation.",
    });
  } else {
    await showToast({
      style: Toast.Style.Failure,
      title: `Failed to ${actionLabel}`,
      message:
        error instanceof Error
          ? error.message
          : "An unexpected error occurred.",
    });
  }
}
