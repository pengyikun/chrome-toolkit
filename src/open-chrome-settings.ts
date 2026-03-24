import { showHUD, showToast, Toast } from "@raycast/api";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export default async function Command() {
  try {
    await execFileAsync("open", ["-a", "Google Chrome", "chrome://settings"]);
    await showHUD("Opened Chrome Settings ✓");
  } catch {
    await showToast({
      style: Toast.Style.Failure,
      title: "Failed to Open Settings",
      message: "Could not open Google Chrome. Is it installed?",
    });
  }
}
