export interface Cookie {
  name: string;
  value: string;
}

/**
 * Parses a raw `document.cookie` string into an array of cookie objects.
 * `document.cookie` returns a semicolon-separated list: `"name1=val1; name2=val2"`.
 * Values may contain `=` characters, so only the first `=` is used as the
 * delimiter. Whitespace around names and values is trimmed (RFC 6265 treats
 * it as optional padding, never as part of the name or value). Empty
 * segments (e.g. from a trailing semicolon) are dropped.
 */
export function parseCookieString(raw: string): Cookie[] {
  return raw
    .split(";")
    .map((pair) => pair.trim())
    .filter((pair) => pair !== "")
    .map((pair) => {
      const eqIndex = pair.indexOf("=");
      if (eqIndex < 0) {
        return { name: pair, value: "" };
      }
      return {
        name: pair.slice(0, eqIndex).trim(),
        value: pair.slice(eqIndex + 1).trim(),
      };
    });
}
