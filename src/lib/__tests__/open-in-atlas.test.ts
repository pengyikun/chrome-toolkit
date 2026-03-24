import { afterEach, describe, expect, it, vi } from "vitest";

// Define mock functions via vi.hoisted so they are available inside vi.mock factories
const {
  mockRunAppleScript,
  mockExistsSync,
  mockExecFileAsync,
  mockShowChromeError,
} = vi.hoisted(() => ({
  mockRunAppleScript: vi.fn(),
  mockExistsSync: vi.fn(),
  mockExecFileAsync: vi.fn(),
  mockShowChromeError: vi.fn(),
}));

vi.mock("@raycast/utils", () => ({
  runAppleScript: (...args: unknown[]) => mockRunAppleScript(...args),
}));

vi.mock("node:fs", () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
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
  it("opens URL in Atlas when everything is valid", async () => {
    mockExistsSync.mockReturnValue(true);
    mockRunAppleScript.mockResolvedValue("https://example.com");
    mockExecFileAsync.mockResolvedValue({ stdout: "", stderr: "" });

    await Command();

    expect(mockExistsSync).toHaveBeenCalled();
    expect(mockExecFileAsync).toHaveBeenCalledWith("open", [
      "-a",
      expect.stringContaining("ChatGPT Atlas.app"),
      "https://example.com",
    ]);
    expect(mockShowHUD).toHaveBeenCalledWith("Opened in Atlas ✓");
  });

  it('shows "Atlas Not Found" toast when no Atlas paths exist', async () => {
    mockExistsSync.mockReturnValue(false);

    await Command();

    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Atlas Not Found",
      }),
    );
    expect(mockExecFileAsync).not.toHaveBeenCalled();
  });

  it('shows "Invalid URL" toast when URL is not http/https', async () => {
    mockExistsSync.mockReturnValue(true);
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
    mockExistsSync.mockReturnValue(true);
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
    mockExistsSync.mockReturnValue(true);
    const error = new Error("Application isn't running");
    mockRunAppleScript.mockRejectedValue(error);

    await Command();

    expect(mockShowChromeError).toHaveBeenCalled();
  });
});
