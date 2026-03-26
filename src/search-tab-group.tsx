import {
  Action,
  ActionPanel,
  Icon,
  List,
  showHUD,
  showToast,
  Toast,
} from "@raycast/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getTabGroups, switchToTab, TabGroup } from "./lib/chrome";
import { showChromeError } from "./lib/toast-error";

interface State {
  loading: boolean;
  groups: TabGroup[];
  error: string;
}

const INITIAL_STATE: State = {
  loading: true,
  groups: [],
  error: "",
};

export default function Command() {
  const [state, setState] = useState<State>(INITIAL_STATE);
  const [searchText, setSearchText] = useState("");
  const requestIdRef = useRef(0);

  const loadGroups = useCallback(async () => {
    const id = ++requestIdRef.current;
    setState((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const groups = await getTabGroups();
      if (id !== requestIdRef.current) return;
      setState({ loading: false, groups, error: "" });
    } catch (error) {
      if (id !== requestIdRef.current) return;
      const message = error instanceof Error ? error.message : String(error);
      setState((prev) => ({ ...prev, loading: false, error: message }));
      await showChromeError(error, "get tab groups");
    }
  }, []);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const handleSwitch = useCallback(
    async (chromeIndex: number, tabTitle: string) => {
      try {
        await switchToTab(chromeIndex);
        await showHUD(`Switched to "${tabTitle}" ✓`);
      } catch (error) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Failed to Switch",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [],
  );

  const query = searchText.toLowerCase();
  const filtered = useMemo(() => {
    if (!query) return state.groups;
    return state.groups.filter(
      (g) =>
        g.name.toLowerCase().includes(query) ||
        g.tabs.some((t) => t.toLowerCase().includes(query)),
    );
  }, [state.groups, query]);

  return (
    <List
      isLoading={state.loading}
      searchBarPlaceholder="Search tab groups or tabs…"
      onSearchTextChange={setSearchText}
      throttle
    >
      {state.error ? (
        <List.EmptyView
          icon={Icon.ExclamationMark}
          title="Error"
          description={state.error}
        />
      ) : filtered.length === 0 && !state.loading ? (
        <List.EmptyView
          icon={Icon.AppWindowGrid3x3}
          title="No Tab Groups Found"
          description="The front Chrome window has no named tab groups."
        />
      ) : (
        filtered.map((group, gi) => {
          const count = group.tabs.length;
          const status = group.collapsed ? "collapsed" : "";
          const subtitle = [`${count} tab${count === 1 ? "" : "s"}`, status]
            .filter(Boolean)
            .join(" · ");
          return (
            <List.Section
              key={`${group.name}-${gi}`}
              title={group.name}
              subtitle={subtitle}
            >
              {group.tabs.map((title, ti) => (
                <List.Item
                  key={`${group.name}-${ti}`}
                  icon={Icon.Globe}
                  title={title}
                  actions={
                    <ActionPanel>
                      <Action
                        title="Switch to This Tab"
                        icon={Icon.ArrowRight}
                        onAction={() =>
                          handleSwitch(group.tabIndices[ti], title)
                        }
                      />
                      <Action
                        title="Refresh"
                        icon={Icon.RotateClockwise}
                        onAction={loadGroups}
                        shortcut={{ modifiers: ["cmd"], key: "r" }}
                      />
                    </ActionPanel>
                  }
                />
              ))}
            </List.Section>
          );
        })
      )}
    </List>
  );
}
