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
  AppWindowGrid3x3: "app-window-grid-3x3",
  ArrowRight: "arrow-right",
  ExclamationMark: "exclamation-mark",
  Globe: "globe",
  RotateClockwise: "rotate-clockwise",
};

export const Keyboard = {
  Shortcut: {
    Common: {
      Copy: { modifiers: ["cmd", "shift"], key: "c" },
      Refresh: { modifiers: ["cmd"], key: "r" },
    },
  },
};

// React components (stubs for view-based commands)
export const Detail = vi.fn();
export const Action = Object.assign(vi.fn(), {
  CopyToClipboard: vi.fn(),
  OpenInBrowser: vi.fn(),
});
export const ActionPanel = vi.fn();
export const List = Object.assign(vi.fn(), {
  EmptyView: vi.fn(),
  Item: vi.fn(),
  Section: vi.fn(),
});
