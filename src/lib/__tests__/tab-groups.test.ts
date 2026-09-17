import { describe, expect, it } from "vitest";
import { parseSnapshot, reconcileGroups } from "../tab-groups";
const snap = (titles: string[], window = "w") =>
  parseSnapshot([
    window,
    titles.map((title, i) => [String(i + 1), title, "https://example.test"]),
  ]);

describe("group reconciliation", () => {
  it("maps collapsed, expanded and ungrouped tabs to native IDs", () => {
    const snapshot = snap(["Pinned", "A", "B", "C", "D"]);
    expect(
      reconcileGroups(
        snapshot,
        [
          ["T"],
          ["G", ' Work - "A" and 1 Other Tab - Collapsed', 0],
          ["G", ' Play - "C" - Expanded', 1],
          ["T"],
        ],
        snapshot,
      ).map((g) => [g.name, g.collapsed, g.tabs.map((t) => t.tabId)]),
    ).toEqual([
      ["Work", true, ["2", "3"]],
      ["Play", false, ["4"]],
      ["Ungrouped", false, ["1", "5"]],
    ]);
  });
  it.each([
    "Research and 9 Other Tabs",
    '"Quotes" - Collapsed',
    "one\u001f\u001e😀",
    'x" and 9 Other Tabs - Collapsed',
  ])("does not interpret title text as metadata: %s", (title) => {
    const snapshot = snap([title, "Second", "Third"]);
    const groups = reconcileGroups(
      snapshot,
      [
        [
          "G",
          ` Collapsed and 8 Other Tabs - "${title}" and 1 Other Tab - Collapsed`,
          0,
        ],
        ["T"],
      ],
      snapshot,
    );
    expect(groups[0]?.tabs.map((t) => t.tabId)).toEqual(["1", "2"]);
    expect(groups[1]?.tabs[0]?.tabId).toBe("3");
  });
  it("parses expanded state even when the group name says Collapsed", () => {
    const snapshot = snap(["A"]);
    expect(
      reconcileGroups(
        snapshot,
        [["G", ' Collapsed - "A" - Expanded', 1]],
        snapshot,
      )[0]?.collapsed,
    ).toBe(false);
  });
  it("supports unnamed groups and counts over the former clamp", () => {
    const snapshot = snap(Array.from({ length: 501 }, (_, i) => `T${i}`));
    const group = reconcileGroups(
      snapshot,
      [["G", ' - "T0" and 500 Other Tabs - Collapsed', 0]],
      snapshot,
    )[0];
    expect(group?.name).toBe("Unnamed Group");
    expect(group?.tabs).toHaveLength(501);
  });
  it.each(
    [
      [],
      [["X"]],
      [["T"]],
      [["G", ' Work - "A" - Expanded', 2]],
      [["G", ' Work - "A" and 3 Other Tabs - Collapsed', 0]],
      [["G", ' Work - "Wrong" and 1 Other Tab - Collapsed', 0]],
      [["G", ' Work - "A" and 1 Other Tab - Collapsed', 2]],
      [["G", ' Work - "A" and 1 Other Tab - Expanded', "2"]],
      [["G", ' Work - "A" and 1 Other Tab - Expanded', 2.5]],
      [["G", ' Work - "A" - Réduit', 0]],
    ].map((records) => ({ records })),
  )("rejects partial or unsupported records %#", ({ records }) => {
    const snapshot = snap(["A", "B"]);
    expect(() => reconcileGroups(snapshot, records, snapshot)).toThrow();
  });
  it("rejects changed window, title or ordering even with equal counts", () => {
    const before = snap(["A", "B"]);
    const records = [["T"], ["T"]];
    for (const after of [
      snap(["A", "B"], "other"),
      snap(["B", "A"]),
      snap(["A", "Changed"]),
    ])
      expect(() => reconcileGroups(before, records, after)).toThrow();
  });
  it("supports an empty native snapshot only with no records", () => {
    const snapshot = snap([]);
    expect(reconcileGroups(snapshot, [], snapshot)).toEqual([]);
  });
  it.each(
    [
      null,
      [],
      ["", []],
      [
        "w",
        [
          ["1", "A", "U"],
          ["1", "B", "U"],
        ],
      ],
      ["w", [[1, "T", "U"]]],
    ].map((value) => ({ value })),
  )("rejects malformed native snapshots %#", ({ value }) => {
    expect(() => parseSnapshot(value)).toThrow();
  });
});

it.each(["Expanded", "Collapsed"])(
  "validates every title in Chrome's bullet grammar (%s)",
  (state) => {
    const snapshot = snap(["", "Second, •  title - 9 Tabs", "Ungrouped"]);
    const description = ` Work - 2 Tabs, •  https://example.test, •  Second, •  title - 9 Tabs - ${state}`;
    const records = [["G", description, state === "Expanded" ? 2 : 0], ["T"]];
    expect(reconcileGroups(snapshot, records, snapshot)[0]).toMatchObject({
      name: "Work",
      collapsed: state === "Collapsed",
      tabs: snapshot.tabs.slice(0, 2),
    });
    expect(() =>
      reconcileGroups(
        snapshot,
        [["G", description.replace("Second", "Wrong"), 2], ["T"]],
        snapshot,
      ),
    ).toThrow();
  },
);
