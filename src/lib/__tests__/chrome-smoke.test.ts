import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, it, vi } from "vitest";
const run = promisify(execFile);
const settle = () => new Promise((resolve) => setTimeout(resolve, 500));
vi.mock("@raycast/utils", () => ({
  runAppleScript: async (
    script: string,
    args: string[],
    options: { timeout: number; signal?: AbortSignal },
  ) =>
    (
      await promisify(execFile)("osascript", ["-e", script, ...args], {
        ...options,
        maxBuffer: 32 * 1024 * 1024,
      })
    ).stdout,
}));
import { getTabGroups, getActiveTabHtml, switchToTab } from "../chrome";
const enabled =
  process.platform === "darwin" &&
  process.env.CHROME_TOOLKIT_CHROME_SMOKE === "1";
const apple = async (script: string) =>
  (await run("osascript", ["-e", script], { timeout: 10000 })).stdout.trim();

it.skipIf(!enabled)(
  "real blank, pinned, expanded and collapsed groups, extraction and stable tab IDs",
  async () => {
    let original = "";
    const windows: string[] = [];
    async function create() {
      const id = await apple(
        'tell application "Google Chrome"\nset w to make new window with properties {mode:"incognito"}\nset URL of active tab of w to "about:blank"\nreturn id of w\nend tell',
      );
      windows.push(id);
      await apple('tell application "Google Chrome" to activate');
      await settle();
      return id;
    }
    const guard = (id: string) => `tell application "Google Chrome"
      if (id of front window as text) is not "${id}" then error "Chrome changed during smoke test; stop interacting with Chrome and rerun."
    end tell`;
    const fixture = (id: string, body: string) =>
      apple(`${guard(id)}\n${body}`);
    async function menu(id: string, name: string) {
      await fixture(
        id,
        `tell application "System Events" to tell process "Google Chrome" to click menu item "${name}" of menu 1 of menu bar item "Tab" of menu bar 1`,
      );
    }
    const failures: unknown[] = [];
    try {
      original = await apple(
        'tell application "Google Chrome"\nif (count windows) > 0 then return id of front window\nreturn ""\nend tell',
      );
      const id = await create();
      const blank = await getTabGroups();
      expect(blank.kind).toBe("grouped");
      if (blank.kind !== "grouped") throw new Error(blank.warning);
      expect(blank.groups.flatMap((g) => g.tabs)).toHaveLength(1);
      await menu(id, "Pin Tab");
      await fixture(
        id,
        'tell application "Google Chrome"\nmake new tab at end of tabs of front window with properties {URL:"about:blank"}\nset active tab index of front window to 2\nend tell',
      );
      await menu(id, "Group Tab");
      await fixture(
        id,
        'tell application "System Events" to tell process "Google Chrome" to key code 53',
      );
      await settle();
      const expanded = await getTabGroups();
      expect(expanded.kind).toBe("grouped");
      if (expanded.kind !== "grouped") throw new Error(expanded.warning);
      expect(expanded.groups).toHaveLength(2);
      const grouped = expanded.groups.find((g) => g.name !== "Ungrouped")!;
      expect(grouped.collapsed).toBe(false);
      const target = grouped.tabs[0]!;
      expect(target.windowId).toBe(id);
      await switchToTab(
        expanded.groups.find((g) => g.name === "Ungrouped")!.tabs[0]!,
      );
      await settle();
      const inactive = await getTabGroups();
      const alreadyCollapsed =
        inactive.kind === "grouped" && inactive.groups.some((g) => g.collapsed);
      // Collapse the only group in our disposable front window. No page traversal.
      if (!alreadyCollapsed)
        await apple(`
    on collapseGroup(el, depth)
      if depth > 12 then return false
      tell application "System Events"
        if role of el is "AXWebArea" then return false
        if role of el is "AXTabGroup" and description of el contains " - Expanded" then
          perform action "AXPress" of el
          return true
        end if
        repeat with childElement in every UI element of el
          if my collapseGroup(childElement, depth + 1) then return true
        end repeat
      end tell
      return false
    end collapseGroup
    ${guard(id)}
    tell application "System Events" to set w to front window of process "Google Chrome"
    if not collapseGroup(w, 0) then error "Test group not found"
    `);
      await settle();
      const collapsed = await getTabGroups();
      expect(collapsed.kind).toBe("grouped");
      if (collapsed.kind === "grouped")
        expect(collapsed.groups.some((g) => g.collapsed)).toBe(true);
      await create();
      await switchToTab(target);
      expect((await getActiveTabHtml()).url).toBe("about:blank");
      await fixture(
        id,
        'tell application "Google Chrome" to close tab 1 of front window',
      );
      await switchToTab(target); // Earlier pinned tab was removed; index changed.
      await fixture(
        id,
        'tell application "Google Chrome" to close active tab of front window',
      );
      await expect(switchToTab(target)).rejects.toThrow("refresh");
    } catch (error) {
      failures.push(error);
    } finally {
      for (const id of windows) {
        try {
          await apple(
            `tell application "Google Chrome"\nrepeat with w in windows\nif (id of w as text) is "${id}" then\nclose w\nexit repeat\nend if\nend repeat\nend tell`,
          );
        } catch (error) {
          failures.push(error);
        }
      }
      try {
        if (original)
          await apple(
            `tell application "Google Chrome"\nrepeat with w in windows\nif (id of w as text) is "${original}" then\nset index of w to 1\nexit repeat\nend if\nend repeat\nend tell`,
          );
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length)
      throw new AggregateError(failures, "Chrome smoke or cleanup failed");
  },
  90000,
);
