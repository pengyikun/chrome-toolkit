import { Action, ActionPanel, Icon, List } from "@raycast/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { getActiveTabCookies } from "./lib/chrome";
import { Cookie, parseCookieString } from "./lib/cookies";
import { showChromeError } from "./lib/toast-error";

interface State {
  loading: boolean;
  cookies: Cookie[];
  title: string;
  url: string;
  error: string;
}

const INITIAL_STATE: State = {
  loading: true,
  cookies: [],
  title: "",
  url: "",
  error: "",
};

export default function Command() {
  const [state, setState] = useState<State>(INITIAL_STATE);
  const [searchText, setSearchText] = useState("");
  const requestIdRef = useRef(0);

  const loadCookies = useCallback(async () => {
    const id = ++requestIdRef.current;
    setState((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const page = await getActiveTabCookies();
      if (id !== requestIdRef.current) return;
      const cookies = parseCookieString(page.cookies);
      setState({
        loading: false,
        cookies,
        title: page.title,
        url: page.url,
        error: "",
      });
    } catch (error) {
      if (id !== requestIdRef.current) return;
      const message = error instanceof Error ? error.message : String(error);
      setState((prev) => ({ ...prev, loading: false, error: message }));
      await showChromeError(error, "extract cookies");
    }
  }, []);

  useEffect(() => {
    loadCookies();
  }, [loadCookies]);

  const filtered = state.cookies.filter((c) =>
    c.name.toLowerCase().includes(searchText.toLowerCase()),
  );

  return (
    <List
      isLoading={state.loading}
      searchBarPlaceholder="Search cookie by name…"
      onSearchTextChange={setSearchText}
      throttle
    >
      {state.error ? (
        <List.EmptyView
          icon={Icon.ExclamationMark}
          title="Error"
          description={state.error}
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
                  shortcut={{ modifiers: [], key: "return" }}
                />
                <Action.CopyToClipboard
                  title="Copy Cookie Name"
                  content={cookie.name}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
                />
                <Action
                  title="Refresh"
                  icon={Icon.RotateClockwise}
                  onAction={loadCookies}
                  shortcut={{ modifiers: ["cmd"], key: "r" }}
                />
              </ActionPanel>
            }
          />
        ))
      )}
    </List>
  );
}
