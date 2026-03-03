import { afterEach, describe, expect, it, vi } from "vitest";
import { showToast } from "@raycast/api";
import { showChromeError } from "../toast-error";
import {
  AutomationPermissionError,
  BrowserNotRunningError,
  NoWindowError,
} from "../errors";

const mockShowToast = vi.mocked(showToast);

afterEach(() => {
  vi.clearAllMocks();
});

describe("showChromeError", () => {
  it("shows 'Chrome Is Not Running' for BrowserNotRunningError", async () => {
    await showChromeError(new BrowserNotRunningError(), "test action");
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Chrome Is Not Running" }),
    );
  });

  it("shows 'No Chrome Window' for NoWindowError", async () => {
    await showChromeError(new NoWindowError(), "test action");
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "No Chrome Window" }),
    );
  });

  it("shows 'Permission Required' for AutomationPermissionError", async () => {
    await showChromeError(new AutomationPermissionError(), "test action");
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Permission Required" }),
    );
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("Automation"),
      }),
    );
  });

  it("shows generic error with action label for unknown Error", async () => {
    await showChromeError(new Error("some failure"), "do thing");
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Failed to do thing",
        message: "some failure",
      }),
    );
  });

  it("shows fallback message for non-Error values", async () => {
    await showChromeError("string error", "do thing");
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Failed to do thing",
        message: "An unexpected error occurred.",
      }),
    );
  });

  it("shows fallback message for null", async () => {
    await showChromeError(null, "do thing");
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: "An unexpected error occurred." }),
    );
  });
});
