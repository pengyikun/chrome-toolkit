import { afterEach, describe, expect, it, vi } from "vitest";

// Mock @raycast/utils before importing the module under test
const mockRunAppleScript = vi.fn();
vi.mock("@raycast/utils", () => ({
  runAppleScript: (...args: unknown[]) => mockRunAppleScript(...args),
}));

import {
  getActiveTabUrl,
  getActiveTabInfo,
  getActiveTabCookies,
  getActiveTabHtml,
  getTabGroups,
  switchToTab,
} from "../chrome";
import {
  AutomationPermissionError,
  BrowserNotRunningError,
  NoWindowError,
  UnexpectedResponseError,
} from "../errors";

const SEPARATOR = "\u001F";

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// getActiveTabUrl
// ---------------------------------------------------------------------------
describe("getActiveTabUrl", () => {
  it("returns the URL from AppleScript", async () => {
    mockRunAppleScript.mockResolvedValue("https://example.com");
    const url = await getActiveTabUrl();
    expect(url).toBe("https://example.com");
    expect(mockRunAppleScript).toHaveBeenCalledOnce();
  });

  it("trims whitespace from the URL", async () => {
    mockRunAppleScript.mockResolvedValue("  https://example.com  \n");
    const url = await getActiveTabUrl();
    expect(url).toBe("https://example.com");
  });

  it("returns empty string for missing value", async () => {
    mockRunAppleScript.mockResolvedValue("");
    const url = await getActiveTabUrl();
    expect(url).toBe("");
  });

  it("throws BrowserNotRunningError on error number 1001", async () => {
    mockRunAppleScript.mockRejectedValue(new Error("error number 1001"));
    await expect(getActiveTabUrl()).rejects.toThrow(BrowserNotRunningError);
  });

  it("throws NoWindowError on error number 1002", async () => {
    mockRunAppleScript.mockRejectedValue(new Error("error number 1002"));
    await expect(getActiveTabUrl()).rejects.toThrow(NoWindowError);
  });

  it("throws BrowserNotRunningError for 'Application isn't running'", async () => {
    mockRunAppleScript.mockRejectedValue(
      new Error("Application isn't running"),
    );
    await expect(getActiveTabUrl()).rejects.toThrow(BrowserNotRunningError);
  });

  it("throws AutomationPermissionError for 'Not authorized'", async () => {
    mockRunAppleScript.mockRejectedValue(
      new Error("Not authorized to send Apple events"),
    );
    await expect(getActiveTabUrl()).rejects.toThrow(AutomationPermissionError);
  });

  it("throws AutomationPermissionError for 'Not authorised' (UK spelling)", async () => {
    mockRunAppleScript.mockRejectedValue(
      new Error("Not authorised to send Apple events"),
    );
    await expect(getActiveTabUrl()).rejects.toThrow(AutomationPermissionError);
  });

  it("throws generic Error for unknown failures", async () => {
    mockRunAppleScript.mockRejectedValue(new Error("something weird"));
    await expect(getActiveTabUrl()).rejects.toThrow(
      "Could not communicate with Google Chrome",
    );
  });

  it("handles non-Error rejection values", async () => {
    mockRunAppleScript.mockRejectedValue("string error");
    await expect(getActiveTabUrl()).rejects.toThrow(
      "Could not communicate with Google Chrome",
    );
  });
});

// ---------------------------------------------------------------------------
// getActiveTabInfo
// ---------------------------------------------------------------------------
describe("getActiveTabInfo", () => {
  it("parses URL and title separated by unit separator", async () => {
    mockRunAppleScript.mockResolvedValue(
      `https://example.com${SEPARATOR}My Page`,
    );
    const info = await getActiveTabInfo();
    expect(info.url).toBe("https://example.com");
    expect(info.title).toBe("My Page");
  });

  it("handles title containing ||| without corruption", async () => {
    mockRunAppleScript.mockResolvedValue(
      `https://example.com${SEPARATOR}Title with ||| in it`,
    );
    const info = await getActiveTabInfo();
    expect(info.url).toBe("https://example.com");
    expect(info.title).toBe("Title with ||| in it");
  });

  it("handles empty title", async () => {
    mockRunAppleScript.mockResolvedValue(`https://example.com${SEPARATOR}`);
    const info = await getActiveTabInfo();
    expect(info.url).toBe("https://example.com");
    expect(info.title).toBe("");
  });

  it("handles empty URL", async () => {
    mockRunAppleScript.mockResolvedValue(`${SEPARATOR}My Page`);
    const info = await getActiveTabInfo();
    expect(info.url).toBe("");
    expect(info.title).toBe("My Page");
  });

  it("handles title with newlines", async () => {
    mockRunAppleScript.mockResolvedValue(
      `https://example.com${SEPARATOR}Line1\nLine2`,
    );
    const info = await getActiveTabInfo();
    expect(info.url).toBe("https://example.com");
    expect(info.title).toBe("Line1\nLine2");
  });

  it("throws UnexpectedResponseError when separator is missing", async () => {
    mockRunAppleScript.mockResolvedValue("https://example.com");
    await expect(getActiveTabInfo()).rejects.toThrow(UnexpectedResponseError);
  });

  it("throws BrowserNotRunningError on error 1001", async () => {
    mockRunAppleScript.mockRejectedValue(
      new Error("CHROME_NOT_RUNNING number 1001"),
    );
    await expect(getActiveTabInfo()).rejects.toThrow(BrowserNotRunningError);
  });

  it("throws NoWindowError on error 1002", async () => {
    mockRunAppleScript.mockRejectedValue(
      new Error("CHROME_NO_WINDOW number 1002"),
    );
    await expect(getActiveTabInfo()).rejects.toThrow(NoWindowError);
  });
});

// ---------------------------------------------------------------------------
// getActiveTabCookies
// ---------------------------------------------------------------------------
describe("getActiveTabCookies", () => {
  it("parses title, URL, and cookies separated by unit separators", async () => {
    const cookies = "a=1; b=2";
    mockRunAppleScript.mockResolvedValue(
      `My Page${SEPARATOR}https://example.com${SEPARATOR}${cookies}`,
    );
    const result = await getActiveTabCookies();
    expect(result.title).toBe("My Page");
    expect(result.url).toBe("https://example.com");
    expect(result.cookies).toBe(cookies);
  });

  it("handles empty cookie string", async () => {
    mockRunAppleScript.mockResolvedValue(
      `Title${SEPARATOR}https://x.com${SEPARATOR}`,
    );
    const result = await getActiveTabCookies();
    expect(result.cookies).toBe("");
  });

  it("handles cookies containing equals signs in values", async () => {
    const cookies = "token=abc=def=ghi";
    mockRunAppleScript.mockResolvedValue(
      `Title${SEPARATOR}https://x.com${SEPARATOR}${cookies}`,
    );
    const result = await getActiveTabCookies();
    expect(result.cookies).toBe(cookies);
  });

  it("throws UnexpectedResponseError when separators are missing", async () => {
    mockRunAppleScript.mockResolvedValue("just text no separators");
    await expect(getActiveTabCookies()).rejects.toThrow(
      UnexpectedResponseError,
    );
  });

  it("throws UnexpectedResponseError when only one separator exists", async () => {
    mockRunAppleScript.mockResolvedValue(`Title${SEPARATOR}rest`);
    await expect(getActiveTabCookies()).rejects.toThrow(
      UnexpectedResponseError,
    );
  });

  it("uses default timeout", async () => {
    mockRunAppleScript.mockResolvedValue(`T${SEPARATOR}U${SEPARATOR}C`);
    await getActiveTabCookies();
    const callArgs = mockRunAppleScript.mock.calls[0];
    expect(callArgs[1]).toEqual({ timeout: 5_000 });
  });
});

// ---------------------------------------------------------------------------
// getActiveTabHtml
// ---------------------------------------------------------------------------
describe("getActiveTabHtml", () => {
  it("parses title, URL, and HTML separated by unit separators", async () => {
    const html = "<body><p>Hello</p></body>";
    mockRunAppleScript.mockResolvedValue(
      `My Page${SEPARATOR}https://example.com${SEPARATOR}${html}`,
    );
    const result = await getActiveTabHtml();
    expect(result.title).toBe("My Page");
    expect(result.url).toBe("https://example.com");
    expect(result.html).toBe(html);
  });

  it("handles HTML containing newlines and special characters", async () => {
    const html =
      "<body>\n<p>Hello</p>\n<script>alert('test')</script>\n</body>";
    mockRunAppleScript.mockResolvedValue(
      `Title${SEPARATOR}https://x.com${SEPARATOR}${html}`,
    );
    const result = await getActiveTabHtml();
    expect(result.html).toBe(html);
  });

  it("handles HTML containing the old ||| delimiter", async () => {
    const html = "<body>|||</body>";
    mockRunAppleScript.mockResolvedValue(
      `Title${SEPARATOR}https://x.com${SEPARATOR}${html}`,
    );
    const result = await getActiveTabHtml();
    expect(result.html).toBe(html);
  });

  it("handles title with newlines (no corruption)", async () => {
    mockRunAppleScript.mockResolvedValue(
      `Title\nWith\nNewlines${SEPARATOR}https://x.com${SEPARATOR}<body>hi</body>`,
    );
    const result = await getActiveTabHtml();
    expect(result.title).toBe("Title\nWith\nNewlines");
    expect(result.url).toBe("https://x.com");
    expect(result.html).toBe("<body>hi</body>");
  });

  it("handles empty title and URL", async () => {
    mockRunAppleScript.mockResolvedValue(
      `${SEPARATOR}${SEPARATOR}<body></body>`,
    );
    const result = await getActiveTabHtml();
    expect(result.title).toBe("");
    expect(result.url).toBe("");
    expect(result.html).toBe("<body></body>");
  });

  it("throws UnexpectedResponseError when separators are missing", async () => {
    mockRunAppleScript.mockResolvedValue("just some text without separators");
    await expect(getActiveTabHtml()).rejects.toThrow(UnexpectedResponseError);
  });

  it("throws UnexpectedResponseError when only one separator exists", async () => {
    mockRunAppleScript.mockResolvedValue(`Title${SEPARATOR}rest of content`);
    await expect(getActiveTabHtml()).rejects.toThrow(UnexpectedResponseError);
  });

  it("uses extended timeout for HTML extraction", async () => {
    mockRunAppleScript.mockResolvedValue(`T${SEPARATOR}U${SEPARATOR}H`);
    await getActiveTabHtml();
    const callArgs = mockRunAppleScript.mock.calls[0];
    expect(callArgs[1]).toEqual({ timeout: 15_000 });
  });

  it("uses default timeout for URL-only extraction", async () => {
    mockRunAppleScript.mockResolvedValue("https://example.com");
    await getActiveTabUrl();
    const callArgs = mockRunAppleScript.mock.calls[0];
    expect(callArgs[1]).toEqual({ timeout: 5_000 });
  });
});

// ---------------------------------------------------------------------------
// getTabGroups
// ---------------------------------------------------------------------------
describe("getTabGroups", () => {
  const FS = "\u001F";
  const RS = "\u001E";

  // getTabGroups makes 2 AppleScript calls:
  //   1st: Chrome tab titles (FS-separated)
  //   2nd: AX tree groups (RS-separated records, FS-separated fields: desc, startIndex, tabCount)

  it("returns empty array when AX result is empty", async () => {
    mockRunAppleScript
      .mockResolvedValueOnce(`Tab A${FS}Tab B`) // titles
      .mockResolvedValueOnce(""); // AX tree
    const groups = await getTabGroups();
    expect(groups).toEqual([]);
  });

  // AX result format: ungroupedIndices FS groupRecords
  // groupRecords: RS-separated, each: desc FS startIndex FS tabCount

  it("parses a single expanded group with correct tab titles", async () => {
    mockRunAppleScript
      .mockResolvedValueOnce(`Tab One${FS}Tab Two`) // titles
      .mockResolvedValueOnce(
        `${FS} my-group - "Tab One" and 1 Other Tab - Expanded${FS}1${FS}2`,
      );
    const groups = await getTabGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("my-group");
    expect(groups[0].tabs).toEqual(["Tab One", "Tab Two"]);
    expect(groups[0].collapsed).toBe(false);
    expect(groups[0].tabIndices).toEqual([1, 2]);
  });

  it("parses a collapsed group", async () => {
    mockRunAppleScript
      .mockResolvedValueOnce(`Tab A${FS}Tab B`) // titles
      .mockResolvedValueOnce(
        `${FS} work - "Tab A" and 1 Other Tab - Collapsed${FS}1${FS}2`,
      );
    const groups = await getTabGroups();
    expect(groups[0].collapsed).toBe(true);
    expect(groups[0].tabs).toEqual(["Tab A", "Tab B"]);
  });

  it("parses multiple groups with ungrouped tabs", async () => {
    // 3 ungrouped tabs (indices 1,2,3), then group1 (2 tabs at 4,5), then group2 (1 tab at 6)
    mockRunAppleScript
      .mockResolvedValueOnce(
        `Ungrouped1${FS}Ungrouped2${FS}Ungrouped3${FS}G1-Tab1${FS}G1-Tab2${FS}G2-Tab1`,
      )
      .mockResolvedValueOnce(
        `1,2,3${FS} group 1 - "G1-Tab1" - Expanded${FS}4${FS}2${RS} group 2 - "G2-Tab1" - Expanded${FS}6${FS}1`,
      );
    const groups = await getTabGroups();
    expect(groups).toHaveLength(3);
    expect(groups[0].name).toBe("group 1");
    expect(groups[0].tabs).toEqual(["G1-Tab1", "G1-Tab2"]);
    expect(groups[0].tabIndices).toEqual([4, 5]);
    expect(groups[1].name).toBe("group 2");
    expect(groups[1].tabs).toEqual(["G2-Tab1"]);
    expect(groups[1].tabIndices).toEqual([6]);
    expect(groups[2].name).toBe("Ungrouped");
    expect(groups[2].tabs).toEqual(["Ungrouped1", "Ungrouped2", "Ungrouped3"]);
    expect(groups[2].tabIndices).toEqual([1, 2, 3]);
  });

  it("falls back to parsed description when titles are out of range", async () => {
    mockRunAppleScript
      .mockResolvedValueOnce("") // empty titles
      .mockResolvedValueOnce(
        `${FS} work - "Fallback Title" and 1 Other Tab - Collapsed${FS}1${FS}2`,
      );
    const groups = await getTabGroups();
    expect(groups[0].tabs).toEqual(["Fallback Title", "Tab 2"]);
  });

  it("throws BrowserNotRunningError on error 1001", async () => {
    mockRunAppleScript.mockRejectedValueOnce(
      new Error("CHROME_NOT_RUNNING number 1001"),
    );
    await expect(getTabGroups()).rejects.toThrow(BrowserNotRunningError);
  });

  it("throws NoWindowError on error 1002", async () => {
    mockRunAppleScript.mockRejectedValueOnce(
      new Error("CHROME_NO_WINDOW number 1002"),
    );
    await expect(getTabGroups()).rejects.toThrow(NoWindowError);
  });
});

// ---------------------------------------------------------------------------
// switchToTab
// ---------------------------------------------------------------------------
describe("switchToTab", () => {
  it("sets active tab index via AppleScript", async () => {
    mockRunAppleScript.mockResolvedValueOnce("");
    await switchToTab(3);
    const script = mockRunAppleScript.mock.calls[0][0] as string;
    expect(script).toContain("set active tab index of front window to 3");
  });

  it("throws BrowserNotRunningError on error 1001", async () => {
    mockRunAppleScript.mockRejectedValueOnce(
      new Error("CHROME_NOT_RUNNING number 1001"),
    );
    await expect(switchToTab(1)).rejects.toThrow(BrowserNotRunningError);
  });

  it("throws NoWindowError on error 1002", async () => {
    mockRunAppleScript.mockRejectedValueOnce(
      new Error("CHROME_NO_WINDOW number 1002"),
    );
    await expect(switchToTab(1)).rejects.toThrow(NoWindowError);
  });
});
