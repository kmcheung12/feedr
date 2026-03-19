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

Also update `browser_action.default_title` from `"Add feed to Feedr"` to `"Feedr"` to reflect that the popup now serves two purposes (add feed + open reader).

### popup/popup.html

Current `#app` structure (last two elements):

```html
    <p id="message" class="message hidden"></p>
  </div>
```

Insert `#btn-open-feedr` immediately before the closing `</div>` of `#app`, after `<p id="message">`:

```html
    <p id="message" class="message hidden"></p>
    <button id="btn-open-feedr">Open Feedr ↗</button>
  </div>
```

### popup/popup.js

Inside the existing `DOMContentLoaded` async callback (where all other DOM handlers are registered), add:

```js
document.getElementById('btn-open-feedr').addEventListener('click', () => {
  browser.tabs.create({ url: browser.runtime.getURL('newtab/newtab.html') });
  window.close();
});
```

`window.close()` dismisses the popup immediately after launching the tab — standard browser extension UX.

### popup/popup.css

Add styles for `#btn-open-feedr` after the existing `button` and `button:hover` rules. The button uses a secondary/ghost style to visually distinguish it from the primary "Add" action:

```css
#btn-open-feedr {
  background: none;
  border: 1px solid #30363d;
  color: #8b949e;
  margin-top: 10px;
}
#btn-open-feedr:hover {
  background: #161b22;
  color: #cdd9e5;
  border-color: #8b949e;
}
```

The hex values `#30363d`, `#8b949e`, and `#cdd9e5` are taken from the existing palette in `popup.css`. `#161b22` is a new dark surface value introduced for the hover state, consistent with the existing dark-theme palette range (`#0d1117` to `#1a1a2e`). `margin-top: 10px` provides visual separation from the `#manual` section above.

---

## Files Changed

| File | Change |
|------|--------|
| `manifest.json` | Remove `chrome_url_overrides` block; update `default_title` to `"Feedr"` |
| `popup/popup.html` | Add `#btn-open-feedr` after `#message`, before closing `</div>` of `#app` |
| `popup/popup.js` | Add click handler inside `DOMContentLoaded` callback |
| `popup/popup.css` | Add ghost-style rules for `#btn-open-feedr` |

---

## Out of Scope

- Changing the reader page (`newtab/newtab.html`) in any way
- Keyboard shortcut to open Feedr
- Remembering or restoring the previously-open Feedr tab
