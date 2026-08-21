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
import { buildPageMarkdown } from "./lib/markdown";
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
    onSuccess: async (page) => {
      await Clipboard.copy(page.html);
      await showToast({
        style: Toast.Style.Success,
        title: "Body HTML Copied to Clipboard",
        message: page.title || page.url || "Active tab",
      });
    },
  });

  const markdown = useMemo(() => {
    if (error) return `**Error**\n\n${error}`;
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
          {!error && data?.html && (
            <Action.CopyToClipboard
              title="Copy Body HTML"
              content={data.html}
            />
          )}
          {data?.url && <Action.OpenInBrowser url={data.url} />}
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
