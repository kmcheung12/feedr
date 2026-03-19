# MV3 Migration + Private Browsing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the Feedr extension to Manifest V3 (Chrome + Firefox compatible) and add ephemeral private-window feed storage using `chrome.storage.session`.

**Architecture:** Five files change and one new file is created. The `chrome.*` namespace replaces `browser.*` everywhere. A new `lib/private-store.js` implements the same interface as `lib/db.js` using `chrome.storage.session`. The background message handler selects `privateStore` vs `db` based on a `private` boolean in every incoming message. UI pages detect incognito via `chrome.windows.getCurrent()` and include `private: isPrivate` in all messages.

**Tech Stack:** WebExtension MV3 (Chrome + Firefox 115+), `chrome.*` APIs (`chrome.storage.session`, `chrome.scripting.executeScript`, `chrome.windows`), vanilla JS. No automated tests for extension UI code — verification is manual in Firefox and Chrome.

---

## Files Changed

| File | Change |
|------|--------|
| `lib/private-store.js` | **New.** `var privateStore` with 9 methods, backed by `chrome.storage.session` |
| `manifest.json` | MV3 fields: `manifest_version: 3`, `action`, `background.service_worker`, permissions, `strict_min_version: "115.0"` |
| `background.js` | `importScripts()` at top; `browser.*` → `chrome.*`; store selection + `store` param in all 8 handlers; `chrome.windows.onRemoved` cleanup |
| `popup/popup.js` | `chrome.windows.getCurrent()` for incognito; `chrome.scripting.executeScript` (func form); `private: isPrivate` in messages; `browser.*` → `chrome.*` |
| `newtab/newtab.js` | `chrome.windows.getCurrent()` before first `send()`; `isPrivate` module var; `send()` includes `private: isPrivate`; `browser.*` → `chrome.*` |

---

### Task 1: Create `lib/private-store.js`

**Files:**
- Create: `lib/private-store.js`

No automated test harness can reach `chrome.storage.session` (jsdom doesn't implement it). Verification is in Task 6.

- [ ] **Step 1: Create the file**

`lib/private-store.js` must use `var` (not `const`/`let`) so the `importScripts()` call in `background.js` attaches `privateStore` to the service worker global scope — the same pattern used by `var db` in `lib/db.js`.

`upsertArticles` deduplicates by `url`, matching `db.upsertArticles` (see `lib/db.js:108–116`). It skips any article whose `url` is already present.

`nextId` uses `Math.max(0, ...items.map(i => i.id)) + 1`. The `0` seed is required: `Math.max(...[])` returns `-Infinity` on an empty array.

```js
// lib/private-store.js
// Ephemeral feed/article store backed by chrome.storage.session.
// Implements the same interface as lib/db.js.
// Background service worker only — loaded via importScripts() in background.js.

var privateStore = (() => {
  const FEEDS_KEY    = 'private_feeds';
  const ARTICLES_KEY = 'private_articles';

  async function load(key) {
    const result = await chrome.storage.session.get(key);
    return result[key] || [];
  }

  async function save(key, items) {
    await chrome.storage.session.set({ [key]: items });
  }

  // Math.max(0, ...) guards against empty-array → -Infinity edge case.
  function nextId(items) {
    return Math.max(0, ...items.map(i => i.id)) + 1;
  }

  async function addFeed(feed) {
    const feeds = await load(FEEDS_KEY);
    const id = nextId(feeds);
    feeds.push(Object.assign({}, feed, { id }));
    await save(FEEDS_KEY, feeds);
    return id;
  }

  async function removeFeed(id) {
    const [feeds, articles] = await Promise.all([load(FEEDS_KEY), load(ARTICLES_KEY)]);
    await Promise.all([
      save(FEEDS_KEY,    feeds.filter(f => f.id !== id)),
      save(ARTICLES_KEY, articles.filter(a => a.feedId !== id)),
    ]);
  }

  async function getFeeds() {
    return load(FEEDS_KEY);
  }

  async function updateFeed(id, patch) {
    const feeds = await load(FEEDS_KEY);
    const idx = feeds.findIndex(f => f.id === id);
    if (idx === -1) throw new Error('NOT_FOUND');
    feeds[idx] = Object.assign({}, feeds[idx], patch);
    await save(FEEDS_KEY, feeds);
    return feeds[idx];
  }

  async function getFeedByUrl(url) {
    const feeds = await load(FEEDS_KEY);
    return feeds.find(f => f.url === url) || null;
  }

  async function upsertArticles(newArticles) {
    if (newArticles.length === 0) return [];
    const articles = await load(ARTICLES_KEY);
    const existingUrls = new Set(articles.map(a => a.url));
    const insertedIds = [];
    for (const article of newArticles) {
      if (!existingUrls.has(article.url)) {
        const id = nextId(articles); // articles grows each iteration — IDs stay unique
        articles.push(Object.assign({}, article, { id }));
        insertedIds.push(id);
        existingUrls.add(article.url);
      }
    }
    await save(ARTICLES_KEY, articles);
    return insertedIds;
  }

  async function getArticles() {
    return load(ARTICLES_KEY);
  }

  async function getArticle(id) {
    const articles = await load(ARTICLES_KEY);
    return articles.find(a => a.id === id) || null;
  }

  async function updateArticle(id, patch) {
    const articles = await load(ARTICLES_KEY);
    const idx = articles.findIndex(a => a.id === id);
    if (idx === -1) throw new Error('NOT_FOUND');
    articles[idx] = Object.assign({}, articles[idx], patch);
    await save(ARTICLES_KEY, articles);
    return articles[idx];
  }

  return {
    addFeed, removeFeed, getFeeds, updateFeed, getFeedByUrl,
    upsertArticles, getArticles, getArticle, updateArticle,
  };
})();
```

- [ ] **Step 2: Commit**

```bash
git add lib/private-store.js
git commit -m "feat: add private-store backed by chrome.storage.session"
```

---

### Task 2: Update `manifest.json`

**Files:**
- Modify: `manifest.json`

Current `manifest.json` (29 lines total):
```json
{
  "manifest_version": 2,
  ...
  "background": {
    "scripts": ["lib/constants.js", "lib/db.js", "lib/parser.js", "lib/Readability.js", "background.js"],
    "persistent": true
  },
  "browser_action": { ... },
  "browser_specific_settings": {
    "gecko": { "id": "feedr@local", "strict_min_version": "109.0" }
  }
}
```

- [ ] **Step 1: Apply all MV3 changes**

Replace the entire file with:

```json
{
  "manifest_version": 3,
  "name": "Feedr",
  "version": "0.1.0",
  "description": "In-browser RSS/Atom feed aggregator",
  "permissions": [
    "storage",
    "activeTab",
    "<all_urls>",
    "scripting",
    "windows"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_icon": {"48": "icons/icon-48.png"},
    "default_popup": "popup/popup.html",
    "default_title": "Feedr"
  },
  "icons": {
    "48": "icons/icon-48.png"
  },
  "browser_specific_settings": {
    "gecko": {
      "id": "feedr@local",
      "strict_min_version": "115.0"
    }
  }
}
```

Changes from MV2:
- `manifest_version`: 2 → 3
- `browser_action` → `action`
- `background.scripts + persistent` → `background.service_worker: "background.js"`
- Added `"scripting"` permission (for `chrome.scripting.executeScript` in popup)
- Added `"windows"` permission (for `chrome.windows.getCurrent()` and `chrome.windows.onRemoved`)
- `strict_min_version`: `"109.0"` → `"115.0"` (`chrome.storage.session` requires Firefox 115+)

- [ ] **Step 2: Verify the JSON is valid**

```bash
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('valid')"
```

Expected output: `valid`

- [ ] **Step 3: Commit**

```bash
git add manifest.json
git commit -m "feat: migrate manifest to MV3 with scripting and windows permissions"
```

---

### Task 3: Update `background.js`

**Files:**
- Modify: `background.js`

Four changes:
1. Add `importScripts()` at the very top (loads all helper scripts the service worker needs — in MV3, `background.scripts` in the manifest is gone)
2. `browser.runtime.onMessage` → `chrome.runtime.onMessage`
3. Store selection in `handleMessage` + `store` parameter in all 8 handlers
4. Add `chrome.windows.onRemoved` cleanup listener at the bottom

- [ ] **Step 1: Add `importScripts()` at the top**

Insert these lines as the very first lines of `background.js`, before any existing code:

```js
importScripts(
  'lib/constants.js',
  'lib/db.js',
  'lib/parser.js',
  'lib/Readability.js',
  'lib/private-store.js'
);
```

- [ ] **Step 2: Replace `browser.runtime.onMessage` with `chrome.runtime.onMessage`**

Line 6 currently reads:
```js
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
```

Change to:
```js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
```

- [ ] **Step 3: Add store selection to `handleMessage` and thread `store` to all 8 handlers**

Replace the entire `handleMessage` function (lines 14–26):

```js
// Before:
async function handleMessage(message) {
  switch (message.type) {
    case MSG.ADD_FEED:         return handleAddFeed(message.url);
    case MSG.REMOVE_FEED:      return handleRemoveFeed(message.id);
    case MSG.FETCH_FEED:       return handleFetchFeed(message.id);
    case MSG.FETCH_ARTICLE:    return handleFetchArticle(message.id);
    case MSG.MARK_READ:        return handleMarkRead(message.id);
    case MSG.GET_FEEDS:        return handleGetFeeds();
    case MSG.GET_ARTICLES:     return handleGetArticles(message.sort);
    case MSG.UPDATE_FEED_TAGS: return handleUpdateFeedTags(message.id, message.tags);
    default: throw new Error('UNKNOWN_MESSAGE_TYPE');
  }
}
```

Replace with:

```js
async function handleMessage(message) {
  const store = message.private ? privateStore : db;
  switch (message.type) {
    case MSG.ADD_FEED:         return handleAddFeed(message.url, store);
    case MSG.REMOVE_FEED:      return handleRemoveFeed(message.id, store);
    case MSG.FETCH_FEED:       return handleFetchFeed(message.id, store);
    case MSG.FETCH_ARTICLE:    return handleFetchArticle(message.id, store);
    case MSG.MARK_READ:        return handleMarkRead(message.id, store);
    case MSG.GET_FEEDS:        return handleGetFeeds(store);
    case MSG.GET_ARTICLES:     return handleGetArticles(message.sort, store);
    case MSG.UPDATE_FEED_TAGS: return handleUpdateFeedTags(message.id, message.tags, store);
    default: throw new Error('UNKNOWN_MESSAGE_TYPE');
  }
}
```

- [ ] **Step 4: Update all 8 handler functions to accept and use `store`**

For each handler, add `store` as the last parameter and replace every `db.` call with `store.`. The handlers and their `db` calls are:

**`handleAddFeed`** (lines 28–48) — 3 `db` calls:
```js
// Before:
async function handleAddFeed(url) {
  const existing = await db.getFeedByUrl(url);
  ...
  const feedId = await db.addFeed({ ... });
  await db.upsertArticles(withFeedId);
  return { ok: true, feedId };
}

// After:
async function handleAddFeed(url, store) {
  const existing = await store.getFeedByUrl(url);
  ...
  const feedId = await store.addFeed({ ... });
  await store.upsertArticles(withFeedId);
  return { ok: true, feedId };
}
```

**`handleRemoveFeed`** (lines 50–53) — 1 `db` call:
```js
async function handleRemoveFeed(id, store) {
  await store.removeFeed(id);
  return { ok: true };
}
```

**`handleFetchFeed`** (lines 55–81) — 3 `db` calls (`db.getFeeds`, `db.updateFeed` ×2, `db.upsertArticles`):
```js
async function handleFetchFeed(id, store) {
  const feeds = await store.getFeeds();
  const feed = feeds.find(f => f.id === id);
  if (!feed) throw new Error('FEED_NOT_FOUND');

  let xml;
  try {
    xml = await fetchText(feed.url);
  } catch (e) {
    await store.updateFeed(id, { fetchError: e.message });
    throw new Error('NETWORK_ERROR');
  }

  let articles;
  try {
    ({ articles } = parseFeed(xml));
  } catch (e) {
    await store.updateFeed(id, { fetchError: e.message });
    throw e;
  }

  const withFeedId = articles.map(a => Object.assign({}, a, { feedId: id }));
  await store.upsertArticles(withFeedId);
  await store.updateFeed(id, { lastFetched: Date.now(), fetchError: null });

  return { ok: true };
}
```

**`handleFetchArticle`** (lines 83–117) — 2 `db` calls (`db.getArticle`, `db.updateArticle`):
```js
async function handleFetchArticle(id, store) {
  const article = await store.getArticle(id);
  if (!article) throw new Error('ARTICLE_NOT_FOUND');

  if (article.readableContent) return { readableContent: article.readableContent };

  let html;
  try {
    html = await fetchText(article.url);
  } catch (e) {
    return { readableContent: null, error: 'NETWORK_ERROR' };
  }

  const domParser = new DOMParser();
  const doc = domParser.parseFromString(html, 'text/html');
  const base = doc.createElement('base');
  base.href = article.url;
  doc.head.prepend(base);

  let readableContent = null;
  try {
    const reader = new Readability(doc);
    const parsed = reader.parse();
    readableContent = parsed ? parsed.content : null;
  } catch (e) {
    // Extraction failed — caller falls back to summary
  }

  if (readableContent) {
    await store.updateArticle(id, { readableContent });
  }

  return { readableContent };
}
```

**`handleMarkRead`** (lines 119–122) — 1 `db` call:
```js
async function handleMarkRead(id, store) {
  await store.updateArticle(id, { readAt: Date.now() });
  return { ok: true };
}
```

**`handleGetFeeds`** (lines 124–127) — 1 `db` call:
```js
async function handleGetFeeds(store) {
  const feeds = await store.getFeeds();
  return { feeds };
}
```

**`handleGetArticles`** (lines 129–142) — 1 `db` call:
```js
async function handleGetArticles(sort = 'time', store) {
  const articles = await store.getArticles();

  if (sort === 'time') {
    articles.sort((a, b) => b.publishedAt - a.publishedAt);
  } else if (sort === 'domain') {
    articles.sort((a, b) => {
      if (a.feedId !== b.feedId) return a.feedId - b.feedId;
      return b.publishedAt - a.publishedAt;
    });
  }

  return { articles };
}
```

**`handleUpdateFeedTags`** (lines 144–147) — 1 `db` call:
```js
async function handleUpdateFeedTags(id, tags, store) {
  await store.updateFeed(id, { tags });
  return { ok: true };
}
```

- [ ] **Step 5: Add `chrome.windows.onRemoved` cleanup listener at the bottom**

After the `faviconUrl` helper (current last function), append:

```js
// Clear private store when the last incognito window closes.
chrome.windows.onRemoved.addListener(async () => {
  const allWindows = await chrome.windows.getAll();
  const hasPrivate = allWindows.some(w => w.incognito);
  if (!hasPrivate) {
    await chrome.storage.session.set({ private_feeds: [], private_articles: [] });
  }
});
```

Note: `chrome.windows.getAll()` is called with no argument so all window types are returned. Do not pass `{ windowTypes: ['normal'] }` — that filter does not reliably include/exclude incognito windows across browsers.

- [ ] **Step 6: Commit**

```bash
git add background.js
git commit -m "feat: migrate background.js to MV3 with private store routing"
```

---

### Task 4: Update `popup/popup.js`

**Files:**
- Modify: `popup/popup.js`

Four changes:
1. Add `chrome.windows.getCurrent()` at the top of `DOMContentLoaded` to detect incognito
2. Replace `browser.tabs.executeScript` with `chrome.scripting.executeScript` (func form, `results[0].result`)
3. Replace all `browser.*` calls with `chrome.*`
4. Pass `private: isPrivate` in the `sendMessage` call inside `addFeed()`

Current `popup.js` `browser.*` occurrences (all need changing):
- Line 16: `browser.tabs.query`
- Lines 17–26: `browser.tabs.executeScript` (replaced with `chrome.scripting.executeScript`)
- Line 43: `browser.runtime.sendMessage`
- Line 62: `browser.tabs.create` and `browser.runtime.getURL`

- [ ] **Step 1: Replace the entire file**

```js
// popup/popup.js
// Detects RSS/Atom <link> elements on the active tab and lets the user add the feed.

document.addEventListener('DOMContentLoaded', async () => {
  // Detect incognito before any send() calls or UI setup.
  const win = await chrome.windows.getCurrent();
  const isPrivate = win.incognito;

  const detectedSection = document.getElementById('detected');
  const detectedUrl = document.getElementById('detected-url');
  const btnAddDetected = document.getElementById('btn-add-detected');
  const manualUrl = document.getElementById('manual-url');
  const btnAddManual = document.getElementById('btn-add-manual');
  const messageEl = document.getElementById('message');
  const statusEl = document.getElementById('status');

  // Detect RSS links on the current tab
  let feedUrl = null;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
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
  } catch (e) {
    // executeScript may fail on about:, file: etc. — that's fine
  }

  if (feedUrl) {
    detectedSection.classList.remove('hidden');
    detectedUrl.textContent = feedUrl;
  } else {
    statusEl.textContent = 'No feed detected on this page.';
  }

  async function addFeed(url) {
    if (!url) return;
    messageEl.className = 'message hidden';
    try {
      const resp = await chrome.runtime.sendMessage({ type: MSG.ADD_FEED, url, private: isPrivate });
      if (resp && resp.error) {
        const text = resp.error === 'FEED_EXISTS' ? 'Already in your feeds.'
                   : resp.error === 'NOT_A_FEED'  ? 'URL is not a valid RSS/Atom feed.'
                   : 'Could not add feed: ' + resp.error;
        showMessage(text, 'error');
        return;
      }
      showMessage('Feed added!', 'success');
    } catch (e) {
      showMessage('Could not add feed: ' + e.message, 'error');
    }
  }

  btnAddDetected.addEventListener('click', () => addFeed(feedUrl));
  btnAddManual.addEventListener('click', () => addFeed(manualUrl.value.trim()));
  manualUrl.addEventListener('keydown', e => { if (e.key === 'Enter') addFeed(manualUrl.value.trim()); });

  document.getElementById('btn-open-feedr').addEventListener('click', async () => {
    await chrome.tabs.create({ url: chrome.runtime.getURL('newtab/newtab.html') });
    window.close();
  });

  function showMessage(text, type) {
    messageEl.textContent = text;
    messageEl.className = `message ${type}`;
  }
});
```

Key differences from the original:
- `chrome.windows.getCurrent()` is the first `await` — `isPrivate` is set before any messages
- `chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => {...} })` replaces `browser.tabs.executeScript`
- Return value is `results[0].result` (not `results[0]`) — MV3 returns `InjectionResult` objects
- `chrome.runtime.sendMessage` includes `private: isPrivate`
- `chrome.tabs.create` and `chrome.runtime.getURL` replace `browser.*` equivalents

- [ ] **Step 2: Commit**

```bash
git add popup/popup.js
git commit -m "feat: migrate popup.js to MV3 with incognito detection"
```

---

### Task 5: Update `newtab/newtab.js`

**Files:**
- Modify: `newtab/newtab.js`

Two changes:
1. Add `isPrivate` module-level variable and set it via `chrome.windows.getCurrent()` at the top of `DOMContentLoaded`, **before** `loadFeeds()` and `loadArticles()` (both call `send()`)
2. Update `send()` to include `private: isPrivate` and use `chrome.*`

Current `browser.*` occurrences in `newtab.js`:
- Line 3 (comment only — update it)
- Line 24: `browser.runtime.sendMessage`

- [ ] **Step 1: Add `isPrivate` module variable after the state block**

Current state block ends at line 13 (`const PANELS = ...`). After `const PANELS = ['feeds', 'articles', 'reader'];`, add:

```js
let isPrivate = false;
```

- [ ] **Step 2: Update `send()` to use `chrome.*` and include `private: isPrivate`**

Current `send()` at line 23–25:
```js
function send(type, payload = {}) {
  return browser.runtime.sendMessage(Object.assign({ type }, payload));
}
```

Replace with:
```js
function send(type, payload = {}) {
  return chrome.runtime.sendMessage(Object.assign({ type, private: isPrivate }, payload));
}
```

- [ ] **Step 3: Detect incognito before `loadFeeds()` in `DOMContentLoaded`**

Current `DOMContentLoaded` callback at lines 28–35:
```js
document.addEventListener('DOMContentLoaded', async () => {
  await loadFeeds();
  await loadArticles();
  bindFeedControls();
  bindSortControls();
  bindKeyboardNav();
  setFocusedPanel('articles');
});
```

Replace with:
```js
document.addEventListener('DOMContentLoaded', async () => {
  const win = await chrome.windows.getCurrent();
  isPrivate = win.incognito;
  await loadFeeds();
  await loadArticles();
  bindFeedControls();
  bindSortControls();
  bindKeyboardNav();
  setFocusedPanel('articles');
});
```

`isPrivate` must be set before `loadFeeds()` because `loadFeeds()` calls `send()`, which reads `isPrivate`. Moving the detection to the top of the callback ensures it is always resolved first.

- [ ] **Step 4: Update the comment at line 3**

Change:
```js
// Communicates with background.js exclusively via browser.runtime.sendMessage.
```
To:
```js
// Communicates with background.js exclusively via chrome.runtime.sendMessage.
```

- [ ] **Step 5: Commit**

```bash
git add newtab/newtab.js
git commit -m "feat: migrate newtab.js to MV3 with incognito detection"
```

---

### Task 6: Manual Verification in Firefox and Chrome

No automated tests. Load the extension and verify all behaviour.

- [ ] **Step 1: Load in Firefox**

`about:debugging` → "This Firefox" → "Load Temporary Add-on" → select `manifest.json`.

- [ ] **Step 2: Verify MV3 loads without errors**

Open the Browser Console (`Ctrl+Shift+J`). There should be no errors on extension load. The service worker should appear in `about:debugging` under "Extensions" → "Feedr" → "Inspect" (background service worker).

- [ ] **Step 3: Verify normal popup works**

Click the Feedr toolbar icon. The popup should open. Add a real RSS feed URL (e.g. `https://feeds.99percentinvisible.org/99percentinvisible`). It should be added successfully. Open the Feedr reader (click "Open Feedr ↗") — the feed should appear.

- [ ] **Step 4: Verify private mode isolation**

First, enable the extension for private windows:
- **Firefox:** `about:addons` → Feedr → "Run in Private Windows" → Allow
- **Chrome:** `chrome://extensions/` → Feedr → "Allow in Incognito"

Open a private window (`Ctrl+Shift+P`). Click the Feedr toolbar icon in the private window. Add a **different** RSS feed. Open the Feedr reader in the private window — only the private feed should appear, not the normal feed. Switch back to the normal window — the normal feed should appear, not the private feed.

- [ ] **Step 5: Verify private feeds are cleared on private window close**

With a feed added in the private window, close the private window. Open a new private window. Open the Feedr reader — it should be empty (no feeds from the previous private session).

- [ ] **Step 6: Verify feed detection in popup**

Navigate to an RSS-enabled page (e.g. `https://www.theverge.com/rss/index.xml` or any page with `<link type="application/rss+xml">`). Click the Feedr icon — the detected feed URL should appear in the popup.

- [ ] **Step 7: Load in Chrome (if available)**

Open `chrome://extensions/` → enable "Developer mode" → "Load unpacked" → select the `feedr` directory. Verify steps 2–6 pass in Chrome as well.

- [ ] **Step 8: Commit any fixes, then done**

If any fixes were needed, commit them with a descriptive message. Otherwise:

```bash
git log --oneline -6
```

Confirm all 5 feature commits are present before proceeding to merge.
