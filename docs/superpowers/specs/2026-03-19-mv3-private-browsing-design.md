# MV3 Migration + Private Browsing Design

## Overview

Two coupled changes to the Feedr browser extension:

1. **Manifest V3 migration**: Update the extension to use Manifest Version 3 (MV3), required for Chrome compatibility and future Firefox support.
2. **Private/incognito mode isolation**: Feeds and articles added in a private/incognito window are stored in memory only, isolated from normal feeds, and cleared when the last private window closes.

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
- Retain the existing `browser_specific_settings.gecko` block, but bump `strict_min_version` from `"109.0"` to `"115.0"`. `chrome.storage.session` was added to Firefox in version 115. Running on Firefox 109–114 would cause a runtime error when `privateStore` initialises.

**`lib/constants.js`**

No changes needed. This file only defines `var MSG = {...}` — no `browser.*` calls.

**`background.js`**

The current `manifest.json` `background.scripts` array lists: `lib/constants.js`, `lib/db.js`, `lib/parser.js`, `lib/Readability.js`, `background.js`. After the MV3 change, `background.js` becomes the service worker entry point and loads the others via `importScripts()` — the Chrome-compatible approach for loading multiple scripts in a service worker (`background.scripts` is Firefox MV3 only):

```js
importScripts(
  'lib/constants.js',
  'lib/db.js',
  'lib/parser.js',
  'lib/Readability.js',
  'lib/private-store.js'  // new file
);
```

Replace all `browser.*` calls with `chrome.*`.

**`popup/popup.js`**

Replace `browser.tabs.executeScript(tab.id, { code: '...' })` with `chrome.scripting.executeScript`:

```js
const results = await chrome.scripting.executeScript({
  target: { tabId: tab.id },
  func: () => {
    const el = document.querySelector(
      'link[type="application/rss+xml"], link[type="application/atom+xml"]'
    );
    return el ? el.href : null;
  }
});
feedUrl = results && results[0] && results[0].result;
```

Two important constraints of the `func` form:
- The return value shape differs from `browser.tabs.executeScript`: instead of `results[0]` (the bare value), MV3 returns `results[0].result` (an `InjectionResult` object with a `result` field). The existing `results[0]` at popup.js:27 must change to `results[0].result`.
- The function passed as `func` is serialised and executed in the content script context. It cannot close over any variables from `popup.js`'s scope. Any required data must be passed via the `args` array and received as function parameters. The current injected code is self-contained so no `args` are needed.

Replace all other `browser.*` calls with `chrome.*`.

**`newtab/newtab.js`**

Replace all `browser.*` calls with `chrome.*`.

---

## Section 2: Private Browsing Ephemeral Feeds

### Goal

When the user has a private/incognito window open and adds feeds, those feeds and their articles are stored in memory only (not on disk), are invisible to normal windows, and are cleared when the last private window closes. This is a completely blank slate — no feeds from normal mode are visible, and feeds added in private mode are never written to IndexedDB.

### Detection

Both `popup/popup.js` and `newtab/newtab.js` call `chrome.windows.getCurrent()` at startup to check `window.incognito`.

In `popup.js`, detect incognito at the top of `DOMContentLoaded` before doing anything else. Since the UI is entirely event-driven (no immediate `send()` calls on load), the only constraint is that `isPrivate` is resolved before any user interaction — which `await` at the top of the callback ensures:

```js
document.addEventListener('DOMContentLoaded', async () => {
  const win = await chrome.windows.getCurrent();
  const isPrivate = win.incognito;
  // ... rest of existing popup setup ...
  // In addFeed():
  await chrome.runtime.sendMessage({ type: MSG.ADD_FEED, url, private: isPrivate });
```

In `newtab.js`, the `isPrivate` detection must happen before any call to `send()`. The existing `DOMContentLoaded` currently calls `loadFeeds()` and `loadArticles()` first, both of which call `send()`. The detection must be moved to the top, before those calls:

```js
let isPrivate = false;

document.addEventListener('DOMContentLoaded', async () => {
  const win = await chrome.windows.getCurrent();
  isPrivate = win.incognito;        // MUST be set first
  await loadFeeds();                 // these call send() — must come after
  await loadArticles();
  bindFeedControls();
  bindSortControls();
  bindKeyboardNav();
  setFocusedPanel('articles');
});
```

### Message Routing

The `send()` helper in `newtab.js` is updated to include `private: isPrivate` in every message:

```js
function send(type, payload = {}) {
  return chrome.runtime.sendMessage(Object.assign({ type, private: isPrivate }, payload));
}
```

The popup passes `private: isPrivate` directly in its `chrome.runtime.sendMessage` call (popup has no `send()` helper).

In `background.js`, the `onMessage` listener calls `handleMessage(message)`. The store selection is added at the top of `handleMessage`, and all eight handler functions receive `store` as an additional parameter:

```js
async function handleMessage(message) {
  const store = message.private ? privateStore : db;
  switch (message.type) {
    case MSG.ADD_FEED:        return handleAddFeed(message.url, store);
    case MSG.REMOVE_FEED:     return handleRemoveFeed(message.id, store);
    case MSG.FETCH_FEED:      return handleFetchFeed(message.id, store);
    case MSG.FETCH_ARTICLE:   return handleFetchArticle(message.id, store);
    case MSG.MARK_READ:       return handleMarkRead(message.id, store);
    case MSG.GET_FEEDS:       return handleGetFeeds(store);
    case MSG.GET_ARTICLES:    return handleGetArticles(message.sort, store);
    case MSG.UPDATE_FEED_TAGS: return handleUpdateFeedTags(message.id, message.tags, store);
    default: throw new Error('UNKNOWN_MESSAGE_TYPE');
  }
}
```

Each of the eight handler functions currently calls `db` directly. After the change, each receives `store` as its last parameter and uses `store` in place of `db`. For example:

```js
// Before:
async function handleAddFeed(url) {
  const existing = await db.getFeedByUrl(url);
  // ...
  const feedId = await db.addFeed({ ... });
  await db.upsertArticles(withFeedId);
}

// After:
async function handleAddFeed(url, store) {
  const existing = await store.getFeedByUrl(url);
  // ...
  const feedId = await store.addFeed({ ... });
  await store.upsertArticles(withFeedId);
}
```

All eight handlers need this treatment: `handleAddFeed`, `handleRemoveFeed`, `handleFetchFeed`, `handleFetchArticle`, `handleMarkRead`, `handleGetFeeds`, `handleGetArticles`, `handleUpdateFeedTags`. The handlers with the highest `db` call density are `handleFetchFeed` (3 calls) and `handleFetchArticle` (2 calls).

### Ephemeral Storage: `lib/private-store.js`

A new file implementing the same interface as `lib/db.js`, backed by `chrome.storage.session`. This file is used **only by the background service worker** (loaded via `importScripts()`). UI pages (`newtab.js`, `popup.js`) never call `privateStore` directly — they send messages to the background, which selects the store.

`chrome.storage.session` characteristics:
- MV3-only (Firefox 115+, Chrome 91+)
- Memory-only — not persisted to disk
- Shared across all extension contexts in the same browser session
- Cleared automatically when the browser closes

Storage keys: `private_feeds` (array of feed objects) and `private_articles` (array of article objects).

ID assignment: `Math.max(0, ...items.map(i => i.id)) + 1`. The `0` seed is intentional — it handles the empty-array case where `Math.max(...[])` would otherwise return `-Infinity`.

Exposes `var privateStore` (not `const` or `let` — must be `var` for `importScripts()` global scope compatibility, matching the `var db` pattern in `lib/db.js`) with the same nine methods as `db`: `addFeed`, `removeFeed`, `getFeeds`, `updateFeed`, `getFeedByUrl`, `upsertArticles`, `getArticles`, `getArticle`, `updateArticle`.

### Cleanup on Last Private Window Close

In `background.js`, a `chrome.windows.onRemoved` listener fires whenever any window closes. It calls `chrome.windows.getAll()` with no filter (all window types returned) and checks whether any returned window has `incognito === true`. If none do, it clears the private store:

```js
chrome.windows.onRemoved.addListener(async () => {
  const allWindows = await chrome.windows.getAll();
  const hasPrivate = allWindows.some(w => w.incognito);
  if (!hasPrivate) {
    await chrome.storage.session.set({ private_feeds: [], private_articles: [] });
  }
});
```

Do not pass `{ windowTypes: ['normal'] }` to `getAll` — the `windowTypes` filter does not reliably include or exclude incognito windows in a documented way across browsers. Passing no filter and checking `w.incognito` on each result is the correct approach.

---

## Files Changed

| File | Change |
|------|--------|
| `manifest.json` | MV3: `manifest_version: 3`, `action`, `background.service_worker`, add `"scripting"` + `"windows"` permissions; bump `strict_min_version` to `"115.0"`; retain `browser_specific_settings.gecko` |
| `lib/constants.js` | No changes — confirmed no `browser.*` calls |
| `background.js` | `importScripts()` for all helper files + `private-store.js`; `browser.*` → `chrome.*`; store selection in `handleMessage`; `store` param in all 8 handlers; `chrome.windows.onRemoved` cleanup |
| `popup/popup.js` | `chrome.windows.getCurrent()` at top of `DOMContentLoaded`; `chrome.scripting.executeScript` (func form, `results[0].result`); `private: isPrivate` in `sendMessage`; `browser.*` → `chrome.*` |
| `newtab/newtab.js` | `chrome.windows.getCurrent()` before `loadFeeds`/`loadArticles`; `isPrivate` module variable; `send()` includes `private: isPrivate`; `browser.*` → `chrome.*` |
| `lib/private-store.js` | New file: `var privateStore` (9 methods) backed by `chrome.storage.session`; background-only |

---

## No Tests

No automated tests exist for this project beyond `tests/parser.test.js` (pure parsing logic). All UI and storage behaviour is verified manually in Firefox and Chrome.
