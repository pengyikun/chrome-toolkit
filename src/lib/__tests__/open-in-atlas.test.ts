import { afterEach, describe, expect, it, vi } from "vitest";

// Define mock functions via vi.hoisted so they are available inside vi.mock factories
const { mockRunAppleScript, mockExecFileAsync, mockShowChromeError } =
  vi.hoisted(() => ({
    mockRunAppleScript: vi.fn(),
    mockExecFileAsync: vi.fn(),
    mockShowChromeError: vi.fn(),
  }));

vi.mock("@raycast/utils", () => ({
  runAppleScript: (...args: unknown[]) => mockRunAppleScript(...args),
}));

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:util", () => ({
  promisify: () => mockExecFileAsync,
}));

vi.mock("../toast-error", () => ({
  showChromeError: (...args: unknown[]) => mockShowChromeError(...args),
}));

import { showToast, showHUD } from "@raycast/api";
import Command from "../../open-in-atlas";

const mockShowToast = vi.mocked(showToast);
const mockShowHUD = vi.mocked(showHUD);

afterEach(() => {
  vi.clearAllMocks();
});

describe("Command (open-in-atlas)", () => {
  it("opens the URL in Atlas via Launch Services", async () => {
    mockRunAppleScript.mockResolvedValue("https://example.com");
    mockExecFileAsync.mockResolvedValue({ stdout: "", stderr: "" });

    await Command();

    expect(mockExecFileAsync).toHaveBeenCalledWith("open", [
      "-a",
      "ChatGPT Atlas",
      "https://example.com",
    ]);
    expect(mockShowHUD).toHaveBeenCalledWith("Opened in Atlas ✓");
  });

  it('shows "Atlas Not Found" toast when the app is not installed', async () => {
    mockRunAppleScript.mockResolvedValue("https://example.com");
    mockExecFileAsync.mockRejectedValue(
      new Error("Unable to find application named 'ChatGPT Atlas'"),
    );

    await Command();

    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Atlas Not Found",
      }),
    );
    expect(mockShowHUD).not.toHaveBeenCalled();
  });

  it("detects app-not-found reported via stderr", async () => {
    mockRunAppleScript.mockResolvedValue("https://example.com");
    const error = Object.assign(new Error("Command failed: open"), {
      stderr: "Unable to find application named 'ChatGPT Atlas'",
    });
    mockExecFileAsync.mockRejectedValue(error);

    await Command();

    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Atlas Not Found",
      }),
    );
  });

  it('shows "Invalid URL" toast when URL is not http/https', async () => {
    mockRunAppleScript.mockResolvedValue("chrome://settings");

    await Command();

    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Invalid URL",
        message: expect.stringContaining("chrome://settings"),
      }),
    );
    expect(mockExecFileAsync).not.toHaveBeenCalled();
  });

  it('shows "Invalid URL" toast for empty URL string', async () => {
    mockRunAppleScript.mockResolvedValue("");

    await Command();

    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Invalid URL",
      }),
    );
    expect(mockExecFileAsync).not.toHaveBeenCalled();
  });

  it("calls showChromeError when chrome interaction fails", async () => {
    const error = new Error("Application isn't running");
    mockRunAppleScript.mockRejectedValue(error);

    await Command();

    expect(mockShowChromeError).toHaveBeenCalled();
  });

  it("calls showChromeError for unrelated launch failures", async () => {
    mockRunAppleScript.mockResolvedValue("https://example.com");
    mockExecFileAsync.mockRejectedValue(new Error("Command failed: open"));

    await Command();

    expect(mockShowChromeError).toHaveBeenCalled();
    expect(mockShowHUD).not.toHaveBeenCalled();
  });
});
