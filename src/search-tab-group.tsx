import {
  Action,
  ActionPanel,
  Icon,
  Keyboard,
  List,
  showHUD,
} from "@raycast/api";
import { useCallback, useMemo, useState } from "react";
import { getTabGroups, switchToTab } from "./lib/chrome";
import { showChromeError } from "./lib/toast-error";
import { useChromeData } from "./lib/use-chrome-data";

export default function Command() {
  const [searchText, setSearchText] = useState("");
  const { data, loading, error, reload } = useChromeData({
    fetch: getTabGroups,
    actionLabel: "get tab groups",
  });
  const groups = useMemo(() => data ?? [], [data]);

  const handleSwitch = useCallback(
    async (chromeIndex: number | undefined, tabTitle: string) => {
      try {
        if (chromeIndex === undefined) {
          throw new RangeError(
            "The tab's position is no longer known — refresh the list",
          );
        }
        await switchToTab(chromeIndex);
        await showHUD(`Switched to "${tabTitle}" ✓`);
      } catch (error) {
        await showChromeError(error, "switch tab");
      }
    },
    [],
  );

  const query = searchText.toLowerCase();
  const filtered = useMemo(() => {
    if (!query) return groups;
    return groups.filter(
      (g) =>
        g.name.toLowerCase().includes(query) ||
        g.tabs.some((t) => t.toLowerCase().includes(query)),
    );
  }, [groups, query]);

  return (
    <List
      isLoading={loading}
      searchBarPlaceholder="Search tab groups or tabs…"
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
              key={`${group.name}-${group.tabIndices[0] ?? gi}`}
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
                        onAction={reload}
                        shortcut={Keyboard.Shortcut.Common.Refresh}
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
