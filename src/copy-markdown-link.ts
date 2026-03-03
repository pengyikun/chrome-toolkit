import { Clipboard, showHUD } from "@raycast/api";
import { getActiveTabInfo } from "./lib/chrome";
import { escapeMarkdownLinkText, escapeMarkdownLinkUrl } from "./lib/markdown";
import { showChromeError } from "./lib/toast-error";

export default async function Command() {
  try {
    const { url, title } = await getActiveTabInfo();
    const safeTitle = escapeMarkdownLinkText(title || url);
    const safeUrl = escapeMarkdownLinkUrl(url);
    const markdown = `[${safeTitle}](<${safeUrl}>)`;
    await Clipboard.copy(markdown);
    await showHUD("Copied Markdown Link to Clipboard");
  } catch (error) {
    await showChromeError(error, "copy Markdown link");
  }
}
