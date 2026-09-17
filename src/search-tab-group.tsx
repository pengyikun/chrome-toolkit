import {
  Action,
  ActionPanel,
  Icon,
  Keyboard,
  List,
  showHUD,
} from "@raycast/api";
import { useCallback, useMemo, useState } from "react";
import { ChromeTab, getTabGroups, switchToTab, TabGroup } from "./lib/chrome";
import { showChromeError } from "./lib/toast-error";
import { useChromeData } from "./lib/use-chrome-data";

export default function Command() {
  const [searchText, setSearchText] = useState("");
  const { data, loading, error, reload } = useChromeData({
    fetch: getTabGroups,
    actionLabel: "get tab groups",
  });
  const handleSwitch = useCallback(async (tab: ChromeTab) => {
    try {
      await switchToTab(tab);
      await showHUD(`Switched to "${tab.title}" ✓`);
    } catch (error) {
      await showChromeError(error, "switch tab");
    }
  }, []);
  const groups = useMemo<TabGroup[]>(() => {
    if (!data) return [];
    return data.kind === "grouped"
      ? data.groups
      : [{ name: "All Tabs", collapsed: false, tabs: data.tabs }];
  }, [data]);
  const query = searchText.toLowerCase();
  const filtered = useMemo(
    () =>
      groups.flatMap((group) => {
        const tabs = group.name.toLowerCase().includes(query)
          ? group.tabs
          : group.tabs.filter((tab) => tab.title.toLowerCase().includes(query));
        return tabs.length ? [{ ...group, tabs }] : [];
      }),
    [groups, query],
  );
  const refresh = (
    <Action
      title="Refresh"
      icon={Icon.RotateClockwise}
      onAction={reload}
      shortcut={Keyboard.Shortcut.Common.Refresh}
    />
  );
  return (
    <List
      isLoading={loading}
      searchBarPlaceholder="Search tab groups or tabs…"
      onSearchTextChange={setSearchText}
      actions={<ActionPanel>{refresh}</ActionPanel>}
    >
      {!loading && !error && data?.kind === "all-tabs" && (
        <List.Item
          id="group-warning"
          icon={Icon.ExclamationMark}
          title="Group Information Unavailable"
          subtitle={data.warning}
          actions={<ActionPanel>{refresh}</ActionPanel>}
        />
      )}
      {error ? (
        <List.EmptyView
          icon={Icon.ExclamationMark}
          title="Error"
          description={error}
        />
      ) : !loading && filtered.length === 0 && data?.kind !== "all-tabs" ? (
        <List.EmptyView
          icon={Icon.AppWindowGrid3x3}
          title={query ? "No Matching Tabs" : "No Tabs Found"}
          description={
            query
              ? "Try a different title or group name."
              : "Open a Chrome tab and refresh."
          }
        />
      ) : !loading ? (
        <>
          {data?.kind === "all-tabs" && filtered.length === 0 && (
            <List.Item
              id="no-matches"
              title={query ? "No Matching Tabs" : "No Tabs Found"}
              actions={<ActionPanel>{refresh}</ActionPanel>}
            />
          )}
          {filtered.map((group) => (
            <List.Section
              key={`${group.tabs[0]?.windowId}:${group.tabs[0]?.tabId}`}
              title={group.name}
              subtitle={`${group.tabs.length} tab${group.tabs.length === 1 ? "" : "s"}${group.collapsed ? " · collapsed" : ""}`}
            >
              {group.tabs.map((tab) => (
                <List.Item
                  key={`${tab.windowId}:${tab.tabId}`}
                  id={`${tab.windowId}:${tab.tabId}`}
                  icon={Icon.Globe}
                  title={tab.title || "Untitled"}
                  actions={
                    <ActionPanel>
                      <Action
                        title="Switch to This Tab"
                        icon={Icon.ArrowRight}
                        onAction={() => handleSwitch(tab)}
                      />
                      {refresh}
                    </ActionPanel>
                  }
                />
              ))}
            </List.Section>
          ))}
        </>
      ) : null}
    </List>
  );
}
