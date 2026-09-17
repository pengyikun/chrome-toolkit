import { afterEach, describe, expect, it, vi } from "vitest";
const mockRunAppleScript = vi.hoisted(() => vi.fn());
vi.mock("@raycast/utils", () => ({ runAppleScript: mockRunAppleScript }));
import {
  getActiveTabUrl,
  getActiveTabInfo,
  getActiveTabCookies,
  getActiveTabHtml,
  getTabGroups,
  switchToTab,
} from "../chrome";
import {
  AccessibilityPermissionError,
  AutomationPermissionError,
  BrowserNotRunningError,
  JavaScriptDisabledError,
  NoWindowError,
  PayloadTooLargeError,
  UnexpectedResponseError,
} from "../errors";
import {
  AX_SCRIPT,
  MAX_OUTPUT_BYTES,
  SNAPSHOT_SCRIPT,
  SWITCH_SCRIPT,
} from "../chrome-scripts";

afterEach(() => vi.resetAllMocks());
const native = JSON.stringify([
  "w1",
  [
    ["t1", "First", "https://a.test"],
    ["t2", "Second", "https://b.test"],
  ],
]);
const ax = JSON.stringify([
  "AXWindow",
  "",
  [
    [
      "AXTabGroup",
      "",
      [
        [
          "AXScrollArea",
          "",
          [
            [
              "AXGroup",
              "",
              [
                [
                  "AXTabGroup",
                  ' Work - "First" and 1 Other Tab - Expanded',
                  [],
                ],
                ["AXRadioButton", "", []],
                ["AXRadioButton", "", []],
              ],
            ],
          ],
        ],
      ],
    ],
  ],
]);

describe("Chrome reads", () => {
  it("returns a native URL without page JavaScript", async () => {
    mockRunAppleScript.mockResolvedValue(
      JSON.stringify(["https://example.com", "Title"]),
    );
    expect(await getActiveTabUrl()).toBe("https://example.com");
    expect(mockRunAppleScript.mock.calls[0]?.[0]).not.toContain("javascript");
  });
  it("round-trips separators, quotes, Unicode and trailing data newlines", async () => {
    const title = 'Title\u001f\u001e "😀"\n';
    mockRunAppleScript.mockResolvedValue(JSON.stringify(["", title]));
    expect(await getActiveTabInfo()).toEqual({ url: "", title });
  });
  it.each(["not JSON", "null", "[]", '["url",2]', '["url","title",3]'])(
    "rejects malformed tab data %s",
    async (value) => {
      mockRunAppleScript.mockResolvedValue(value);
      await expect(getActiveTabInfo()).rejects.toThrow(UnexpectedResponseError);
    },
  );
  it.each([
    ["CHROME_NOT_RUNNING (1001)", BrowserNotRunningError],
    ["CHROME_NO_WINDOW (1002)", NoWindowError],
    ["Kein Zugriff (-25211)", AccessibilityPermissionError],
    ["Keine Berechtigung (-1743)", AutomationPermissionError],
    ["Not authorised to send Apple events", AutomationPermissionError],
    [
      "Executing JavaScript through AppleScript is turned off",
      JavaScriptDisabledError,
    ],
    ["Application isn't running", BrowserNotRunningError],
    ["OUTPUT_TOO_LARGE (1005)", PayloadTooLargeError],
  ])("maps native error %s", async (message, ErrorType) => {
    mockRunAppleScript.mockRejectedValue(new Error(message as string));
    await expect(getActiveTabInfo()).rejects.toThrow(ErrorType);
  });
  it("does not leak stdout or misclassify incidental error tokens", async () => {
    mockRunAppleScript.mockRejectedValue(
      new Error("step (1001) failed; session=SECRET"),
    );
    await expect(getActiveTabInfo()).rejects.toThrow("Could not communicate");
    await expect(getActiveTabInfo()).rejects.not.toThrow("SECRET");
  });
  it("returns an extraction from one JSON envelope without shifting fields", async () => {
    const page = {
      title: "Title\u001fhttps://wrong.example",
      url: "https://actual.example",
      body: "session=abc=def",
    };
    mockRunAppleScript.mockResolvedValue(JSON.stringify(page));
    expect(await getActiveTabCookies()).toEqual({
      title: page.title,
      url: page.url,
      cookies: page.body,
    });
  });
  it("preserves HTML and passes timeout and cancellation to utils", async () => {
    const signal = new AbortController().signal;
    mockRunAppleScript.mockResolvedValue(
      JSON.stringify({ title: "T", url: "U", body: "<body>\n😀\u001f</body>" }),
    );
    expect((await getActiveTabHtml(signal)).html).toBe(
      "<body>\n😀\u001f</body>",
    );
    expect(mockRunAppleScript.mock.calls[0]?.[2]).toEqual({
      signal,
      timeout: 15000,
    });
  });
  it.each(["null", "[]", "{}", '{"body":2}', '{"error":"invalid"}'])(
    "rejects invalid extraction %s",
    async (value) => {
      mockRunAppleScript.mockResolvedValue(value);
      await expect(getActiveTabCookies()).rejects.toThrow(
        UnexpectedResponseError,
      );
    },
  );
  it("rejects source and transport size violations", async () => {
    mockRunAppleScript
      .mockResolvedValueOnce('{"error":"too-large"}')
      .mockResolvedValueOnce(
        JSON.stringify({ title: "", url: "", body: "a".repeat(1_000_001) }),
      )
      .mockResolvedValueOnce("x".repeat(MAX_OUTPUT_BYTES + 1));
    await expect(getActiveTabHtml()).rejects.toThrow(PayloadTooLargeError);
    await expect(getActiveTabCookies()).rejects.toThrow(PayloadTooLargeError);
    await expect(getActiveTabInfo()).rejects.toThrow(PayloadTooLargeError);
  });
  it("does not run cancelled reads or translate cancellation to a Chrome error", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(getActiveTabInfo(controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(mockRunAppleScript).not.toHaveBeenCalled();
    const next = new AbortController();
    mockRunAppleScript.mockImplementation(async () => {
      next.abort();
      throw new Error("killed");
    });
    await expect(getActiveTabInfo(next.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});

describe("tab discovery", () => {
  it("returns groups only after matching before/after snapshots", async () => {
    mockRunAppleScript
      .mockResolvedValueOnce(native)
      .mockResolvedValueOnce(ax)
      .mockResolvedValueOnce(native);
    const result = await getTabGroups();
    expect(result).toMatchObject({
      kind: "grouped",
      groups: [
        {
          name: "Work",
          tabs: [{ windowId: "w1", tabId: "t1" }, { tabId: "t2" }],
        },
      ],
    });
    expect(mockRunAppleScript.mock.calls.map((call) => call[0])).toEqual([
      SNAPSHOT_SCRIPT,
      AX_SCRIPT,
      SNAPSHOT_SCRIPT,
    ]);
  });
  it("retries a changed snapshot once then uses a fresh native fallback", async () => {
    const changed = JSON.stringify(["w2", [["t3", "New", "https://new.test"]]]);
    mockRunAppleScript
      .mockResolvedValueOnce(native)
      .mockResolvedValueOnce(ax)
      .mockResolvedValueOnce(changed)
      .mockResolvedValueOnce(native)
      .mockResolvedValueOnce(ax)
      .mockResolvedValueOnce(changed)
      .mockResolvedValueOnce(changed);
    expect(await getTabGroups()).toMatchObject({
      kind: "all-tabs",
      tabs: [{ windowId: "w2", tabId: "t3" }],
      warning: expect.stringContaining("unavailable"),
    });
    expect(mockRunAppleScript).toHaveBeenCalledTimes(7);
  });
  it("recovers on a consistent second attempt", async () => {
    mockRunAppleScript
      .mockResolvedValueOnce(native)
      .mockRejectedValueOnce(new Error("AX_READ_FAILED (1008)"))
      .mockResolvedValueOnce(native)
      .mockResolvedValueOnce(ax)
      .mockResolvedValueOnce(native);
    expect((await getTabGroups()).kind).toBe("grouped");
    expect(mockRunAppleScript).toHaveBeenCalledTimes(5);
  });
  it.each(["-25211", "-1743"])(
    "falls back immediately on AX permission failure %s",
    async (code) => {
      mockRunAppleScript
        .mockResolvedValueOnce(native)
        .mockRejectedValueOnce(new Error(`Localized (${code})`))
        .mockResolvedValueOnce(native);
      expect(await getTabGroups()).toMatchObject({
        kind: "all-tabs",
        tabs: expect.any(Array),
        warning: expect.stringContaining("System Settings"),
      });
      expect(mockRunAppleScript).toHaveBeenCalledTimes(3);
    },
  );
  it("preserves native failures instead of returning stale fallback data", async () => {
    mockRunAppleScript
      .mockResolvedValueOnce(native)
      .mockRejectedValueOnce(new Error("AX (-25211)"))
      .mockRejectedValueOnce(new Error("CHROME_NO_WINDOW (1002)"));
    await expect(getTabGroups()).rejects.toThrow(NoWindowError);
  });
  it("does not swallow cancellation during AX discovery", async () => {
    const controller = new AbortController();
    mockRunAppleScript
      .mockResolvedValueOnce(native)
      .mockImplementationOnce(async () => {
        controller.abort();
        throw new Error("aborted");
      });
    await expect(getTabGroups(controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(mockRunAppleScript).toHaveBeenCalledTimes(2);
  });
});

describe("tab selection", () => {
  it("passes IDs as arguments and requires verified selection", async () => {
    mockRunAppleScript.mockResolvedValue("[true]");
    const target = { windowId: 'window"', tabId: "tab\\" };
    await switchToTab(target);
    expect(mockRunAppleScript).toHaveBeenCalledWith(
      SWITCH_SCRIPT,
      [target.windowId, target.tabId],
      { timeout: 5000, signal: undefined },
    );
    expect(SWITCH_SCRIPT).not.toContain(target.windowId);
  });
  it("rejects empty IDs before invoking automation", async () => {
    await expect(switchToTab({ windowId: "", tabId: "t" })).rejects.toThrow(
      TypeError,
    );
    expect(mockRunAppleScript).not.toHaveBeenCalled();
  });
  it("rejects a closed or moved target", async () => {
    mockRunAppleScript.mockRejectedValue(new Error("TAB_GONE (1003)"));
    await expect(switchToTab({ windowId: "w", tabId: "t" })).rejects.toThrow(
      "refresh",
    );
  });
  it("rejects an unverified success", async () => {
    mockRunAppleScript.mockResolvedValue("[false]");
    await expect(switchToTab({ windowId: "w", tabId: "t" })).rejects.toThrow(
      UnexpectedResponseError,
    );
  });
});

it("falls back after repeated AX timeouts", async () => {
  mockRunAppleScript
    .mockResolvedValueOnce(native)
    .mockRejectedValueOnce(new Error("Timed out"))
    .mockResolvedValueOnce(native)
    .mockRejectedValueOnce(new Error("Timed out"))
    .mockResolvedValueOnce(native);
  expect((await getTabGroups()).kind).toBe("all-tabs");
  expect(mockRunAppleScript).toHaveBeenCalledTimes(5);
});
it("does not turn a failed native after-snapshot into a group fallback", async () => {
  mockRunAppleScript
    .mockResolvedValueOnce(native)
    .mockResolvedValueOnce(ax)
    .mockRejectedValueOnce(new Error("native communication failed"));
  await expect(getTabGroups()).rejects.toThrow("Could not communicate");
  expect(mockRunAppleScript).toHaveBeenCalledTimes(3);
});

it.each(["before", "after"])(
  "retries front-window changes during %s snapshot",
  async (phase) => {
    if (phase === "after")
      mockRunAppleScript
        .mockResolvedValueOnce(native)
        .mockResolvedValueOnce(ax);
    mockRunAppleScript
      .mockRejectedValueOnce(new Error("CHROME_TAB_STRIP (1004)"))
      .mockResolvedValueOnce(native)
      .mockResolvedValueOnce(ax)
      .mockResolvedValueOnce(native);
    expect((await getTabGroups()).kind).toBe("grouped");
  },
);
it("caps subprocess timeouts by one monotonic discovery budget", async () => {
  const clock = vi.spyOn(performance, "now");
  let now = 0;
  clock.mockImplementation(() => now);
  mockRunAppleScript.mockImplementation(async (script: string) => {
    if (script === AX_SCRIPT) {
      now += 10_000;
      throw new Error("Timed out");
    }
    now += 3_000;
    return native;
  });
  try {
    expect((await getTabGroups()).kind).toBe("all-tabs");
    expect(mockRunAppleScript.mock.calls.map((c) => c[2].timeout)).toEqual([
      5000, 10000, 2000, 5000,
    ]);
  } finally {
    clock.mockRestore();
  }
});
it.each(["not JSON", "[]"])(
  "does not hide malformed AX payload %s",
  async (payload) => {
    mockRunAppleScript
      .mockResolvedValueOnce(native)
      .mockResolvedValueOnce(payload);
    await expect(getTabGroups()).rejects.toThrow(UnexpectedResponseError);
    expect(mockRunAppleScript).toHaveBeenCalledTimes(2);
  },
);
it("falls back immediately for an unsupported AX layout", async () => {
  mockRunAppleScript
    .mockResolvedValueOnce(native)
    .mockResolvedValueOnce('["AXWindow","",[]]')
    .mockResolvedValueOnce(native);
  expect((await getTabGroups()).kind).toBe("all-tabs");
  expect(mockRunAppleScript).toHaveBeenCalledTimes(3);
});
