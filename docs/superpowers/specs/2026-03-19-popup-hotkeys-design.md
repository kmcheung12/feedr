# Popup Hotkeys Design

## Overview

Add two user-configurable global keyboard shortcuts to the Feedr popup:

1. **Open Feedr shortcut** — fires from any browser tab, opens the Feedr newtab page (same as clicking "Open Feedr ↗").
2. **Add feed shortcut** — fires from any browser tab, reads the clipboard and adds it as a feed (same as pasting into the URL field and clicking "Add").

Each shortcut is recorded in the popup UI, stored in `chrome.storage.local`, and fired by a content script injected into all pages.

---

## Popup UI

### Layout change

The "Add" button row and "Open Feedr" button are each wrapped in a `.btn-row` flex container with the action button on the left and a small hotkey button on the right:

```
[ input field                                     ]
[ Add                          ] [ ⌨ Ctrl+A       ]
[ Open Feedr ↗                 ] [ ⌨ Cmd+Shift+F  ]
```

The hotkey button (`<button class="btn-shortcut">`) is narrow, styled like the secondary "Open Feedr" button (ghost/outline style), and shows the current shortcut or `⌨ —` if none is set.

### Recording flow

1. User clicks a hotkey button → button text changes to `press key…`, a `keydown` listener is attached to `document`, and a `focusin` listener is attached to cancel recording if the user clicks elsewhere.
2. Next key event that includes **at least one modifier key** (Ctrl, Alt/Option, or Meta/Command) is captured. Any additional modifiers and any non-modifier key held at the same time are included.
3. Escape cancels recording and restores the previous label.
4. Clicking or focusing any other element (detected via `focusin`) cancels recording.
5. Only one recording can be active at a time; starting a new recording cancels any existing one.
6. On capture: the combo is normalised (e.g. `"Ctrl+A"`), saved to `chrome.storage.local`, and the button label updates.

### Shortcut display format

Modifiers are sorted: Ctrl → Alt → Shift → Meta → non-modifier key, joined with `+`. Examples: `Ctrl+A`, `Alt+Shift+F`, `Cmd+K`.

---

## Storage

Two keys in `chrome.storage.local`:

| Key | Value |
|-----|-------|
| `shortcut_open` | string e.g. `"Ctrl+F"`, or absent/null if unset |
| `shortcut_add`  | string e.g. `"Alt+A"`, or absent/null if unset |

---

## Content Script

New file: `content/shortcuts.js`. Declared in `manifest.json` under `content_scripts` (matches all URLs). Loads after `lib/constants.js`.

### Initialisation

Reads `shortcut_open` and `shortcut_add` from `chrome.storage.local` and stores them in module-level variables.

Subscribes to `chrome.storage.onChanged` to update the variables whenever the popup saves a new shortcut — no page reload required.

### Key matching

On `document` `keydown` in capture phase (to intercept before page handlers):

```
combo = build combo string from event (same format as stored)
if combo matches shortcut_open → fire Open Feedr action
if combo matches shortcut_add  → fire Add Feed action
```

Both actions call `event.preventDefault()` to suppress browser default behaviour for that combo.

### Open Feedr action

```js
chrome.runtime.sendMessage({ type: MSG.OPEN_FEEDR });
```

Background responds by creating the newtab tab.

### Add Feed action

The content script reads the clipboard during the `keydown` event (which counts as a user gesture in both Chrome and Firefox):

```js
const url = await navigator.clipboard.readText();
if (url) chrome.runtime.sendMessage({ type: MSG.ADD_FEED, url: url.trim(), private: false });
```

The `"clipboardRead"` manifest permission is required for Firefox to grant this silently. In Chrome, extension content scripts can access the clipboard during a user gesture without prompting.

---

## Background Changes

New message type `OPEN_FEEDR` added to `lib/constants.js` (MSG object).

New handler in `background.js`:

```js
case MSG.OPEN_FEEDR:
  await chrome.tabs.create({ url: chrome.runtime.getURL('newtab/newtab.html') });
  return { ok: true };
```

Note: the popup's "Open Feedr ↗" button continues to call `chrome.tabs.create` directly (no change needed there). The content script uses `MSG.OPEN_FEEDR` → background, which is equivalent.

---

## Manifest Changes

```json
"permissions": ["storage", "activeTab", "scripting", "clipboardRead"],
"host_permissions": ["<all_urls>"],
"content_scripts": [{
  "matches": ["<all_urls>"],
  "js": ["lib/constants.js", "content/shortcuts.js"]
}]
```

---

## Files Changed

| File | Change |
|------|--------|
| `manifest.json` | Add `"clipboardRead"` permission; add `content_scripts` entry |
| `lib/constants.js` | Add `MSG.OPEN_FEEDR` |
| `background.js` | Add `OPEN_FEEDR` handler |
| `popup/popup.html` | Wrap button rows in `.btn-row` divs; add two `btn-shortcut` buttons |
| `popup/popup.js` | Load shortcut labels from storage; recording logic; save on capture |
| `popup/popup.css` | `.btn-row`, `.btn-shortcut`, `.btn-shortcut.recording` rules |
| `content/shortcuts.js` | New file — global keydown listener and action dispatch |

---

## No Tests

All behaviour is UI interaction and browser API calls. Verification is manual in the browser.
