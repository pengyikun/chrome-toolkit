import { afterEach, describe, expect, it, vi } from "vitest";

const { mockExecFileAsync } = vi.hoisted(() => ({
  mockExecFileAsync: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:util", () => ({
  promisify: () => mockExecFileAsync,
}));

import { showToast, showHUD } from "@raycast/api";
import { openChromePage } from "../open-chrome-page";

const mockShowToast = vi.mocked(showToast);
const mockShowHUD = vi.mocked(showHUD);

afterEach(() => {
  vi.clearAllMocks();
});

describe("openChromePage", () => {
  it("opens the page in Chrome and shows a HUD", async () => {
    mockExecFileAsync.mockResolvedValue({ stdout: "", stderr: "" });

    await openChromePage("chrome://flags", "Chrome Flags");

    expect(mockExecFileAsync).toHaveBeenCalledWith("open", [
      "-a",
      "Google Chrome",
      "chrome://flags",
    ]);
    expect(mockShowHUD).toHaveBeenCalledWith("Opened Chrome Flags ✓");
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it("shows a failure toast when Chrome cannot be opened", async () => {
    mockExecFileAsync.mockRejectedValue(
      new Error("Unable to find application named 'Google Chrome'"),
    );

    await openChromePage("chrome://settings", "Chrome Settings");

    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Failed to Open Chrome Settings",
        message: expect.stringContaining("Google Chrome"),
      }),
    );
    expect(mockShowHUD).not.toHaveBeenCalled();
  });
});
