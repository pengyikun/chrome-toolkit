import {
  Action,
  ActionPanel,
  Clipboard,
  Detail,
  Icon,
  showToast,
  Toast,
} from "@raycast/api";
import { useMemo } from "react";
import { getActiveTabHtml } from "./lib/chrome";
import {
  buildPageMarkdown,
  displayText,
  escapeMarkdownInline,
  isSafeBrowserUrl,
} from "./lib/markdown";
import { useChromeData } from "./lib/use-chrome-data";

/**
 * Maximum characters of HTML rendered in the Detail view — very large pages
 * would freeze the Markdown renderer. The clipboard always gets the full HTML.
 */
const MAX_DISPLAY_CHARS = 100_000;

export default function Command() {
  const { data, loading, error, reload } = useChromeData({
    fetch: getActiveTabHtml,
    actionLabel: "extract HTML",
    successActionLabel: "copy HTML",
    onSuccess: async (page, isCurrent) => {
      if (!isCurrent()) return;
      await Clipboard.copy(page.html, { concealed: true });
      if (!isCurrent()) return;
      try {
        await showToast({
          style: Toast.Style.Success,
          title: "Body HTML Copied to Clipboard",
          message: displayText(page.title || page.url || "Active tab", 500),
        });
      } catch {
        // The copy succeeded; a notification failure is not a copy failure.
      }
    },
  });

  const markdown = useMemo(() => {
    if (error) return `**Error**\n\n${escapeMarkdownInline(error)}`;
    if (!data) return "Extracting body HTML from Google Chrome…";
    return buildPageMarkdown({
      title: data.title,
      url: data.url,
      body: data.html,
      language: "html",
      maxBodyChars: MAX_DISPLAY_CHARS,
    });
  }, [error, data]);

  return (
    <Detail
      isLoading={loading}
      markdown={markdown}
      actions={
        <ActionPanel>
          {!loading && !error && data?.html && (
            <Action.CopyToClipboard
              title="Copy Body HTML"
              content={data.html}
              concealed
            />
          )}
          {!loading && !error && data?.url && isSafeBrowserUrl(data.url) && (
            <Action.OpenInBrowser url={data.url} />
          )}
          <Action
            title="Refresh"
            icon={Icon.RotateClockwise}
            onAction={reload}
          />
        </ActionPanel>
      }
    />
  );
}
