import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import {
  AX_ERROR_HANDLER,
  COOKIE_LIMIT,
  extractionJavaScript,
  HTML_LIMIT,
  JSON_HANDLERS,
  MAX_OUTPUT_BYTES,
} from "../chrome-scripts";
const execFileAsync = promisify(execFile);

describe("page extraction program", () => {
  it.each(["html", "cookies"] as const)(
    "captures %s, title and URL in one evaluation",
    (kind) => {
      const text = "test\n\u001f\u001e😀";
      const json = runInNewContext(extractionJavaScript(kind), {
        document: { title: text, cookie: text, body: { outerHTML: text } },
        location: { href: "https://example.test" },
      });
      expect(JSON.parse(json)).toEqual({
        title: text,
        url: "https://example.test",
        body: text,
      });
    },
  );
  it.each([
    ["html", HTML_LIMIT],
    ["cookies", COOKIE_LIMIT],
  ] as const)(
    "rejects oversized %s before transporting the payload",
    (kind, limit) => {
      const text = "x".repeat(limit + 1);
      const result = runInNewContext(extractionJavaScript(kind), {
        document: { title: "T", cookie: text, body: { outerHTML: text } },
        location: { href: "https://example.test" },
      });
      expect(JSON.parse(result)).toEqual({ error: "too-large" });
      expect(result.length).toBeLessThan(100);
    },
  );
  it("accepts the exact limit and uses documentElement when body is absent", () => {
    const text = "x".repeat(HTML_LIMIT);
    const result = runInNewContext(extractionJavaScript("html"), {
      document: { title: "", body: null, documentElement: { outerHTML: text } },
      location: { href: "https://example.test" },
    });
    expect(JSON.parse(result).body.length).toBe(HTML_LIMIT);
  });
});

const native =
  process.platform === "darwin" &&
  process.env.CHROME_TOOLKIT_NATIVE_TESTS === "1";
describe.skipIf(!native)(
  "native osascript contracts (no Chrome session required)",
  () => {
    it("serializes nested values and preserves control characters and trailing newlines", async () => {
      const script = `${JSON_HANDLERS}\nreturn my encodeJSON({"Title" & character id 31 & character id 30 & linefeed, {"001", "😀"}, true})`;
      const { stdout } = await execFileAsync("osascript", ["-e", script], {
        timeout: 10000,
      });
      expect(JSON.parse(stdout)).toEqual([
        "Title\u001f\u001e\n",
        ["001", "😀"],
        true,
      ]);
    });
    it.each([-25211, -1743])(
      "preserves localized permission code %i",
      async (code) => {
        const script = `try\nerror "Kein Zugriff" number ${code}\non error errMsg number errNum\n${AX_ERROR_HANDLER}\nend try`;
        await expect(
          execFileAsync("osascript", ["-e", script], { timeout: 10000 }),
        ).rejects.toMatchObject({
          stderr: expect.stringContaining(`(${code})`),
        });
      },
    );
    it("maps an unknown traversal failure to a transient AX error", async () => {
      const script = `try\nerror "private text" number -1728\non error errMsg number errNum\n${AX_ERROR_HANDLER}\nend try`;
      await expect(
        execFileAsync("osascript", ["-e", script], { timeout: 10000 }),
      ).rejects.toMatchObject({
        stderr: expect.stringContaining("AX_READ_FAILED (1008)"),
      });
    });
    it("rejects output beyond the transport budget", async () => {
      const script = `${JSON_HANDLERS}\nset textValue to (current application's NSString's stringWithString:"x")'s stringByPaddingToLength:${MAX_OUTPUT_BYTES + 1} withString:"x" startingAtIndex:0\nreturn my boundedText(textValue as text)`;
      await expect(
        execFileAsync("osascript", ["-e", script], { timeout: 15000 }),
      ).rejects.toMatchObject({
        stderr: expect.stringContaining("OUTPUT_TOO_LARGE (1005)"),
      });
    });
  },
);
