export interface Cookie {
  name: string;
  value: string;
}

/**
 * Parses a raw `document.cookie` string into an array of cookie objects.
 * `document.cookie` returns a semicolon-separated list: `"name1=val1; name2=val2"`.
 * Values may contain `=` characters, so only the first `=` is used as the delimiter.
 */
export function parseCookieString(raw: string): Cookie[] {
  if (!raw.trim()) return [];

  return raw.split(";").map((pair) => {
    const trimmed = pair.trim();
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex < 0) {
      return { name: trimmed, value: "" };
    }
    return {
      name: trimmed.slice(0, eqIndex),
      value: trimmed.slice(eqIndex + 1),
    };
  });
}
