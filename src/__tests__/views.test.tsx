// @vitest-environment happy-dom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Clipboard, List, showHUD, showToast } from "@raycast/api";
const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  html: vi.fn(),
  groups: vi.fn(),
  switch: vi.fn(),
}));
vi.mock("../lib/chrome", () => ({
  getActiveTabCookies: mocks.cookies,
  getActiveTabHtml: mocks.html,
  getTabGroups: mocks.groups,
  switchToTab: mocks.switch,
}));
import Cookies from "../extract-cookies";
import Html from "../extract-html";
import SearchCookies from "../search-cookie";
import SearchTabs from "../search-tab-group";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const cookiePage = {
  cookies: "session=secret",
  title: "Page",
  url: "https://example.test",
};
const tab = {
  windowId: "w",
  tabId: "t",
  title: "Target",
  url: "https://example.test",
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

it.each([
  {
    View: Html,
    fetch: mocks.html,
    page: {
      html: "<body>secret</body>",
      title: "Page",
      url: "https://example.test",
    },
    copyTitle: "Copy Body HTML",
    content: "<body>secret</body>",
  },
  {
    View: Cookies,
    fetch: mocks.cookies,
    page: cookiePage,
    copyTitle: "Copy Cookies JSON",
    content: JSON.stringify([{ name: "session", value: "secret" }], null, 2),
  },
])(
  "conceals automatic and manual copying: $copyTitle",
  async ({ View, fetch, page, copyTitle, content }) => {
    fetch.mockResolvedValue(page);
    render(<View />);
    await waitFor(() =>
      expect(Clipboard.copy).toHaveBeenCalledWith(content, { concealed: true }),
    );
    fireEvent.click(await screen.findByText(copyTitle));
    expect(Clipboard.copy).toHaveBeenCalledTimes(2);
    expect(Clipboard.copy).toHaveBeenLastCalledWith(content, {
      concealed: true,
    });
  },
);

it("keeps loaded HTML copyable after automatic clipboard failure", async () => {
  mocks.html.mockResolvedValue({
    html: "body",
    title: "Page",
    url: "https://example.test",
  });
  vi.mocked(Clipboard.copy).mockRejectedValueOnce(new Error("Unavailable"));
  render(<Html />);
  expect(await screen.findByText("Copy Body HTML")).toBeTruthy();
  expect(showToast).toHaveBeenCalledWith(
    expect.objectContaining({ title: "Failed to copy HTML" }),
  );
  expect(screen.queryByText(/is on the clipboard/)).toBeNull();
});

it("suppresses pending extraction after leaving the view", async () => {
  const pending = deferred<typeof cookiePage>();
  mocks.cookies.mockReturnValue(pending.promise);
  const { unmount } = render(<Cookies />);
  unmount();
  await act(async () => {
    pending.resolve(cookiePage);
  });
  expect(Clipboard.copy).not.toHaveBeenCalled();
  expect(showToast).not.toHaveBeenCalled();
});

it("does not show success after leaving during a clipboard write", async () => {
  const pending = deferred<void>();
  mocks.cookies.mockResolvedValue(cookiePage);
  vi.mocked(Clipboard.copy).mockReturnValueOnce(pending.promise);
  const { unmount } = render(<Cookies />);
  await waitFor(() => expect(Clipboard.copy).toHaveBeenCalledOnce());
  unmount();
  await act(async () => {
    pending.resolve();
  });
  expect(showToast).not.toHaveBeenCalled();
});

it("retains Refresh through cookie errors, empty data and no matches", async () => {
  mocks.cookies
    .mockRejectedValueOnce(new Error("No permission"))
    .mockResolvedValueOnce({ ...cookiePage, cookies: "" })
    .mockResolvedValueOnce(cookiePage);
  render(<SearchCookies />);
  expect(await screen.findByText("No permission")).toBeTruthy();
  fireEvent.click(screen.getByText("Refresh"));
  expect(await screen.findByText("No Cookies Found")).toBeTruthy();
  fireEvent.click(screen.getByText("Refresh"));
  expect(await screen.findByText("session")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Search"), {
    target: { value: "absent" },
  });
  expect(await screen.findByText("No Matching Cookies")).toBeTruthy();
  expect(screen.getByText("Refresh")).toBeTruthy();
});

it("retains Refresh through tab errors and zero matches", async () => {
  mocks.groups.mockRejectedValueOnce(new Error("No Chrome")).mockResolvedValue({
    kind: "grouped",
    groups: [{ name: "Work", collapsed: false, tabs: [tab] }],
  });
  render(<SearchTabs />);
  expect(await screen.findByText("No Chrome")).toBeTruthy();
  fireEvent.click(screen.getByText("Refresh"));
  expect(await screen.findByText("Target")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Search"), {
    target: { value: "absent" },
  });
  expect(await screen.findByText("No Matching Tabs")).toBeTruthy();
  expect(screen.getByText("Refresh")).toBeTruthy();
});

it("keeps the group warning visible during searches and selects by ID", async () => {
  mocks.groups.mockResolvedValue({
    kind: "all-tabs",
    warning: "Enable Accessibility",
    tabs: [tab],
  });
  mocks.switch.mockResolvedValue(undefined);
  render(<SearchTabs />);
  expect(await screen.findByText("All Tabs")).toBeTruthy();
  expect(screen.getByText("Enable Accessibility")).toBeTruthy();
  expect(screen.getByTestId("w:t")).toBeTruthy();
  fireEvent.click(screen.getByText("Switch to This Tab"));
  await waitFor(() => expect(mocks.switch).toHaveBeenCalledWith(tab));
  expect(showHUD).toHaveBeenCalledWith('Switched to "Target" ✓');
  fireEvent.change(screen.getByLabelText("Search"), {
    target: { value: "missing" },
  });
  expect(screen.getByText("Group Information Unavailable")).toBeTruthy();
  expect(screen.getByText("No Matching Tabs")).toBeTruthy();
});

it("does not report success for a disappeared tab", async () => {
  mocks.groups.mockResolvedValue({
    kind: "all-tabs",
    warning: "Changed",
    tabs: [tab],
  });
  mocks.switch.mockRejectedValue(new Error("Tab closed; refresh"));
  render(<SearchTabs />);
  fireEvent.click(await screen.findByText("Switch to This Tab"));
  await waitFor(() => expect(showToast).toHaveBeenCalled());
  expect(showHUD).not.toHaveBeenCalled();
});

it("hides stale data actions while refreshing", async () => {
  const pending = deferred<typeof cookiePage>();
  mocks.cookies
    .mockResolvedValueOnce(cookiePage)
    .mockReturnValueOnce(pending.promise);
  render(<SearchCookies />);
  expect(await screen.findByText("Copy Cookie Value")).toBeTruthy();
  fireEvent.click(screen.getAllByText("Refresh")[0]!);
  expect(screen.queryByText("Copy Cookie Value")).toBeNull();
  await act(async () => {
    pending.resolve(cookiePage);
  });
  expect(await screen.findByText("Copy Cookie Value")).toBeTruthy();
});

it("renders errors as escaped text and suppresses unsafe browser actions", async () => {
  mocks.html.mockRejectedValueOnce(new Error('<img src="evil"> &copy;'));
  const first = render(<Html />);
  expect(await screen.findByText(/&lt;img/)).toBeTruthy();
  first.unmount();
  mocks.html.mockResolvedValueOnce({
    html: "body",
    title: "Page",
    url: "javascript:alert(1)",
  });
  render(<Html />);
  await screen.findByText("Copy Body HTML");
  expect(screen.queryByText("Open in Browser")).toBeNull();
});

it.each([Html, Cookies])(
  "keeps successful copies successful when the success toast rejects",
  async (View) => {
    mocks.html.mockResolvedValue({
      html: "body",
      title: "Page",
      url: "https://example.test",
    });
    mocks.cookies.mockResolvedValue(cookiePage);
    vi.mocked(showToast).mockRejectedValueOnce(new Error("Toast unavailable"));
    render(<View />);
    await screen.findByText(
      View === Html ? "Copy Body HTML" : "Copy Cookies JSON",
    );
    expect(Clipboard.copy).toHaveBeenCalledOnce();
    expect(showToast).toHaveBeenCalledOnce();
  },
);

it("selects actual tabs first and preserves selection through filtering and refresh", async () => {
  const second = { ...tab, tabId: "second", title: "Target second" };
  mocks.groups.mockResolvedValue({
    kind: "all-tabs",
    warning: "Unavailable",
    tabs: [tab, second],
  });
  render(<SearchTabs />);
  await screen.findByText("Target second");
  const props = () => vi.mocked(List).mock.calls.at(-1)![0];
  expect(props().selectedItemId).toBe("w:t");
  act(() => props().onSelectionChange?.("w:second"));
  fireEvent.change(screen.getByLabelText("Search"), {
    target: { value: "second" },
  });
  expect(props().selectedItemId).toBe("w:second");
  fireEvent.click(screen.getAllByText("Refresh")[0]!);
  await screen.findByText("Target second");
  expect(props().selectedItemId).toBe("w:second");
  fireEvent.change(screen.getByLabelText("Search"), {
    target: { value: "missing" },
  });
  expect(props().selectedItemId).toBe("group-warning");
});
