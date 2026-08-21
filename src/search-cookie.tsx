import { Action, ActionPanel, Icon, Keyboard, List } from "@raycast/api";
import { useMemo, useState } from "react";
import { getActiveTabCookies } from "./lib/chrome";
import { Cookie, parseCookieString } from "./lib/cookies";
import { useChromeData } from "./lib/use-chrome-data";

async function fetchCookies(): Promise<Cookie[]> {
  const page = await getActiveTabCookies();
  return parseCookieString(page.cookies);
}

export default function Command() {
  const [searchText, setSearchText] = useState("");
  const { data, loading, error, reload } = useChromeData({
    fetch: fetchCookies,
    actionLabel: "extract cookies",
  });

  const filtered = useMemo(() => {
    const cookies = data ?? [];
    const query = searchText.toLowerCase();
    return cookies.filter((c) => c.name.toLowerCase().includes(query));
  }, [data, searchText]);

  return (
    <List
      isLoading={loading}
      searchBarPlaceholder="Search cookie by name…"
      onSearchTextChange={setSearchText}
      throttle
    >
      {error ? (
        <List.EmptyView
          icon={Icon.ExclamationMark}
          title="Error"
          description={error}
        />
      ) : filtered.length === 0 && !loading ? (
        <List.EmptyView
          icon={Icon.MagnifyingGlass}
          title="No Cookies Found"
          description="The page has no cookies readable from JavaScript (HttpOnly cookies are not visible)."
        />
      ) : (
        filtered.map((cookie, index) => (
          <List.Item
            key={`${cookie.name}-${index}`}
            title={cookie.name}
            subtitle={cookie.value}
            actions={
              <ActionPanel>
                <Action.CopyToClipboard
                  title="Copy Cookie Value"
                  content={cookie.value}
                  concealed
                />
                <Action.CopyToClipboard
                  title="Copy Cookie Name"
                  content={cookie.name}
                  shortcut={Keyboard.Shortcut.Common.Copy}
                />
                <Action
                  title="Refresh"
                  icon={Icon.RotateClockwise}
                  onAction={reload}
                  shortcut={Keyboard.Shortcut.Common.Refresh}
                />
              </ActionPanel>
            }
          />
        ))
      )}
    </List>
  );
}
