import { afterEach, expect, it, vi } from "vitest";
import { Clipboard, showHUD, showToast } from "@raycast/api";
import { Parser } from "commonmark";
const mocks = vi.hoisted(() => ({ info: vi.fn(), url: vi.fn() }));
vi.mock("../lib/chrome", () => ({
  getActiveTabInfo: mocks.info,
  getActiveTabUrl: mocks.url,
}));
import copyUrl from "../copy-url";
import copyMarkdown from "../copy-markdown-link";
afterEach(() => vi.clearAllMocks());
it("copies the native URL verbatim", async () => {
  mocks.url.mockResolvedValue("https://example.test/?x=1&copy;=2");
  await copyUrl();
  expect(Clipboard.copy).toHaveBeenCalledWith(
    "https://example.test/?x=1&copy;=2",
  );
  expect(showHUD).toHaveBeenCalled();
});
it("copies Markdown with a literal hostile title and exact URL destination", async () => {
  const url = "https://example.test/?x=1&copy;=2";
  mocks.info.mockResolvedValue({
    title: '<img src="x"> [click](evil) &copy;',
    url,
  });
  await copyMarkdown();
  const value = vi.mocked(Clipboard.copy).mock.calls[0]?.[0];
  const walker = new Parser().parse(value as string).walker();
  const nodes = [];
  let event;
  while ((event = walker.next())) if (event.entering) nodes.push(event.node);
  expect(
    nodes
      .filter((node) => node.type === "link")
      .map((node) => node.destination),
  ).toEqual([url]);
  expect(
    nodes.some((node) => node.type === "html_inline" || node.type === "image"),
  ).toBe(false);
});
it("copies unsupported URL schemes as plain text", async () => {
  mocks.info.mockResolvedValue({ title: "Custom", url: "raycast://command" });
  await copyMarkdown();
  expect(Clipboard.copy).toHaveBeenCalledWith("Custom — raycast://command");
});
it("reports read errors without overwriting the clipboard", async () => {
  mocks.url.mockRejectedValue(new Error("Unavailable"));
  await copyUrl();
  expect(Clipboard.copy).not.toHaveBeenCalled();
  expect(showHUD).not.toHaveBeenCalled();
  expect(showToast).toHaveBeenCalled();
});
