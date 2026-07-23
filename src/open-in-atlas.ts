import { showHUD, showToast, Toast } from "@raycast/api";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getActiveTabUrl } from "./lib/chrome";
import { showChromeError } from "./lib/toast-error";

const execFileAsync = promisify(execFile);

/**
 * App name resolved by Launch Services, so the app is found wherever it is
 * installed rather than only at hardcoded paths.
 */
const ATLAS_APP_NAME = "ChatGPT Atlas";

function isValidWebUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** True when `open` failed because the app is not installed. */
function isAppNotFound(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const stderr = (error as { stderr?: string }).stderr ?? "";
  return (
    error.message.includes("Unable to find application") ||
    stderr.includes("Unable to find application")
  );
}

export default async function Command() {
  try {
    const url = await getActiveTabUrl();

    if (!isValidWebUrl(url)) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Invalid URL",
        message: `"${url}" is not a valid HTTP/HTTPS address.`,
      });
      return;
    }

    await execFileAsync("open", ["-a", ATLAS_APP_NAME, url]);
    await showHUD("Opened in Atlas ✓");
  } catch (error) {
    if (isAppNotFound(error)) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Atlas Not Found",
        message: "The ChatGPT Atlas browser does not appear to be installed.",
      });
      return;
    }
    await showChromeError(error, "open in Atlas");
  }
}
