import { describe, it, expect } from "vitest";
import { parseAXTree } from "../ax-tree";
const node = (role: string, children: unknown[] = [], label = "") => [
  role,
  label,
  children,
];
const tab = () => node("AXRadioButton");
const strip = (...regions: unknown[]) =>
  node("AXWindow", [node("AXGroup", [node("AXTabGroup", regions)])]);
const scroll = (...children: unknown[]) =>
  node("AXScrollArea", [node("AXGroup", children)]);
describe("structural tab discovery", () => {
  it("accepts empty wrappers and combines pinned and regular regions in order", () => {
    expect(
      parseAXTree(
        strip(scroll(), scroll(tab()), scroll(node("AXGroup", [tab(), tab()]))),
      ),
    ).toEqual([["T"], ["T"], ["T"]]);
  });
  it("counts expanded descendants once and preserves collapsed groups", () => {
    const group = (label: string, children: unknown[]) =>
      node("AXGroup", [node("AXTabGroup", [], label), ...children]);
    expect(
      parseAXTree(
        strip(
          scroll(
            group('Work - "A" - Expanded', [tab()]),
            group('Other - "B" - Collapsed', []),
            tab(),
          ),
        ),
      ),
    ).toEqual([
      ["G", 'Work - "A" - Expanded', 1],
      ["G", 'Other - "B" - Collapsed', 0],
      ["T"],
    ]);
  });
  it("excludes page radio buttons and rejects multiple browser strips", () => {
    expect(
      parseAXTree(
        node("AXWindow", [
          node("AXWebArea", [node("AXTabGroup", [scroll(tab())])]),
        ]),
      ),
    ).toBeNull();
    expect(
      parseAXTree(
        node("AXWindow", [strip(scroll(tab())), strip(scroll(tab()))]),
      ),
    ).toBeNull();
  });
  it("rejects unreadable and ambiguous group labels", () => {
    expect(
      parseAXTree(strip(scroll(node("AXGroup", [node("AXTabGroup"), tab()])))),
    ).toBeNull();
    expect(
      parseAXTree(
        strip(
          scroll(
            node("AXGroup", [
              node("AXTabGroup", [], "a"),
              node("AXTabGroup", [], "b"),
            ]),
          ),
        ),
      ),
    ).toBeNull();
  });
  it("enforces element and depth bounds", () => {
    expect(() =>
      parseAXTree(strip(scroll(...Array.from({ length: 2000 }, tab)))),
    ).toThrow();
    let deep = tab();
    for (let i = 0; i < 14; i++) deep = node("AXGroup", [deep]);
    expect(() => parseAXTree(deep)).toThrow();
  });
});

it("reads the captured disposable Chrome unnamed-group fixture", async () => {
  const { readFileSync } = await import("node:fs");
  const tree = JSON.parse(
    readFileSync(
      new URL("./fixtures/chrome-unnamed-group.json", import.meta.url),
      "utf8",
    ),
  );
  expect(parseAXTree(tree)).toEqual([
    ["G", " unnamed group - 1 Tab, •  about:blank - Expanded", 1],
  ]);
});
