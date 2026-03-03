import { afterEach, describe, expect, it, vi } from "vitest";

// Mock @raycast/utils before importing the module under test
const mockRunAppleScript = vi.fn();
vi.mock("@raycast/utils", () => ({
  runAppleScript: (...args: unknown[]) => mockRunAppleScript(...args),
}));

import { getActiveTabUrl, getActiveTabInfo, getActiveTabHtml } from "../chrome";
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
