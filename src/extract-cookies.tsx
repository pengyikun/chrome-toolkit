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
import { getActiveTabCookies } from "./lib/chrome";
import { parseCookieString } from "./lib/cookies";
import {
  buildPageMarkdown,
  displayText,
  escapeMarkdownInline,
  isSafeBrowserUrl,
} from "./lib/markdown";
import { useChromeData } from "./lib/use-chrome-data";

interface CookiePage {
  json: string;
  count: number;
  title: string;
  url: string;
}

async function fetchCookiePage(signal: AbortSignal): Promise<CookiePage> {
  const page = await getActiveTabCookies(signal);
  const cookies = parseCookieString(page.cookies);
  return {
    json: JSON.stringify(cookies, null, 2),
    count: cookies.length,
    title: page.title,
    url: page.url,
  };
}

export default function Command() {
  const { data, loading, error, reload } = useChromeData({
    fetch: fetchCookiePage,
    actionLabel: "extract cookies",
    successActionLabel: "copy cookies",
    onSuccess: async (page, isCurrent) => {
      if (!isCurrent()) return;
      // Cookies are session credentials — keep them out of clipboard history.
      await Clipboard.copy(page.json, { concealed: true });
      if (!isCurrent()) return;
      try {
        await showToast({
          style: Toast.Style.Success,
          title: `${page.count} Cookie${page.count === 1 ? "" : "s"} Copied to Clipboard`,
          message: displayText(page.title || page.url || "Active tab", 500),
        });
      } catch {
        // The copy succeeded; a notification failure is not a copy failure.
      }
    },
  });

  const markdown = useMemo(() => {
    if (error) return `**Error**\n\n${escapeMarkdownInline(error)}`;
    if (!data) return "Extracting cookies from Google Chrome…";
    return buildPageMarkdown({
      title: data.title,
      url: data.url,
      body: data.json,
      language: "json",
      maxBodyChars: 100_000,
    });
  }, [error, data]);

  return (
    <Detail
      isLoading={loading}
      markdown={markdown}
      actions={
        <ActionPanel>
          {!loading && !error && data?.json && (
            <Action.CopyToClipboard
              title="Copy Cookies JSON"
              content={data.json}
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
