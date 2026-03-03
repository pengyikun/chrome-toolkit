import { Clipboard, showHUD } from "@raycast/api";
import { getActiveTabUrl } from "./lib/chrome";
import { showChromeError } from "./lib/toast-error";

export default async function Command() {
  try {
    const url = await getActiveTabUrl();
    await Clipboard.copy(url);
    await showHUD("Copied URL to Clipboard");
  } catch (error) {
    await showChromeError(error, "copy URL");
  }
}
