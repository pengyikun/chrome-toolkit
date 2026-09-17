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
    // Accept only a unique, complete native-title/count match. Chrome has
    // shipped both a quoted-first-title and a bullet-separated-title grammar.
    const candidates: { name: string; count: number; collapsed: boolean }[] =
      [];
    const suffix = description.match(
      /"(?: and (\d+) Other Tabs?)? - (Expanded|Collapsed)$/,
    );
    if (suffix) {
      const count = suffix[1] === undefined ? 1 : Number(suffix[1]) + 1;
      const tail = ` - "${firstTab.title}${suffix[0]}`;
      if (description.endsWith(tail))
        candidates.push({
          name: description.slice(0, -tail.length),
          count,
          collapsed: suffix[2] === "Collapsed",
        });
    }
    for (const match of description.matchAll(/ - (\d+) Tabs?, • {2}/g)) {
      const count = Number(match[1]);
      if (
        !Number.isSafeInteger(count) ||
        count < 1 ||
        index + count > before.tabs.length
      )
        continue;
      const titles = before.tabs
        .slice(index, index + count)
        .map((tab) => tab.title || tab.url)
        .join(", •  ");
      for (const state of ["Expanded", "Collapsed"]) {
        const tail = ` - ${count} Tab${count === 1 ? "" : "s"}, •  ${titles} - ${state}`;
        if (description.slice(match.index) === tail)
          candidates.push({
            name: description.slice(0, match.index),
            count,
            collapsed: state === "Collapsed",
          });
      }
    }
    if (candidates.length !== 1) return invalid();
    const { count, collapsed } = candidates[0]!;
    if (
      !Number.isSafeInteger(count) ||
      count < 1 ||
      index + count > before.tabs.length
    )
      return invalid();
    if (collapsed ? visible !== 0 : visible !== count) return invalid();
    const name = candidates[0]!.name.trim() || "Unnamed Group";
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
