// @vitest-environment happy-dom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserNotRunningError } from "../errors";
import { useChromeData } from "../use-chrome-data";

const { mockShowChromeError } = vi.hoisted(() => ({
  mockShowChromeError: vi.fn(),
}));

vi.mock("../toast-error", () => ({
  showChromeError: (...args: unknown[]) => mockShowChromeError(...args),
}));

afterEach(() => {
  vi.clearAllMocks();
});

/** A promise whose resolution the test controls. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("useChromeData", () => {
  it("loads data on mount", async () => {
    const { result } = renderHook(() =>
      useChromeData({ fetch: async () => "hello", actionLabel: "load" }),
    );
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBe("hello");
    expect(result.current.error).toBe("");
  });

  it("calls onSuccess with the loaded data", async () => {
    const onSuccess = vi.fn();
    const { result } = renderHook(() =>
      useChromeData({ fetch: async () => 42, actionLabel: "load", onSuccess }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(onSuccess).toHaveBeenCalledWith(42);
  });

  it("stores the error message and shows the Chrome error toast on failure", async () => {
    const error = new BrowserNotRunningError();
    const { result } = renderHook(() =>
      useChromeData({
        fetch: () => Promise.reject(error),
        actionLabel: "get things",
      }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Google Chrome is not running");
    expect(result.current.data).toBeNull();
    expect(mockShowChromeError).toHaveBeenCalledWith(error, "get things");
  });

  it("keeps loaded data visible when onSuccess fails", async () => {
    const sideEffectError = new Error("clipboard unavailable");
    const { result } = renderHook(() =>
      useChromeData({
        fetch: async () => "loaded",
        actionLabel: "extract cookies",
        onSuccess: () => Promise.reject(sideEffectError),
      }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    // The side-effect failure is reported but does not become a load error.
    expect(result.current.data).toBe("loaded");
    expect(result.current.error).toBe("");
    expect(mockShowChromeError).toHaveBeenCalledWith(
      sideEffectError,
      "extract cookies",
    );
  });

  it("clears a previous error when reloading", async () => {
    let fail = true;
    const { result } = renderHook(() =>
      useChromeData({
        fetch: async () => {
          if (fail) throw new Error("boom");
          return "ok";
        },
        actionLabel: "load",
      }),
    );
    await waitFor(() => expect(result.current.error).toBe("boom"));

    fail = false;
    await act(() => result.current.reload());
    expect(result.current.error).toBe("");
    expect(result.current.data).toBe("ok");
  });

  it("discards a stale response when a reload has started since", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const responses = [first.promise, second.promise];
    const onSuccess = vi.fn();
    const { result } = renderHook(() =>
      useChromeData({
        fetch: () => responses.shift() ?? Promise.resolve("unexpected"),
        actionLabel: "load",
        onSuccess,
      }),
    );

    // Start a reload while the first request is still in flight,
    // then let the stale first response land after the second.
    await act(async () => {
      const reloading = result.current.reload();
      second.resolve("fresh");
      await reloading;
      first.resolve("stale");
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBe("fresh");
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith("fresh");
  });

  it("ignores errors from requests that are no longer current", async () => {
    const first = deferred<string>();
    const responses: Promise<string>[] = [
      // First request will reject after the second resolves.
      first.promise.then(() => Promise.reject(new Error("stale failure"))),
      Promise.resolve("fresh"),
    ];
    const { result } = renderHook(() =>
      useChromeData({
        fetch: () => responses.shift() ?? Promise.resolve("unexpected"),
        actionLabel: "load",
      }),
    );

    await act(async () => {
      await result.current.reload();
      first.resolve("trigger rejection");
    });

    await waitFor(() => expect(result.current.data).toBe("fresh"));
    expect(result.current.error).toBe("");
    expect(mockShowChromeError).not.toHaveBeenCalled();
  });
});
