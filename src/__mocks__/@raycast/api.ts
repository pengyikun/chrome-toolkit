import { vi } from "vitest";

export const showToast = vi.fn();
export const showHUD = vi.fn();

export const Clipboard = {
  copy: vi.fn(),
};

export const Toast = {
  Style: {
    Success: "success",
    Failure: "failure",
    Animated: "animated",
  },
};

export const Icon = {
  RotateClockwise: "rotate-clockwise",
};

// React components (stubs for view-based commands)
export const Detail = vi.fn();
export const Action = { CopyToClipboard: vi.fn(), OpenInBrowser: vi.fn() };
export const ActionPanel = vi.fn();
