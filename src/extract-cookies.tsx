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
import { buildPageMarkdown } from "./lib/markdown";
import { useChromeData } from "./lib/use-chrome-data";

interface CookiePage {
  json: string;
  count: number;
  title: string;
  url: string;
}

async function fetchCookiePage(): Promise<CookiePage> {
  const page = await getActiveTabCookies();
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
    onSuccess: async (page) => {
      // Cookies are session credentials — keep them out of clipboard history.
      await Clipboard.copy(page.json, { concealed: true });
      await showToast({
        style: Toast.Style.Success,
        title: `${page.count} Cookie${page.count === 1 ? "" : "s"} Copied to Clipboard`,
        message: page.title || page.url || "Active tab",
      });
    },
  });

  const markdown = useMemo(() => {
    if (error) return `**Error**\n\n${error}`;
    if (!data) return "Extracting cookies from Google Chrome…";
    return buildPageMarkdown({
      title: data.title,
      url: data.url,
      body: data.json,
      language: "json",
    });
  }, [error, data]);

  return (
    <Detail
      isLoading={loading}
      markdown={markdown}
      actions={
        <ActionPanel>
          {!error && data?.json && (
            <Action.CopyToClipboard
              title="Copy Cookies JSON"
              content={data.json}
              concealed
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
