/** Internal AppleScript implementation. Arguments carry all dynamic text. */
export const MAX_OUTPUT_BYTES = 32 * 1024 * 1024;
export const HTML_LIMIT = 5_000_000;
export const COOKIE_LIMIT = 1_000_000;

export const JSON_HANDLERS = `
use framework "Foundation"
use scripting additions
on checkedText(value)
  if value is missing value then return ""
  return value as text
end checkedText
on boundedText(value)
  set nsText to current application's NSString's stringWithString:value
  if (nsText's lengthOfBytesUsingEncoding:(current application's NSUTF8StringEncoding)) > ${MAX_OUTPUT_BYTES} then error "OUTPUT_TOO_LARGE" number 1005
  return value
end boundedText
on encodeJSON(value)
  set {jsonData, jsonError} to current application's NSJSONSerialization's dataWithJSONObject:value options:0 |error|:(reference)
  if jsonData is missing value then error "INVALID_RESPONSE" number 1006
  if (jsonData's |length|()) > ${MAX_OUTPUT_BYTES} then error "OUTPUT_TOO_LARGE" number 1005
  return (current application's NSString's alloc()'s initWithData:jsonData encoding:(current application's NSUTF8StringEncoding)) as text
end encodeJSON
`;

const GUARD = `
if application "Google Chrome" is not running then error "CHROME_NOT_RUNNING" number 1001
tell application "Google Chrome"
  if (count of windows) is 0 then error "CHROME_NO_WINDOW" number 1002
end tell
`;

export function chromeScript(body: string): string {
  return `${JSON_HANDLERS}\non run argv\n${GUARD}\n${body}\nend run`;
}

export const TAB_INFO_SCRIPT = chromeScript(`
tell application "Google Chrome"
  set currentTab to active tab of front window
  set payload to {my checkedText(URL of currentTab), my checkedText(title of currentTab)}
end tell
return my encodeJSON(payload)
`);

export const SNAPSHOT_SCRIPT = chromeScript(`
tell application "Google Chrome"
  set currentWindow to front window
  set windowID to id of currentWindow as text
  set rows to {}
  repeat with currentTab in every tab of currentWindow
    set end of rows to {id of currentTab as text, my checkedText(title of currentTab), my checkedText(URL of currentTab)}
  end repeat
  if (id of front window as text) is not windowID then error "CHROME_TAB_STRIP" number 1004
end tell
return my encodeJSON({windowID, rows})
`);

export const EXTRACT_SCRIPT = chromeScript(`
tell application "Google Chrome"
  set currentTab to active tab of front window
  set payload to execute currentTab javascript (item 1 of argv)
end tell
if payload is missing value then error "INVALID_RESPONSE" number 1006
return my boundedText(payload as text)
`);

export function extractionJavaScript(kind: "html" | "cookies"): string {
  const expression =
    kind === "html"
      ? "document.body ? document.body.outerHTML : document.documentElement.outerHTML"
      : "document.cookie";
  const limit = kind === "html" ? HTML_LIMIT : COOKIE_LIMIT;
  return `(() => {
    const body = ${expression};
    if (typeof body !== "string") return JSON.stringify({ error: "invalid" });
    if (body.length > ${limit}) return JSON.stringify({ error: "too-large" });
    const title = document.title;
    const url = location.href;
    if (title.length + url.length > 1000000) return JSON.stringify({ error: "too-large" });
    return JSON.stringify({ title, url, body });
  })()`;
}

// Preserve numeric permission errors even when the OS message is localized.
export const AX_ERROR_HANDLER = `
if errNum is -25211 or errNum is -1743 then error errMsg number errNum
error "CHROME_TAB_STRIP" number 1004
`;

export const AX_SCRIPT = chromeScript(`
tell application "System Events"
  tell process "Google Chrome"
    try
      set frontWin to front window
      set base to group 1 of group 1 of group 1 of group 1 of frontWin
      set tabGroupEl to tab group 1 of base
      set tabStripGroup to missing value
      repeat with g in (every group of tabGroupEl)
        if (count of (every scroll area of g)) > 0 then
          set tabStripGroup to g
          exit repeat
        end if
      end repeat
      if tabStripGroup is missing value then error "CHROME_TAB_STRIP" number 1004
      set scrollAreas to every scroll area of tabStripGroup
      set tabScrollArea to last item of scrollAreas
      set tabContainer to group 1 of group 1 of tabScrollArea
      set rows to {}
      repeat with el in (every UI element of tabContainer)
        set elRole to role of el
        if elRole is "AXRadioButton" then
          set end of rows to {"T"}
        else if elRole is "AXGroup" then
          set groupDesc to missing value
          repeat with inner in (every UI element of el)
            if role of inner is "AXTabGroup" then
              if groupDesc is not missing value then error "CHROME_TAB_STRIP" number 1004
              set groupDesc to description of inner
            end if
          end repeat
          if groupDesc is missing value then error "CHROME_TAB_STRIP" number 1004
          set end of rows to {"G", groupDesc as text, count of (every radio button of el)}
        else if elRole is not "AXButton" then
          error "CHROME_TAB_STRIP" number 1004
        end if
      end repeat
    on error errMsg number errNum
      ${AX_ERROR_HANDLER}
    end try
  end tell
end tell
return my encodeJSON(rows)
`);

export const SWITCH_SCRIPT = chromeScript(`
set wantedWindow to item 1 of argv
set wantedTab to item 2 of argv
tell application "Google Chrome"
  set targetWindow to missing value
  repeat with w in every window
    if (id of w as text) is wantedWindow then
      set targetWindow to w
      exit repeat
    end if
  end repeat
  if targetWindow is missing value then error "TAB_GONE" number 1003
  set targetIndex to 0
  repeat with i from 1 to count of tabs of targetWindow
    if (id of tab i of targetWindow as text) is wantedTab then
      set targetIndex to i
      exit repeat
    end if
  end repeat
  if targetIndex is 0 then error "TAB_GONE" number 1003
  if (id of tab targetIndex of targetWindow as text) is not wantedTab then error "TAB_GONE" number 1003
  set active tab index of targetWindow to targetIndex
  if (id of active tab of targetWindow as text) is not wantedTab then error "TAB_GONE" number 1003
  set index of targetWindow to 1
  activate
  if (id of front window as text) is not wantedWindow then error "TAB_GONE" number 1003
  if (id of active tab of front window as text) is not wantedTab then error "TAB_GONE" number 1003
end tell
return my encodeJSON(true as list)
`);
