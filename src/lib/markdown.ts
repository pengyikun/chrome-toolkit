/**
 * Escapes characters that are meaningful inside a Markdown link text `[…]`.
 * Prevents Markdown injection from untrusted page titles.
 */
export function escapeMarkdownLinkText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[\r\n]+/g, " ")
    .trim();
}

/**
 * Sanitises a URL for use as a Markdown link destination.
 * Encodes characters that would break `<…>` angle-bracket wrapping.
 */
export function escapeMarkdownLinkUrl(url: string): string {
  return url
    .replace(/[\r\n\s]+/g, "%20")
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E");
}

/**
 * Escapes characters that are meaningful in inline Markdown rendering.
 * Used to safely display untrusted text (e.g. page titles) in Detail views.
 */
export function escapeMarkdownInline(text: string): string {
  return text
    .replace(/([\\`*_{}[\]()#+\-.!|>~])/g, "\\$1")
    .replace(/[\r\n]+/g, " ");
}

/**
 * Escapes triple-backtick sequences inside code blocks to prevent
 * premature closing of Markdown fenced code blocks.
 */
export function escapeCodeFences(input: string): string {
  return input.replace(/```/g, "\\`\\`\\`");
}
