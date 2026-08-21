import { useCallback, useEffect, useRef, useState } from "react";
import { showChromeError } from "./toast-error";

export interface UseChromeDataOptions<T> {
  /** Fetches the data from Chrome. Re-read on every reload, so it need not be memoised. */
  fetch: () => Promise<T>;
  /** Action label for the generic failure toast, e.g. "extract cookies". */
  actionLabel: string;
  /** Optional side effect after a successful (non-stale) load, e.g. copying to the clipboard. */
  onSuccess?: (data: T) => void | Promise<void>;
}

export interface UseChromeDataResult<T> {
  data: T | null;
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
}

/**
 * Shared loader for commands that read data from Chrome.
 * Encapsulates the loading/error state machine, the stale-response guard
 * (a reload invalidates any in-flight request, so slow responses can never
 * overwrite newer ones), and the contextual Chrome error toast.
 * Loads once on mount; call `reload` to refresh.
 */
export function useChromeData<T>(
  options: UseChromeDataOptions<T>,
): UseChromeDataResult<T> {
  const [state, setState] = useState<{
    data: T | null;
    loading: boolean;
    error: string;
  }>({ data: null, loading: true, error: "" });

  // Latest options, so callers don't have to memoise their callbacks and
  // `reload` can stay referentially stable.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const requestIdRef = useRef(0);

  const reload = useCallback(async () => {
    const id = ++requestIdRef.current;
    setState((prev) => ({ ...prev, loading: true, error: "" }));
    let data: T;
    try {
      data = await optionsRef.current.fetch();
    } catch (error) {
      if (id !== requestIdRef.current) return;
      const message = error instanceof Error ? error.message : String(error);
      setState((prev) => ({ ...prev, loading: false, error: message }));
      await showChromeError(error, optionsRef.current.actionLabel);
      return;
    }
    if (id !== requestIdRef.current) return;
    setState({ data, loading: false, error: "" });
    try {
      await optionsRef.current.onSuccess?.(data);
    } catch (error) {
      // A failed side effect (e.g. clipboard write) is reported, but the
      // successfully loaded data stays on screen — it is not a load error.
      await showChromeError(error, optionsRef.current.actionLabel);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { ...state, reload };
}
