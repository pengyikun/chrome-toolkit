import { describe, expect, it } from "vitest";
import { parseCookieString } from "../cookies";

describe("parseCookieString", () => {
  it("returns empty array for empty string", () => {
    expect(parseCookieString("")).toEqual([]);
  });

  it("returns empty array for whitespace-only string", () => {
    expect(parseCookieString("   ")).toEqual([]);
  });

  it("parses a single cookie", () => {
    expect(parseCookieString("foo=bar")).toEqual([
      { name: "foo", value: "bar" },
    ]);
  });

  it("parses multiple cookies separated by semicolons", () => {
    expect(parseCookieString("a=1; b=2; c=3")).toEqual([
      { name: "a", value: "1" },
      { name: "b", value: "2" },
      { name: "c", value: "3" },
    ]);
  });

  it("preserves value containing equals signs", () => {
    expect(parseCookieString("token=abc=def=ghi")).toEqual([
      { name: "token", value: "abc=def=ghi" },
    ]);
  });

  it("handles cookie with empty value", () => {
    expect(parseCookieString("empty=")).toEqual([{ name: "empty", value: "" }]);
  });

  it("handles cookie with no equals sign (name only)", () => {
    expect(parseCookieString("flagonly")).toEqual([
      { name: "flagonly", value: "" },
    ]);
  });

  it("trims leading whitespace of each pair but preserves inner spacing", () => {
    expect(parseCookieString("  a = 1 ;  b = 2 ")).toEqual([
      { name: "a ", value: " 1" },
      { name: "b ", value: " 2" },
    ]);
  });

  it("handles URL-encoded values", () => {
    expect(parseCookieString("q=hello%20world")).toEqual([
      { name: "q", value: "hello%20world" },
    ]);
  });

  it("handles JSON-like values", () => {
    const raw = 'prefs={"theme":"dark","lang":"en"}';
    expect(parseCookieString(raw)).toEqual([
      { name: "prefs", value: '{"theme":"dark","lang":"en"}' },
    ]);
  });
});
