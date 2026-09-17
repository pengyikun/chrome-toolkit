import { useCallback, useEffect, useRef, useState } from "react";
import { showChromeError } from "./toast-error";

export interface UseChromeDataOptions<T> {
  fetch: (signal: AbortSignal) => Promise<T>;
  actionLabel: string;
  /** Check isCurrent before writing, and after awaiting a write before notifying. */
  onSuccess?: (data: T, isCurrent: () => boolean) => void | Promise<void>;
  successActionLabel?: string;
}

export interface UseChromeDataResult<T> {
  data: T | null;
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
}

/** Owns reads and invalidates them on reload/unmount. Clipboard writes are
 * non-cancellable: refreshes during onSuccess coalesce into one later read. */
export function useChromeData<T>(
  options: UseChromeDataOptions<T>,
): UseChromeDataResult<T> {
  const [state, setState] = useState<{
    data: T | null;
    loading: boolean;
    error: string;
  }>({ data: null, loading: true, error: "" });
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const mounted = useRef(false);
  const requestId = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const copying = useRef(false);
  const queued = useRef(false);

  const reload = useCallback(async function load(): Promise<void> {
    if (!mounted.current) return;
    if (copying.current) {
      queued.current = true;
      return;
    }
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const id = ++requestId.current;
    const current = () =>
      mounted.current && id === requestId.current && !abort.signal.aborted;
    const requestOptions = optionsRef.current;
    setState((prev) => ({ ...prev, loading: true, error: "" }));
    let data: T;
    try {
      data = await requestOptions.fetch(abort.signal);
    } catch (error) {
      if (!current()) return;
      const message =
        error instanceof Error ? error.message : "Could not load Chrome data.";
      setState((prev) => ({ ...prev, loading: false, error: message }));
      await showChromeError(error, requestOptions.actionLabel);
      return;
    }
    if (!current()) return;
    setState({ data, loading: true, error: "" });
    copying.current = true;
    try {
      await requestOptions.onSuccess?.(data, current);
    } catch (error) {
      if (current())
        await showChromeError(
          error,
          requestOptions.successActionLabel ?? requestOptions.actionLabel,
        );
    } finally {
      copying.current = false;
      if (current()) setState({ data, loading: false, error: "" });
      if (queued.current && mounted.current) {
        queued.current = false;
        await load();
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void reload();
    return () => {
      mounted.current = false;
      requestId.current++;
      controller.current?.abort();
      queued.current = false;
    };
  }, [reload]);

  return { ...state, reload };
}
