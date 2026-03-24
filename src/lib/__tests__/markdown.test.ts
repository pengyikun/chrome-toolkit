import { describe, expect, it } from "vitest";
import {
  escapeCodeFences,
  escapeMarkdownInline,
  escapeMarkdownLinkText,
  escapeMarkdownLinkUrl,
} from "../markdown";

// ---------------------------------------------------------------------------
// escapeMarkdownLinkText
// ---------------------------------------------------------------------------
describe("escapeMarkdownLinkText", () => {
  it("returns plain text unchanged", () => {
    expect(escapeMarkdownLinkText("Hello World")).toBe("Hello World");
  });

  it("escapes square brackets", () => {
    expect(escapeMarkdownLinkText("[test]")).toBe("\\[test\\]");
  });

  it("escapes backslashes", () => {
    expect(escapeMarkdownLinkText("a\\b")).toBe("a\\\\b");
  });

  it("escapes parentheses", () => {
    expect(escapeMarkdownLinkText("foo(bar)")).toBe("foo\\(bar\\)");
  });

  it("replaces newlines with spaces", () => {
    expect(escapeMarkdownLinkText("line1\nline2\rline3")).toBe(
      "line1 line2 line3",
    );
  });

  it("trims leading/trailing whitespace", () => {
    expect(escapeMarkdownLinkText("  hello  ")).toBe("hello");
  });

  it("neutralises combined Markdown link injection", () => {
    const malicious = "x](javascript:alert(1))[y";
    const result = escapeMarkdownLinkText(malicious);
    expect(result).toBe("x\\]\\(javascript:alert\\(1\\)\\)\\[y");
    // No unescaped ]( sequence remains
    expect(result).not.toMatch(/(?<!\\)\](?<!\\)\(/);
  });

  it("handles empty string", () => {
    expect(escapeMarkdownLinkText("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// escapeMarkdownLinkUrl
// ---------------------------------------------------------------------------
describe("escapeMarkdownLinkUrl", () => {
  it("returns a normal URL unchanged", () => {
    expect(escapeMarkdownLinkUrl("https://example.com/path?q=1")).toBe(
      "https://example.com/path?q=1",
    );
  });

  it("encodes spaces", () => {
    expect(escapeMarkdownLinkUrl("https://example.com/my page")).toBe(
      "https://example.com/my%20page",
    );
  });

  it("encodes angle brackets", () => {
    expect(escapeMarkdownLinkUrl("https://example.com/<test>")).toBe(
      "https://example.com/%3Ctest%3E",
    );
  });

  it("encodes newlines", () => {
    expect(escapeMarkdownLinkUrl("https://example.com/\nfoo")).toBe(
      "https://example.com/%20foo",
    );
  });

  it("handles empty string", () => {
    expect(escapeMarkdownLinkUrl("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// escapeMarkdownInline
// ---------------------------------------------------------------------------
describe("escapeMarkdownInline", () => {
  it("returns plain text unchanged", () => {
    expect(escapeMarkdownInline("Hello World")).toBe("Hello World");
  });

  it("escapes Markdown special characters", () => {
    const input = "*bold* _italic_ `code` [link](url) # heading";
    const result = escapeMarkdownInline(input);
    expect(result).toContain("\\*");
    expect(result).toContain("\\_");
    expect(result).toContain("\\`");
    expect(result).toContain("\\[");
    expect(result).toContain("\\#");
  });

  it("replaces newlines with spaces", () => {
    expect(escapeMarkdownInline("a\nb\rc")).toBe("a b c");
  });

  it("neutralises image injection", () => {
    const malicious = "![alt](https://evil.com/tracker.png)";
    const result = escapeMarkdownInline(malicious);
    expect(result).toContain("\\!");
    expect(result).toContain("\\[");
    // Should not match a valid Markdown image pattern
    expect(result).not.toMatch(/!\[.*\]\(.*\)/);
  });

  it("handles empty string", () => {
    expect(escapeMarkdownInline("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// escapeCodeFences
// ---------------------------------------------------------------------------
describe("escapeCodeFences", () => {
  it("returns plain text unchanged", () => {
    expect(escapeCodeFences("hello world")).toBe("hello world");
  });

  it("escapes triple backticks", () => {
    expect(escapeCodeFences("before ``` after")).toBe("before \\`\\`\\` after");
  });

  it("escapes multiple occurrences", () => {
    expect(escapeCodeFences("``` code ```")).toBe("\\`\\`\\` code \\`\\`\\`");
  });

  it("handles empty string", () => {
    expect(escapeCodeFences("")).toBe("");
  });

  it("leaves single and double backticks alone", () => {
    expect(escapeCodeFences("` `` `")).toBe("` `` `");
  });
});
