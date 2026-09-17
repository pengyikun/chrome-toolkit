import { vi } from "vitest";
import { createElement as h, ReactNode } from "react";

export const showToast = vi.fn();
export const showHUD = vi.fn();
export const Clipboard = { copy: vi.fn() };
export const Toast = {
  Style: { Success: "success", Failure: "failure", Animated: "animated" },
};
export const Icon = {
  AppWindowGrid3x3: "app-window-grid-3x3",
  ArrowRight: "arrow-right",
  ExclamationMark: "exclamation-mark",
  Globe: "globe",
  RotateClockwise: "rotate-clockwise",
  MagnifyingGlass: "magnifying-glass",
};
export const Keyboard = {
  Shortcut: {
    Common: {
      Copy: { modifiers: ["cmd", "shift"], key: "c" },
      Refresh: { modifiers: ["cmd"], key: "r" },
    },
  },
};

type Children = { children?: ReactNode };
type Actions = { actions?: ReactNode };
type Item = Actions & { id?: string; title: string; subtitle?: string };
export const Detail = vi.fn(
  ({
    markdown,
    actions,
    isLoading,
  }: Actions & { markdown: string; isLoading: boolean }) =>
    h("div", { "aria-busy": isLoading }, h("pre", {}, markdown), actions),
);
export const Action = Object.assign(
  vi.fn(
    ({
      title,
      onAction,
    }: {
      title: string;
      onAction?: () => void | Promise<void>;
    }) => h("button", { onClick: onAction }, title),
  ),
  {
    CopyToClipboard: vi.fn(
      ({
        title,
        content,
        concealed,
      }: {
        title: string;
        content: string;
        concealed?: boolean;
      }) =>
        h(
          "button",
          {
            onClick: () =>
              Clipboard.copy(
                content,
                concealed ? { concealed: true } : undefined,
              ),
          },
          title,
        ),
    ),
    OpenInBrowser: vi.fn(({ url }: { url: string }) =>
      h("a", { href: url }, "Open in Browser"),
    ),
  },
);
export const ActionPanel = vi.fn(({ children }: Children) =>
  h("div", {}, children),
);
export const List = Object.assign(
  vi.fn(
    ({
      children,
      actions,
      onSearchTextChange,
      isLoading,
    }: Children &
      Actions & {
        onSearchTextChange?: (text: string) => void;
        isLoading: boolean;
      }) =>
      h(
        "div",
        { "aria-busy": isLoading },
        h("input", {
          "aria-label": "Search",
          onChange: (event: { target: { value: string } }) =>
            onSearchTextChange?.(event.target.value),
        }),
        actions,
        children,
      ),
  ),
  {
    EmptyView: vi.fn(
      ({ title, description }: { title: string; description: string }) =>
        h("div", {}, h("h2", {}, title), h("p", {}, description)),
    ),
    Item: vi.fn(({ id, title, subtitle, actions }: Item) =>
      h(
        "article",
        { "data-testid": id },
        h("h3", {}, title),
        h("p", {}, subtitle),
        actions,
      ),
    ),
    Section: vi.fn(({ title, children }: Children & { title: string }) =>
      h("section", {}, h("h2", {}, title), children),
    ),
  },
);
