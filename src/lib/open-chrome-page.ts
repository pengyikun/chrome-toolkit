import { showHUD, showToast, Toast } from "@raycast/api";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Opens a chrome:// page via the system `open` command and reports the result. */
export async function openChromePage(
  url: string,
  label: string,
): Promise<void> {
  try {
    await execFileAsync("open", ["-a", "Google Chrome", url]);
    await showHUD(`Opened ${label} ✓`);
  } catch {
    await showToast({
      style: Toast.Style.Failure,
      title: `Failed to Open ${label}`,
      message: "Could not open Google Chrome. Is it installed?",
    });
  }
}
