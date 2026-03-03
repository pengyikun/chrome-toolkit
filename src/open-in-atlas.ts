import { showHUD, showToast, Toast } from "@raycast/api";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getActiveTabUrl } from "./lib/chrome";
import { showChromeError } from "./lib/toast-error";

const execFileAsync = promisify(execFile);

const ATLAS_APP_PATHS = [
  "/Applications/ChatGPT Atlas.app",
  `${process.env.HOME}/Applications/ChatGPT Atlas.app`,
];

function findAtlasAppPath(): string | null {
  return ATLAS_APP_PATHS.find((p) => existsSync(p)) ?? null;
}

function isValidWebUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export default async function Command() {
  try {
    const atlasPath = findAtlasAppPath();
    if (!atlasPath) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Atlas Not Found",
        message:
          "ChatGPT Atlas browser could not be found in the Applications folder.",
      });
      return;
    }

    const url = await getActiveTabUrl();

    if (!isValidWebUrl(url)) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Invalid URL",
        message: `"${url}" is not a valid HTTP/HTTPS address.`,
      });
      return;
    }

    await execFileAsync("open", ["-a", atlasPath, url]);
    await showHUD("Opened in Atlas ✓");
  } catch (error) {
    await showChromeError(error, "open in Atlas");
  }
}
