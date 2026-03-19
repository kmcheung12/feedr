# MV3 Migration + Private Browsing Design

## Overview

Two coupled changes to the Feedr browser extension:

1. **Manifest V3 migration**: Update the extension to use Manifest Version 3 (MV3), required for Chrome compatibility and future Firefox support.
2. **Private/incognito mode isolation**: Feeds and articles added in a private/incognito window are stored ephemerally and completely isolated from normal feeds. They vanish when the last private window closes.

These features are coupled because both require `chrome.*` APIs (instead of `browser.*`) and because private browsing detection depends on `chrome.windows.getCurrent()`, which is an MV3-friendly API.

---

## Section 1: Manifest V3 Migration

### Goal

Make the extension run as MV3, compatible with both Chrome and Firefox. Use `chrome.*` throughout (Chrome 99+ supports promise-based `chrome.*`; Firefox supports it as an alias for `browser.*`, so no polyfill is needed).

### Changes

**`manifest.json`**

- `"manifest_version": 2` → `"manifest_version": 3`
- `"browser_action"` → `"action"`
- Remove `"background": { "scripts": [...], "persistent": true }`, replace with `"background": { "service_worker": "background.js" }`
- Add `"scripting"` to `"permissions"` (required for `chrome.scripting.executeScript`)
- Add `"windows"` to `"permissions"` (required for `chrome.windows.getCurrent()` and `chrome.windows.onRemoved`)

**`background.js`**

- Add `importScripts()` calls at the top to load all helper scripts that were previously listed in `manifest.json`'s `"scripts"` array. This is the Chrome-compatible way to load multiple scripts in a service worker.
- Replace all `browser.*` calls with `chrome.*`.

**`popup/popup.js`**

- Replace `browser.tabs.executeScript(tab.id, { code: '...' })` with `chrome.scripting.executeScript({ target: { tabId }, func: () => { /* ... */ } })`. The `func` form passes a function reference (not a string), which is the MV3-required approach.
- Replace all other `browser.*` calls with `chrome.*`.

**`newtab/newtab.js`**

- Replace all `browser.*` calls with `chrome.*`.

---

## Section 2: Private Browsing Ephemeral Feeds

### Goal

When the user has a private/incognito window open and adds feeds, those feeds and their articles are stored in memory only (not on disk), are invisible to normal windows, and are cleared when the last private window closes.

### Detection

Both `popup/popup.js` and `newtab/newtab.js` call `chrome.windows.getCurrent()` at startup to check `window.incognito`. This sets a module-level `isPrivate` boolean.

In `popup.js`:
```js
const win = await chrome.windows.getCurrent();
const isPrivate = win.incognito;
```

In `newtab.js`:
```js
let isPrivate = false;
// In DOMContentLoaded:
const win = await chrome.windows.getCurrent();
isPrivate = win.incognito;
```

### Message Routing

The `send()` helper in `newtab.js` is updated to include `private: isPrivate` in every message:
```js
function send(type, payload = {}) {
  return chrome.runtime.sendMessage(Object.assign({ type, private: isPrivate }, payload));
}
```

The popup's `addFeed()` call passes `private: isPrivate` in its `sendMessage` call.

The background service worker reads `message.private` to decide which store to use: `privateStore` (for private) or `db` (for normal).

### Ephemeral Storage: `lib/private-store.js`

A new file implementing the same interface as `lib/db.js`, but backed by `chrome.storage.session`:

- `chrome.storage.session`: MV3-only, memory-only (not persisted to disk), shared across all extension contexts in the same browser session, cleared automatically when the browser closes.
- Two keys: `private_feeds` (array of feed objects) and `private_articles` (array of article objects).
- IDs are assigned by `Math.max(0, ...items.map(i => i.id)) + 1`.
- Exposes `var privateStore` with the same methods as `db`: `addFeed`, `removeFeed`, `getFeeds`, `updateFeed`, `getFeedByUrl`, `upsertArticles`, `getArticles`, `getArticle`, `updateArticle`.

### Cleanup on Last Private Window Close

In `background.js`, a `chrome.windows.onRemoved` listener fires whenever any window is closed. It calls `chrome.windows.getAll({ windowTypes: ['normal'] })` (which includes incognito windows) and filters for `win.incognito`. If no private windows remain, it clears the private store by setting `private_feeds: []` and `private_articles: []` in `chrome.storage.session`.

### Complete Isolation

Private mode is a **completely blank slate** — no feeds from normal mode are visible, and feeds added in private mode are never written to IndexedDB.

---

## Files Changed

| File | Change |
|------|--------|
| `manifest.json` | MV3: `manifest_version: 3`, `action`, `background.service_worker`, add `"scripting"` + `"windows"` permissions |
| `background.js` | Add `importScripts()` at top; `browser.*` → `chrome.*`; accept `store` parameter in handlers; add `chrome.windows.onRemoved` cleanup |
| `popup/popup.js` | `chrome.windows.getCurrent()` for incognito detection; `chrome.scripting.executeScript` (func form); `browser.*` → `chrome.*`; pass `private: isPrivate` in messages |
| `newtab/newtab.js` | `chrome.windows.getCurrent()` for incognito detection; `isPrivate` module variable; `send()` includes `private: isPrivate`; `browser.*` → `chrome.*` |
| `lib/private-store.js` | New file: `var privateStore` implementing `db` interface backed by `chrome.storage.session` |

---

## No Tests

No automated tests exist for this project beyond `tests/parser.test.js` (pure parsing logic). All UI and storage behaviour is verified manually in Firefox and Chrome.
