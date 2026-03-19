# Popup "Open Feedr" Button Design

## Overview

Remove the automatic new tab override so Feedr no longer hijacks every new tab. Add an "Open Feedr" button to the browser action popup as the single intentional entry point to the reader.

---

## Goals

- Users open Feedr deliberately, not on every new tab
- One-click access to the reader from the extension popup
- No change to the reader page itself (`newtab/newtab.html`)

---

## Changes

### manifest.json

Remove the `chrome_url_overrides` block entirely:

```json
// Remove:
"chrome_url_overrides": {
  "newtab": "newtab/newtab.html"
}
```

No other manifest changes.

### popup/popup.html

Add an "Open Feedr" button at the bottom of `#app`, after the manual URL section:

```html
<button id="btn-open-feedr">Open Feedr ↗</button>
```

### popup/popup.js

Add a click handler that opens `newtab/newtab.html` as a new browser tab, then closes the popup:

```js
document.getElementById('btn-open-feedr').addEventListener('click', () => {
  browser.tabs.create({ url: browser.runtime.getURL('newtab/newtab.html') });
  window.close();
});
```

`window.close()` dismisses the popup immediately after launching the tab — standard browser extension UX.

### popup/popup.css

Style `#btn-open-feedr` as a full-width button, visually consistent with the existing Add button but distinguished as a navigation action (e.g., a slightly different background colour or a secondary/ghost style). Exact styling follows the existing CSS custom properties (`--bg`, `--surface`, `--border`, `--accent`, `--text`, `--muted`).

---

## Files Changed

| File | Change |
|------|--------|
| `manifest.json` | Remove `chrome_url_overrides` block |
| `popup/popup.html` | Add `#btn-open-feedr` button |
| `popup/popup.js` | Add click handler using `browser.tabs.create` + `window.close()` |
| `popup/popup.css` | Add styles for `#btn-open-feedr` |

---

## Out of Scope

- Changing the reader page (`newtab/newtab.html`) in any way
- Keyboard shortcut to open Feedr
- Remembering or restoring the previously-open Feedr tab
