import { UnexpectedResponseError } from "./errors";

export interface TabRef {
  windowId: string;
  tabId: string;
}
export interface ChromeTab extends TabRef {
  title: string;
  url: string;
}
export interface TabGroup {
  name: string;
  collapsed: boolean;
  tabs: ChromeTab[];
}
export type TabSearchResult =
  | { kind: "grouped"; groups: TabGroup[] }
  | { kind: "all-tabs"; tabs: ChromeTab[]; warning: string };
export interface TabSnapshot {
  windowId: string;
  tabs: ChromeTab[];
}

function invalid(): never {
  throw new UnexpectedResponseError(
    "tab snapshot changed or is unsupported; refresh to try again",
  );
}

export function parseSnapshot(value: unknown): TabSnapshot {
  if (!Array.isArray(value) || value.length !== 2) return invalid();
  const [windowId, rows] = value;
  if (typeof windowId !== "string" || !windowId || !Array.isArray(rows))
    return invalid();
  const ids = new Set<string>();
  const tabs = rows.map((row: unknown): ChromeTab => {
    if (
      !Array.isArray(row) ||
      row.length !== 3 ||
      !row.every((v: unknown) => typeof v === "string")
    )
      return invalid();
    const [tabId, title, url] = row as [string, string, string];
    if (!tabId || ids.has(tabId)) return invalid();
    ids.add(tabId);
    return { windowId, tabId, title, url };
  });
  return { windowId, tabs };
}

/** Reconcile external AX facts only against an unchanged native snapshot. */
export function reconcileGroups(
  before: TabSnapshot,
  records: unknown,
  after: TabSnapshot,
): TabGroup[] {
  if (
    before.windowId !== after.windowId ||
    before.tabs.length !== after.tabs.length ||
    !before.tabs.every((tab, i) => {
      const next = after.tabs[i];
      return (
        next?.tabId === tab.tabId &&
        next.title === tab.title &&
        next.url === tab.url
      );
    }) ||
    !Array.isArray(records)
  )
    return invalid();
  const groups: TabGroup[] = [];
  const ungrouped: ChromeTab[] = [];
  let index = 0;
  for (const record of records) {
    if (!Array.isArray(record)) return invalid();
    const firstTab = before.tabs[index];
    if (!firstTab) return invalid();
    if (record.length === 1 && record[0] === "T") {
      ungrouped.push(firstTab);
      index++;
      continue;
    }
    if (record.length !== 3 || record[0] !== "G") return invalid();
    const [, description, visible] = record;
    if (
      typeof description !== "string" ||
      !Number.isSafeInteger(visible) ||
      visible < 0
    )
      return invalid();
    // Only terminal metadata is grammar. The known native title must match
    // verbatim, so title/group text cannot be interpreted as a tab count.
    const suffix = description.match(
      /"(?: and (\d+) Other Tabs?)? - (Expanded|Collapsed)$/,
    );
    if (!suffix) return invalid();
    const count = suffix[1] === undefined ? 1 : Number(suffix[1]) + 1;
    const collapsed = suffix[2] === "Collapsed";
    if (
      !Number.isSafeInteger(count) ||
      count < 1 ||
      index + count > before.tabs.length
    )
      return invalid();
    if (collapsed ? visible !== 0 : visible !== count) return invalid();
    const tail = ` - "${firstTab.title}${suffix[0]}`;
    if (!description.endsWith(tail)) return invalid();
    const name = description.slice(0, -tail.length).trim() || "Unnamed Group";
    groups.push({
      name,
      collapsed,
      tabs: before.tabs.slice(index, index + count),
    });
    index += count;
  }
  if (index !== before.tabs.length) return invalid();
  if (ungrouped.length)
    groups.push({ name: "Ungrouped", collapsed: false, tabs: ungrouped });
  return groups;
}
