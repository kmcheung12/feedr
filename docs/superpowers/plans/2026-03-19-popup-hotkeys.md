# Popup Hotkeys Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two user-configurable global keyboard shortcuts to the popup — one to open Feedr, one to add a feed from the clipboard — each recorded in-popup and firing from any browser tab.

**Architecture:** A new content script (`content/shortcuts.js`) is injected into all pages via manifest `content_scripts`; it reads stored shortcuts from `chrome.storage.local`, listens for `keydown` in capture phase, and sends messages to the background. The popup UI gains two small "hotkey" buttons with inline recording logic. A new `MSG.OPEN_FEEDR` constant and background handler round out the wiring.

**Tech Stack:** Chrome/Firefox MV3 extension, `chrome.storage.local`, `navigator.clipboard.readText()`, plain JS content script.

---

### Task 1: Add `MSG.OPEN_FEEDR` constant and background handler

**Files:**
- Modify: `lib/constants.js:5-14`
- Modify: `background.js:21-34`

No automated tests — manual verification described below.

- [ ] **Step 1: Add the constant**

In `lib/constants.js`, add `OPEN_FEEDR` to the MSG object:

```js
var MSG = {
  ADD_FEED:          'ADD_FEED',
  REMOVE_FEED:       'REMOVE_FEED',
  FETCH_FEED:        'FETCH_FEED',
  FETCH_ARTICLE:     'FETCH_ARTICLE',
  MARK_READ:         'MARK_READ',
  GET_FEEDS:         'GET_FEEDS',
  GET_ARTICLES:      'GET_ARTICLES',
  UPDATE_FEED_TAGS:  'UPDATE_FEED_TAGS',
  OPEN_FEEDR:        'OPEN_FEEDR',
};
```

- [ ] **Step 2: Add the background handler**

In `background.js`, inside `handleMessage`, add a new case before `default`:

```js
case MSG.OPEN_FEEDR:
  await chrome.tabs.create({ url: chrome.runtime.getURL('newtab/newtab.html') });
  return { ok: true };
```

- [ ] **Step 3: Verify manually**

Load the extension in the browser. Open the browser console and run:

```js
chrome.runtime.sendMessage({ type: 'OPEN_FEEDR' }, r => console.log(r));
```

Expected: a new tab opens with the Feedr newtab page and the console logs `{ ok: true }`.

- [ ] **Step 4: Commit**

```bash
git add lib/constants.js background.js
git commit -m "feat: add MSG.OPEN_FEEDR constant and background handler"
```

---

### Task 2: Update manifest for content script and clipboard permission

**Files:**
- Modify: `manifest.json`

- [ ] **Step 1: Add `clipboardRead` permission and `content_scripts` entry**

Update `manifest.json` so the permissions array includes `"clipboardRead"` and a `content_scripts` section is added:

```json
{
  "manifest_version": 3,
  "name": "Feedr",
  "version": "0.1.0",
  "description": "In-browser RSS/Atom feed aggregator",
  "permissions": [
    "storage",
    "activeTab",
    "scripting",
    "clipboardRead"
  ],
  "host_permissions": ["<all_urls>"],
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["lib/constants.js", "content/shortcuts.js"]
  }],
  "background": {
    "service_worker": "background.js",
    "scripts": ["lib/constants.js", "lib/db.js", "lib/parser.js", "lib/Readability.js", "lib/private-store.js", "background.js"]
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

- [ ] **Step 2: Verify**

Reload the extension. No manifest errors should appear in `about:debugging` (Firefox) or `chrome://extensions` (Chrome).

- [ ] **Step 3: Commit**

```bash
git add manifest.json
git commit -m "feat: add clipboardRead permission and content_scripts for hotkeys"
```

---

### Task 3: Create the content script `content/shortcuts.js`

**Files:**
- Create: `content/shortcuts.js`

This file listens for the two stored shortcuts globally and dispatches the appropriate action.

- [ ] **Step 1: Create `content/` directory and `content/shortcuts.js`**

```js
// content/shortcuts.js
// Listens globally for user-configured keyboard shortcuts and dispatches
// OPEN_FEEDR or ADD_FEED messages to the background.

(function () {
  let shortcutOpen = null;
  let shortcutAdd  = null;

  // Load stored shortcuts on injection.
  chrome.storage.local.get(['shortcut_open', 'shortcut_add'], (result) => {
    shortcutOpen = result.shortcut_open || null;
    shortcutAdd  = result.shortcut_add  || null;
  });

  // Keep shortcuts in sync when the popup saves new values.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.shortcut_open !== undefined) shortcutOpen = changes.shortcut_open.newValue || null;
    if (changes.shortcut_add  !== undefined) shortcutAdd  = changes.shortcut_add.newValue  || null;
  });

  // Build a normalised combo string from a KeyboardEvent.
  // Format: Ctrl+Alt+Shift+Meta+Key  (only present modifiers included)
  function comboFromEvent(e) {
    const parts = [];
    if (e.ctrlKey)  parts.push('Ctrl');
    if (e.altKey)   parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    if (e.metaKey)  parts.push('Meta');
    const key = e.key;
    // Don't append the key itself if it IS a lone modifier press.
    if (!['Control', 'Alt', 'Shift', 'Meta'].includes(key)) parts.push(key);
    return parts.join('+');
  }

  document.addEventListener('keydown', async (e) => {
    const combo = comboFromEvent(e);
    if (!combo) return;

    if (shortcutOpen && combo === shortcutOpen) {
      e.preventDefault();
      chrome.runtime.sendMessage({ type: MSG.OPEN_FEEDR });
      return;
    }

    if (shortcutAdd && combo === shortcutAdd) {
      e.preventDefault();
      try {
        const url = await navigator.clipboard.readText();
        if (url && url.trim()) {
          chrome.runtime.sendMessage({ type: MSG.ADD_FEED, url: url.trim(), private: false });
        }
      } catch (err) {
        // Clipboard access denied — silently ignore.
      }
      return;
    }
  }, true); // capture phase: intercept before page handlers
})();
```

- [ ] **Step 2: Verify manually**

1. Set a shortcut in the popup (Task 4 must be done first, OR manually set via the console):
   ```js
   chrome.storage.local.set({ shortcut_open: 'Ctrl+Shift+F' });
   ```
2. On any page, press `Ctrl+Shift+F`. The Feedr newtab tab should open.
3. Copy a feed URL to the clipboard (e.g. `https://feeds.arstechnica.com/arstechnica/index`), set `shortcut_add`, then press the combo. The feed should be added (verify by opening Feedr).

- [ ] **Step 3: Commit**

```bash
git add content/shortcuts.js
git commit -m "feat: add global shortcut content script"
```

---

### Task 4: Popup HTML — add hotkey buttons

**Files:**
- Modify: `popup/popup.html`

- [ ] **Step 1: Wrap the Add row and Open Feedr button in `.btn-row` divs and add hotkey buttons**

Replace the `#manual` div's button and the standalone `#btn-open-feedr` with:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <div id="app">
    <p id="status" class="status"></p>
    <div id="detected" class="hidden">
      <p class="label">RSS feed detected:</p>
      <p id="detected-url" class="feed-url"></p>
      <button id="btn-add-detected">Add to Feedr</button>
    </div>
    <div id="manual">
      <p class="label">Or enter a feed URL:</p>
      <input id="manual-url" type="url" placeholder="https://example.com/feed.xml">
      <div class="btn-row">
        <button id="btn-add-manual">Add</button>
        <button id="btn-shortcut-add" class="btn-shortcut" title="Set keyboard shortcut for Add">⌨ —</button>
      </div>
    </div>
    <p id="message" class="message hidden"></p>
    <div class="btn-row" id="open-feedr-row">
      <button id="btn-open-feedr">Open Feedr ↗</button>
      <button id="btn-shortcut-open" class="btn-shortcut" title="Set keyboard shortcut for Open Feedr">⌨ —</button>
    </div>
  </div>
  <script src="../lib/constants.js"></script>
  <script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 2: Verify**

Open the popup. You should see:
- `[ Add ] [ ⌨ — ]` side by side
- `[ Open Feedr ↗ ] [ ⌨ — ]` side by side
(They will look unstyled until Task 5.)

- [ ] **Step 3: Commit**

```bash
git add popup/popup.html
git commit -m "feat: add hotkey buttons to popup HTML"
```

---

### Task 5: Popup CSS — style the hotkey buttons

**Files:**
- Modify: `popup/popup.css`

- [ ] **Step 1: Add `.btn-row`, `.btn-shortcut`, and `.btn-shortcut.recording` rules**

Append to `popup/popup.css`:

```css
.btn-row { display: flex; gap: 6px; margin-top: 0; }
.btn-row > button:first-child { flex: 1; }
.btn-shortcut {
  flex: 0 0 auto;
  width: auto;
  min-width: 56px;
  padding: 7px 8px;
  background: none;
  border: 1px solid #30363d;
  color: #8b949e;
  font-size: 11px;
  white-space: nowrap;
}
.btn-shortcut:hover { background: #161b22; color: #cdd9e5; border-color: #8b949e; }
.btn-shortcut.recording { border-color: #1f6feb; color: #58a6ff; }
```

The `#btn-open-feedr` CSS rules already target the button itself and can stay as-is. Add `margin-top` targeting the wrapper row (already has `id="open-feedr-row"` from Task 4):

```css
#open-feedr-row { margin-top: 10px; }
```

- [ ] **Step 2: Verify**

Open the popup. The layout should match:
```
[ Add (blue, full-width) ] [ ⌨ — (ghost, narrow) ]
[ Open Feedr ↗ (ghost)  ] [ ⌨ — (ghost, narrow) ]
```

- [ ] **Step 3: Commit**

```bash
git add popup/popup.css popup/popup.html
git commit -m "feat: style hotkey buttons in popup"
```

---

### Task 6: Popup JS — recording logic and label persistence

**Files:**
- Modify: `popup/popup.js`

This is the most logic-heavy task. Read the full current `popup/popup.js` before editing.

- [ ] **Step 1: Add shortcut loading and recording logic**

Replace the entire `popup/popup.js` with the following (all existing behaviour preserved, new hotkey code added):

```js
// popup/popup.js
// Detects RSS/Atom <link> elements on the active tab and lets the user add the feed.
// Also manages recording and display of two global keyboard shortcuts.

document.addEventListener('DOMContentLoaded', async () => {
  // Detect incognito before any send() calls or UI setup.
  const win = await chrome.windows.getCurrent();
  const isPrivate = win.incognito;

  const detectedSection = document.getElementById('detected');
  const detectedUrl     = document.getElementById('detected-url');
  const btnAddDetected  = document.getElementById('btn-add-detected');
  const manualUrl       = document.getElementById('manual-url');
  const btnAddManual    = document.getElementById('btn-add-manual');
  const messageEl       = document.getElementById('message');
  const statusEl        = document.getElementById('status');
  const btnShortcutAdd  = document.getElementById('btn-shortcut-add');
  const btnShortcutOpen = document.getElementById('btn-shortcut-open');

  // --- Shortcut display ---

  function shortcutLabel(combo) {
    return combo ? `⌨ ${combo}` : '⌨ —';
  }

  // Load stored shortcuts and update button labels.
  const stored = await chrome.storage.local.get(['shortcut_open', 'shortcut_add']);
  btnShortcutAdd.textContent  = shortcutLabel(stored.shortcut_add  || null);
  btnShortcutOpen.textContent = shortcutLabel(stored.shortcut_open || null);

  // --- Shortcut recording ---

  let cancelRecording = null; // holds cleanup fn for the active recording session

  function buildCombo(e) {
    const parts = [];
    if (e.ctrlKey)  parts.push('Ctrl');
    if (e.altKey)   parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    if (e.metaKey)  parts.push('Meta');
    const key = e.key;
    if (!['Control', 'Alt', 'Shift', 'Meta'].includes(key)) parts.push(key);
    return parts.join('+');
  }

  function startRecording(btn, storageKey) {
    // Cancel any existing recording first.
    if (cancelRecording) cancelRecording();

    const previous = btn.textContent;
    btn.textContent = 'press key…';
    btn.classList.add('recording');

    function onKeyDown(e) {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        finish(previous, null); // restore previous, no save
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        finish('⌨ —', ''); // clear shortcut
        return;
      }

      // Must include at least one modifier key.
      if (!e.ctrlKey && !e.altKey && !e.metaKey) return;

      const combo = buildCombo(e);
      finish(shortcutLabel(combo), combo);
    }

    function onFocusIn(e) {
      if (e.target !== btn) finish(previous, null);
    }

    function finish(label, saveValue) {
      cleanup();
      btn.textContent = label;
      if (saveValue !== null) {
        const obj = {};
        obj[storageKey] = saveValue || null;
        chrome.storage.local.set(obj);
      }
    }

    function cleanup() {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('focusin', onFocusIn);
      btn.classList.remove('recording');
      cancelRecording = null;
    }

    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('focusin', onFocusIn);
    cancelRecording = cleanup;
  }

  btnShortcutAdd.addEventListener('click',  () => startRecording(btnShortcutAdd,  'shortcut_add'));
  btnShortcutOpen.addEventListener('click', () => startRecording(btnShortcutOpen, 'shortcut_open'));

  // --- Feed detection ---

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

  // --- Add feed ---

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
  btnAddManual.addEventListener('click',   () => addFeed(manualUrl.value.trim()));
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

Key behaviours to note:
- `Delete`/`Backspace` saves an empty string / null → clears the shortcut.
- `finish(previous, null)` restores the old label without touching storage (used for Escape and focusin-cancel).
- `finish('⌨ —', '')` clears storage (Delete/Backspace path). `saveValue = ''` is falsy, so `obj[key] = null` is stored.
- Only combos with at least one of Ctrl/Alt/Meta are accepted (Shift alone is not enough, matching the spec).

- [ ] **Step 2: Verify manually**

1. Open the popup. Both hotkey buttons show `⌨ —`.
2. Click the Add hotkey button → shows `press key…` with blue border.
3. Press `Ctrl+A` → button shows `⌨ Ctrl+A`. Close and reopen popup → label persists.
4. Click the button again → press `Escape` → label reverts to `⌨ Ctrl+A` (no change).
5. Click the button again → press `Delete` → label becomes `⌨ —`, shortcut cleared in storage.
6. Click elsewhere while in recording mode → recording cancels, label restores.
7. Press `Shift+A` alone (no Ctrl/Alt/Meta) → not accepted, stays in recording mode.

- [ ] **Step 3: Commit**

```bash
git add popup/popup.js
git commit -m "feat: popup hotkey recording and label persistence"
```

---

### Task 7: End-to-end manual verification

No code changes. Verify the full flow works in both Chrome and Firefox.

- [ ] **Step 1: Set both shortcuts in the popup**

Open the popup. Set:
- Add shortcut: `Ctrl+Shift+A` (or any modifier combo)
- Open shortcut: `Ctrl+Shift+O`

- [ ] **Step 2: Test Open Feedr shortcut**

Navigate to any webpage (e.g. google.com). Press `Ctrl+Shift+O`. The Feedr newtab page should open in a new tab.

- [ ] **Step 3: Test Add feed shortcut**

Copy a valid RSS feed URL to the clipboard (e.g. `https://feeds.arstechnica.com/arstechnica/index`). On any webpage, press `Ctrl+Shift+A`. Open Feedr — the feed should appear in the list.

- [ ] **Step 4: Test in Firefox**

Repeat Steps 1–3 in Firefox via `about:debugging`. Confirm no manifest warnings and both shortcuts work.

- [ ] **Step 5: Final commit (if any fixups were needed)**

```bash
git add -p
git commit -m "fix: hotkey end-to-end fixups"
```
