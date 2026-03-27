import {
  Action,
  ActionPanel,
  Clipboard,
  Detail,
  Icon,
  showToast,
  Toast,
} from "@raycast/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getActiveTabCookies } from "./lib/chrome";
import { parseCookieString } from "./lib/cookies";
import { escapeCodeFences, escapeMarkdownInline } from "./lib/markdown";
import { showChromeError } from "./lib/toast-error";

interface State {
  loading: boolean;
  json: string;
  title: string;
  url: string;
  error: string;
}

const INITIAL_STATE: State = {
  loading: true,
  json: "",
  title: "",
  url: "",
  error: "",
};

export default function Command() {
  const [state, setState] = useState<State>(INITIAL_STATE);
  const requestIdRef = useRef(0);

  const loadCookies = useCallback(async () => {
    const id = ++requestIdRef.current;
    setState((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const page = await getActiveTabCookies();
      if (id !== requestIdRef.current) return;
      const cookies = parseCookieString(page.cookies);
      const json = JSON.stringify(cookies, null, 2);
      setState({
        loading: false,
        json,
        title: page.title,
        url: page.url,
        error: "",
      });
      await Clipboard.copy(json);
      await showToast({
        style: Toast.Style.Success,
        title: `${cookies.length} Cookie${cookies.length === 1 ? "" : "s"} Copied to Clipboard`,
        message: page.title || page.url || "Active tab",
      });
    } catch (error) {
      if (id !== requestIdRef.current) return;
      const message = error instanceof Error ? error.message : String(error);
      setState((prev) => ({ ...prev, loading: false, error: message }));
      await showChromeError(error, "extract cookies");
    }
  }, []);

  useEffect(() => {
    loadCookies();
  }, [loadCookies]);

  const { loading, json, title, url, error } = state;

  const markdown = useMemo(() => {
    if (error) return `**Error**\n\n${error}`;
    if (loading && !json) return "Extracting cookies from Google Chrome…";

    const sections: string[] = [];
    if (title) sections.push(`# ${escapeMarkdownInline(title)}`);
    if (url) sections.push(url);
    if (json) sections.push("```json\n" + escapeCodeFences(json) + "\n```");
    return sections.join("\n\n");
  }, [error, json, loading, title, url]);

  return (
    <Detail
      isLoading={loading}
      markdown={markdown}
      actions={
        <ActionPanel>
          {!error && json && (
            <Action.CopyToClipboard title="Copy Cookies JSON" content={json} />
          )}
          {url && <Action.OpenInBrowser url={url} />}
          <Action
            title="Refresh"
            icon={Icon.RotateClockwise}
            onAction={loadCookies}
          />
        </ActionPanel>
      }
    />
  );
}
