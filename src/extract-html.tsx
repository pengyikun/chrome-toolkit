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
import { getActiveTabHtml } from "./lib/chrome";
import { escapeCodeFences, escapeMarkdownInline } from "./lib/markdown";
import { showChromeError } from "./lib/toast-error";

interface State {
  loading: boolean;
  html: string;
  title: string;
  url: string;
  error: string;
}

const INITIAL_STATE: State = {
  loading: true,
  html: "",
  title: "",
  url: "",
  error: "",
};

export default function Command() {
  const [state, setState] = useState<State>(INITIAL_STATE);
  const requestIdRef = useRef(0);

  const loadHtml = useCallback(async () => {
    const id = ++requestIdRef.current;
    setState((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const page = await getActiveTabHtml();
      if (id !== requestIdRef.current) return;
      setState({
        loading: false,
        html: page.html,
        title: page.title,
        url: page.url,
        error: "",
      });
      await Clipboard.copy(page.html);
      await showToast({
        style: Toast.Style.Success,
        title: "Body HTML Copied to Clipboard",
        message: page.title || page.url || "Active tab",
      });
    } catch (error) {
      if (id !== requestIdRef.current) return;
      const message = error instanceof Error ? error.message : String(error);
      setState((prev) => ({ ...prev, loading: false, error: message }));
      await showChromeError(error, "extract HTML");
    }
  }, []);

  useEffect(() => {
    loadHtml();
  }, [loadHtml]);

  const { loading, html, title, url, error } = state;

  const markdown = useMemo(() => {
    if (error) return `**Error**\n\n${error}`;
    if (loading && !html) return "Extracting body HTML from Google Chrome…";

    const sections: string[] = [];
    if (title) sections.push(`# ${escapeMarkdownInline(title)}`);
    if (url) sections.push(url);
    if (html) sections.push("```html\n" + escapeCodeFences(html) + "\n```");
    return sections.join("\n\n");
  }, [error, html, loading, title, url]);

  return (
    <Detail
      isLoading={loading}
      markdown={markdown}
      actions={
        <ActionPanel>
          {!error && html && (
            <Action.CopyToClipboard title="Copy Body Html" content={html} />
          )}
          {url && <Action.OpenInBrowser url={url} />}
          <Action
            title="Refresh"
            icon={Icon.RotateClockwise}
            onAction={loadHtml}
          />
        </ActionPanel>
      }
    />
  );
}
