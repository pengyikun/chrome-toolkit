/** Bound rendered metadata without splitting UTF-16 surrogate pairs. */
export function displayText(text: string, limit: number): string {
  if (text.length <= limit) return text;
  let end = Math.max(0, limit - 1);
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end--;
  return text.slice(0, end) + "…";
}

/**
 * Escapes characters that are meaningful inside a Markdown link text `[…]`.
 * Prevents Markdown injection from untrusted page titles.
 */
export function escapeMarkdownLinkText(text: string): string {
  return escapeMarkdownInline(text).trim();
}

/**
 * Sanitises a URL for use as a Markdown link destination.
 * Encodes characters that would break `<…>` angle-bracket wrapping.
 */
export function escapeMarkdownLinkUrl(url: string): string {
  return url
    .replace(/[\r\n\s]+/g, "%20")
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E")
    .replace(/\\/g, "%5C")
    .replace(/&/g, "&amp;");
}

/**
 * Escapes characters that are meaningful in inline Markdown rendering.
 * Used to safely display untrusted text (e.g. page titles) in Detail views.
 */
export function escapeMarkdownInline(text: string): string {
  return text
    .replace(/([\\`*_{}[\]()#+\-.!|~])/g, "\\$1")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/[\r\n]+/g, " ");
}

/**
 * Wraps content in a fenced code block whose fence is longer than any
 * backtick run inside it, so untrusted content can never terminate the
 * block early — and is displayed verbatim, without escaping artifacts.
 */
export function fencedCodeBlock(content: string, language = ""): string {
  const longestRun =
    content.match(/`+/g)?.reduce((max, run) => Math.max(max, run.length), 0) ??
    0;
  const fence = "`".repeat(Math.max(3, longestRun + 1));
  return `${fence}${language}\n${content}\n${fence}`;
}

/**
 * Builds the Detail-view Markdown for an extracted page: escaped title
 * heading, autolinked URL, and the body in a safe fenced code block.
 * When `maxBodyChars` is given and the body exceeds it, the display is
 * truncated with a notice (the clipboard always receives the full body).
 */
export function buildPageMarkdown(options: {
  title: string;
  url: string;
  body: string;
  language?: string;
  maxBodyChars?: number;
}): string {
  const { title, url, body, language = "", maxBodyChars } = options;
  const sections: string[] = [];
  if (title)
    sections.push(`# ${escapeMarkdownInline(displayText(title, 500))}`);
  if (url)
    sections.push(
      url.length <= 2000 && isSafeBrowserUrl(url)
        ? `[${escapeMarkdownInline(url)}](<${escapeMarkdownLinkUrl(url)}>)`
        : escapeMarkdownInline(displayText(url, 2000)),
    );
  if (body) {
    const max = maxBodyChars ?? body.length;
    let shown = body.slice(0, max);
    // Never split a surrogate pair at the truncation boundary — a lone
    // high surrogate would render as a replacement character.
    const lastCode = shown.charCodeAt(shown.length - 1);
    if (
      shown.length < body.length &&
      lastCode >= 0xd800 &&
      lastCode <= 0xdbff
    ) {
      shown = shown.slice(0, -1);
    }
    sections.push(fencedCodeBlock(shown, language));
    if (body.length > max) {
      sections.push(`_Preview truncated; use Copy for the full content._`);
    }
  }
  return sections.join("\n\n");
}

/** Only browser-navigation schemes; custom application handlers remain text. */
export function isSafeBrowserUrl(url: string): boolean {
  try {
    return ["http:", "https:", "chrome:", "file:", "about:"].includes(
      new URL(url).protocol,
    );
  } catch {
    return false;
  }
}
