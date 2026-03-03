import { describe, expect, it } from "vitest";
import {
  AutomationPermissionError,
  BrowserNotRunningError,
  NoWindowError,
  UnexpectedResponseError,
} from "../errors";

describe("BrowserNotRunningError", () => {
  it("has correct name and message", () => {
    const err = new BrowserNotRunningError();
    expect(err.name).toBe("BrowserNotRunningError");
    expect(err.message).toBe("Google Chrome is not running");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(BrowserNotRunningError);
  });
});

describe("NoWindowError", () => {
  it("has correct name and message", () => {
    const err = new NoWindowError();
    expect(err.name).toBe("NoWindowError");
    expect(err.message).toBe("No Chrome window is open");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(NoWindowError);
  });
});

describe("AutomationPermissionError", () => {
  it("has correct name and message with instructions", () => {
    const err = new AutomationPermissionError();
    expect(err.name).toBe("AutomationPermissionError");
    expect(err.message).toContain("System Settings");
    expect(err.message).toContain("Automation");
    expect(err).toBeInstanceOf(Error);
  });
});

describe("UnexpectedResponseError", () => {
  it("has correct name and default message", () => {
    const err = new UnexpectedResponseError();
    expect(err.name).toBe("UnexpectedResponseError");
    expect(err.message).toBe("Unexpected response from Google Chrome");
  });

  it("includes detail when provided", () => {
    const err = new UnexpectedResponseError("missing separator");
    expect(err.message).toBe(
      "Unexpected response from Google Chrome: missing separator",
    );
  });
});
