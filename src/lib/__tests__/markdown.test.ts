import { describe, expect, it } from "vitest";
import {
  buildPageMarkdown,
  escapeMarkdownInline,
  escapeMarkdownLinkText,
  escapeMarkdownLinkUrl,
  fencedCodeBlock,
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
// fencedCodeBlock
// ---------------------------------------------------------------------------
describe("fencedCodeBlock", () => {
  it("wraps plain content in a three-backtick fence", () => {
    expect(fencedCodeBlock("hello world", "html")).toBe(
      "```html\nhello world\n```",
    );
  });

  it("preserves content verbatim", () => {
    const content = "<body>\n<p>a `code` span</p>\n</body>";
    expect(fencedCodeBlock(content, "html")).toContain(content);
  });

  it("lengthens the fence beyond any backtick run in the content", () => {
    const result = fencedCodeBlock("before ``` after", "html");
    expect(result).toBe("````html\nbefore ``` after\n````");
  });

  it("handles content with very long backtick runs", () => {
    const result = fencedCodeBlock("``````", "");
    expect(result.startsWith("```````\n")).toBe(true);
    expect(result.endsWith("\n```````")).toBe(true);
  });

  it("handles empty content and no language", () => {
    expect(fencedCodeBlock("")).toBe("```\n\n```");
  });
});

// ---------------------------------------------------------------------------
// buildPageMarkdown
// ---------------------------------------------------------------------------
describe("buildPageMarkdown", () => {
  it("renders title heading, autolinked URL, and fenced body", () => {
    const result = buildPageMarkdown({
      title: "My Page",
      url: "https://example.com",
      body: '{"a":1}',
      language: "json",
    });
    expect(result).toBe(
      '# My Page\n\n<https://example.com>\n\n```json\n{"a":1}\n```',
    );
  });

  it("omits empty sections", () => {
    expect(buildPageMarkdown({ title: "", url: "", body: "x" })).toBe(
      "```\nx\n```",
    );
    expect(buildPageMarkdown({ title: "T", url: "", body: "" })).toBe("# T");
  });

  it("escapes untrusted title and URL", () => {
    const result = buildPageMarkdown({
      title: "![x](https://evil.com/p.png)",
      url: "https://example.com/<a b>",
      body: "",
    });
    expect(result).not.toMatch(/!\[.*\]\(.*\)/);
    expect(result).toContain("<https://example.com/%3Ca%20b%3E>");
  });

  it("truncates the body at maxBodyChars with a notice", () => {
    const result = buildPageMarkdown({
      title: "",
      url: "",
      body: "abcdef",
      maxBodyChars: 4,
    });
    expect(result).toContain("```\nabcd\n```");
    expect(result).not.toContain("abcde");
    expect(result).toContain("Preview truncated");
    expect(result).toContain("6-character");
  });

  it("does not split a surrogate pair at the truncation boundary", () => {
    // "ab" + 😀 (2 UTF-16 units); a cut at 3 would leave a lone surrogate
    const result = buildPageMarkdown({
      title: "",
      url: "",
      body: "ab\u{1F600}z",
      maxBodyChars: 3,
    });
    expect(result).toContain("```\nab\n```");
    expect(result).not.toContain("\ud83d");
    expect(result).toContain("Preview truncated");
  });

  it("shows no truncation notice when the body fits exactly", () => {
    const result = buildPageMarkdown({
      title: "",
      url: "",
      body: "abcd",
      maxBodyChars: 4,
    });
    expect(result).toBe("```\nabcd\n```");
  });
});
