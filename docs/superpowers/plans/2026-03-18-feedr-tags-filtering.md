# Feedr Tags & Filtering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-feed tagging and a tag filter bar that limits the article inbox to feeds with the selected tags.

**Architecture:** Tags are stored as `string[]` on each feed record in IndexedDB. A new `UPDATE_FEED_TAGS` background message persists tag changes. The newtab UI adds a filter chip bar above the feed list and an inline tag editor that expands when a feed item is clicked.

**Tech Stack:** Firefox MV2 extension (no bundler, no ES modules), IndexedDB via `lib/db.js`, plain JS + DOM APIs in `newtab/newtab.js`.

---

## File Map

| File | What changes |
|------|-------------|
| `lib/constants.js` | Add `UPDATE_FEED_TAGS` to the `MSG` object |
| `background.js` | Add `handleUpdateFeedTags` handler wired into `handleMessage` switch |
| `newtab/newtab.html` | Add `<div id="tag-filter-bar"></div>` between `#add-feed-form` and `#feed-list` |
| `newtab/newtab.css` | Styles for `#tag-filter-bar`, `.tag-filter-chip`, `.tag-pill`, `.tag-editor`, `.tag-chip`, `.tag-remove`, `.tag-add-input` |
| `newtab/newtab.js` | New state (`activeTags`, `expandedFeedId`), new functions (`renderTagFilterBar`, `toggleFeedEditor`, `appendTagEditor`), updated `renderFeedList` and `renderArticleList` |

---

## Task 1: Add UPDATE_FEED_TAGS message constant and background handler

**Files:**
- Modify: `lib/constants.js`
- Modify: `background.js`

- [ ] **Step 1: Add the constant to lib/constants.js**

Open `lib/constants.js`. The file currently ends with `GET_ARTICLES: 'GET_ARTICLES',`. Add one line:

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
};
```

- [ ] **Step 2: Wire the handler into the switch in background.js**

In `background.js`, find the `handleMessage` switch (lines 15–25). Add one case before `default`:

```js
case MSG.UPDATE_FEED_TAGS: return handleUpdateFeedTags(message.id, message.tags);
```

- [ ] **Step 3: Add the handler function at the bottom of background.js (before the helpers section)**

```js
async function handleUpdateFeedTags(id, tags) {
  await db.updateFeed(id, { tags });
  return { ok: true };
}
```

`db.updateFeed` rejects with `new Error('NOT_FOUND')` if the feed is missing — the top-level catch in `browser.runtime.onMessage` returns `{ error: 'NOT_FOUND' }` automatically.

- [ ] **Step 4: Verify manually**

Load the extension at `about:debugging` → This Firefox → Load Temporary Add-on → select `manifest.json`. Open the browser console (background page). Run:

```js
browser.runtime.sendMessage({ type: 'UPDATE_FEED_TAGS', id: 99999, tags: ['test'] })
  .then(r => console.log(r));
// Expected: { error: 'NOT_FOUND' }
```

- [ ] **Step 5: Commit**

```bash
git add lib/constants.js background.js
git commit -m "feat: add UPDATE_FEED_TAGS message constant and background handler"
```

---

## Task 2: Add HTML element and CSS styles

**Files:**
- Modify: `newtab/newtab.html`
- Modify: `newtab/newtab.css`

- [ ] **Step 1: Add #tag-filter-bar to newtab.html**

In `newtab/newtab.html`, find the `<aside id="panel-feeds">` block. It currently reads:

```html
      <ul id="feed-list"></ul>
    </aside>
```

Insert the new div immediately before `<ul id="feed-list">`:

```html
      <div id="tag-filter-bar" class="hidden"></div>
      <ul id="feed-list"></ul>
    </aside>
```

- [ ] **Step 2: Add CSS to newtab/newtab.css**

Append at the end of `newtab/newtab.css` (before the `/* ── Utilities ──*/` section, or at the very end after `.hidden`):

```css
/* ── Tag filter bar ── */
#tag-filter-bar {
  padding: 6px 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}

.tag-filter-chip {
  background: none;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--muted);
  cursor: pointer;
  font-size: 11px;
  padding: 2px 8px;
  line-height: 1.4;
}
.tag-filter-chip:hover { color: var(--text); border-color: var(--muted); }
.tag-filter-chip.active { background: var(--accent); border-color: var(--accent); color: #fff; }

/* ── Feed item tag pills (collapsed) ── */
.tag-pill {
  font-size: 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--muted);
  padding: 1px 6px;
  flex-shrink: 0;
}

/* ── Inline tag editor ── */
.tag-editor {
  width: 100%;
  padding: 6px 0 2px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  cursor: default;
}

.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 999px;
  font-size: 11px;
  padding: 1px 4px 1px 7px;
  color: var(--text);
}

.tag-remove {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--muted);
  font-size: 13px;
  padding: 0 1px;
  line-height: 1;
  flex-shrink: 0;
}
.tag-remove:hover { color: var(--danger); }

.tag-add-input {
  flex: 1;
  min-width: 80px;
  padding: 2px 6px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text);
  font-size: 11px;
}
.tag-add-input:focus { outline: none; border-color: var(--accent); }
.tag-add-input:disabled { opacity: 0.5; cursor: not-allowed; }
```

- [ ] **Step 3: Verify visually**

Reload the extension and open the new tab page. The page should look identical to before (tag-filter-bar is hidden). Open browser DevTools, select `#tag-filter-bar` and remove the `hidden` class — confirm the bar area appears between the panel header and the feed list.

- [ ] **Step 4: Commit**

```bash
git add newtab/newtab.html newtab/newtab.css
git commit -m "feat: add tag filter bar HTML element and CSS styles"
```

---

## Task 3: State variables and renderTagFilterBar()

**Files:**
- Modify: `newtab/newtab.js`

This task adds the two new state variables and the `renderTagFilterBar()` function, and wires it alongside every existing `renderFeedList()` call.

- [ ] **Step 1: Add state variables**

In `newtab/newtab.js`, find the `// ── State ──` block at the top (lines 5–9):

```js
let feeds = [];
let articles = [];
let selectedArticleId = null;
let currentSort = 'time';
```

Add two new variables:

```js
let feeds = [];
let articles = [];
let selectedArticleId = null;
let currentSort = 'time';
let activeTags = new Set();
let expandedFeedId = null;
```

- [ ] **Step 2: Add renderTagFilterBar() function**

Add this function after `renderFeedList()` (around line 88, after the closing `}` of `renderFeedList`):

```js
function renderTagFilterBar() {
  const bar = document.getElementById('tag-filter-bar');
  const allTags = [...new Set(feeds.flatMap(f => f.tags || []))].sort();

  if (allTags.length === 0) {
    bar.classList.add('hidden');
    bar.innerHTML = '';
    return;
  }

  bar.classList.remove('hidden');
  bar.innerHTML = '';

  allTags.forEach(tag => {
    const btn = document.createElement('button');
    btn.className = 'tag-filter-chip' + (activeTags.has(tag) ? ' active' : '');
    btn.textContent = tag;
    btn.addEventListener('click', () => {
      if (activeTags.has(tag)) {
        activeTags.delete(tag);
      } else {
        activeTags.add(tag);
      }
      renderTagFilterBar();
      renderArticleList();
    });
    bar.appendChild(btn);
  });
}
```

- [ ] **Step 3: Wire renderTagFilterBar() alongside every renderFeedList() call**

There are four call sites. Update each one:

**a) `loadFeeds()` (around line 28):**

```js
async function loadFeeds() {
  const resp = await send(MSG.GET_FEEDS);
  if (resp.error) return;
  feeds = resp.feeds;
  renderFeedList();
  renderTagFilterBar();
}
```

**b) `loadArticles()` (around line 129):**

```js
async function loadArticles() {
  const resp = await send(MSG.GET_ARTICLES, { sort: currentSort });
  if (resp.error) return;
  articles = resp.articles;
  renderArticleList();
  renderFeedList(); // refresh unread counts
  renderTagFilterBar();
}
```

**c) `selectArticle()` — the mark-read path (around line 197):**

Find this block inside `selectArticle`:
```js
    renderFeedList(); // update unread badge
```
Change it to:
```js
    renderFeedList(); // update unread badge
    renderTagFilterBar();
```

**d) The after-UPDATE_FEED_TAGS path** — this is not implemented yet (coming in Task 5), but note it here for reference.

- [ ] **Step 4: Verify manually**

Reload the extension. Open the new tab page. If no feeds have tags yet, the filter bar remains hidden — correct. Add a feed, then open the browser console on the new tab page and run:

```js
// Manually patch a feed's tags in memory to test bar rendering
feeds[0].tags = ['tech'];
renderTagFilterBar();
```

Expected: a "tech" chip appears above the feed list.

- [ ] **Step 5: Commit**

```bash
git add newtab/newtab.js
git commit -m "feat: add activeTags state and renderTagFilterBar"
```

---

## Task 4: Update renderArticleList() with tag filtering

**Files:**
- Modify: `newtab/newtab.js`

- [ ] **Step 1: Replace the existing renderArticleList() function**

Find `function renderArticleList()` (around line 137). Replace the entire function:

```js
function renderArticleList() {
  const list = document.getElementById('article-list');
  list.innerHTML = '';

  // `articles` is already sorted (by time or domain) — it arrives pre-sorted from
  // the background via MSG.GET_ARTICLES. Filtering a sorted array preserves sort order.
  let visible = articles;
  if (activeTags.size > 0) {
    visible = articles.filter(article => {
      const feed = feeds.find(f => f.id === article.feedId);
      const feedTags = feed ? (feed.tags || []) : [];
      return feedTags.some(t => activeTags.has(t));
    });
  }

  if (visible.length === 0) {
    const msg = activeTags.size > 0
      ? 'No articles match the selected tags.'
      : 'No articles yet.';
    list.innerHTML = `<li style="padding:14px;color:var(--muted);font-size:12px">${msg}</li>`;
    return;
  }

  visible.forEach(article => {
    const li = document.createElement('li');
    li.dataset.articleId = article.id;
    if (article.readAt) li.classList.add('read');
    if (article.id === selectedArticleId) li.classList.add('active');

    const feed = feeds.find(f => f.id === article.feedId);
    const source = feed ? (feed.title || feed.url) : '';
    const date = article.publishedAt
      ? new Date(article.publishedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      : '';

    li.innerHTML = `
      <div class="article-title">${escHtml(article.title || '(no title)')}</div>
      <div class="article-meta">${escHtml(source)}${source && date ? ' · ' : ''}${date}</div>
    `;

    li.addEventListener('click', () => selectArticle(article.id));
    list.appendChild(li);
  });
}
```

- [ ] **Step 2: Verify manually**

Reload the extension. Add at least two feeds with articles. Open the console on the new tab page and run:

```js
// Simulate activating a tag filter with no matches
activeTags.add('nonexistent');
renderArticleList();
// Expected: "No articles match the selected tags." message

activeTags.clear();
renderArticleList();
// Expected: normal article list restored
```

- [ ] **Step 3: Commit**

```bash
git add newtab/newtab.js
git commit -m "feat: filter article list by active tags with OR logic"
```

---

## Task 5: Inline tag editor (collapsed pills + expanded editor)

**Files:**
- Modify: `newtab/newtab.js`

This task updates `renderFeedList()` to show collapsed tag pills and a click handler, and adds `toggleFeedEditor()` and `appendTagEditor()`.

- [ ] **Step 1: Add toggleFeedEditor() function**

Add this function after `renderTagFilterBar()`:

```js
function toggleFeedEditor(id) {
  expandedFeedId = (expandedFeedId === id) ? null : id;
  renderFeedList();
  renderTagFilterBar();
}
```

- [ ] **Step 2: Add appendTagEditor() function**

Add this function after `toggleFeedEditor()`:

```js
function appendTagEditor(li, feed) {
  const tags = feed.tags || [];
  const editor = document.createElement('div');
  editor.className = 'tag-editor';

  // Existing tags as removable chips
  tags.forEach(tag => {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';

    const label = document.createElement('span');
    label.textContent = tag;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'tag-remove';
    removeBtn.textContent = '×';
    removeBtn.title = 'Remove tag';
    removeBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const newTags = (feed.tags || []).filter(t => t !== tag);
      const resp = await send(MSG.UPDATE_FEED_TAGS, { id: feed.id, tags: newTags });
      if (!resp.error) {
        const f = feeds.find(f => f.id === feed.id);
        if (f) f.tags = newTags;
        renderFeedList();
        renderTagFilterBar();
      }
    });

    chip.appendChild(label);
    chip.appendChild(removeBtn);
    editor.appendChild(chip);
  });

  // Add-tag input
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'tag-add-input';
  input.placeholder = 'Add tag…';
  input.maxLength = 40;
  if (tags.length >= 20) {
    input.disabled = true;
    input.title = 'Max 20 tags';
  }

  input.addEventListener('click', e => e.stopPropagation());

  input.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter' && e.key !== ',') return;
    e.preventDefault();
    const normalised = input.value.replace(/,/g, '').trim().toLowerCase();
    input.value = '';
    if (!normalised) return;
    const currentTags = feed.tags || [];
    if (currentTags.includes(normalised) || currentTags.length >= 20) return;
    const newTags = [...currentTags, normalised];
    const resp = await send(MSG.UPDATE_FEED_TAGS, { id: feed.id, tags: newTags });
    if (!resp.error) {
      const f = feeds.find(f => f.id === feed.id);
      if (f) f.tags = newTags;
      renderFeedList();
      renderTagFilterBar();
    }
  });

  editor.appendChild(input);
  li.appendChild(editor);
}
```

- [ ] **Step 3: Update renderFeedList() to add tag pills and the click handler**

Find the section in `renderFeedList()` where `li.innerHTML` is set. The current template is:

```js
    li.innerHTML = `
      <span class="feed-title">${escHtml(feed.title || feed.url)}</span>
      ${feed.fetchError ? `<span class="feed-error-badge" title="${escHtml(feed.fetchError)}">!</span>` : ''}
      ${unreadCount > 0 ? `<span class="unread-badge">${unreadCount}</span>` : ''}
      <button class="btn-refresh" title="${lastFetchedText ? 'Last fetched: ' + lastFetchedText : 'Refresh'}">&#8635;</button>
      <button class="btn-remove" title="Remove feed">&times;</button>
    `;
```

Replace with (tag pills added after the feed title, before unread badge):

```js
    const tagPillsHtml = (feed.tags || []).map(t => `<span class="tag-pill">${escHtml(t)}</span>`).join('');

    li.innerHTML = `
      <span class="feed-title">${escHtml(feed.title || feed.url)}</span>
      ${feed.fetchError ? `<span class="feed-error-badge" title="${escHtml(feed.fetchError)}">!</span>` : ''}
      ${tagPillsHtml}
      ${unreadCount > 0 ? `<span class="unread-badge">${unreadCount}</span>` : ''}
      <button class="btn-refresh" title="${lastFetchedText ? 'Last fetched: ' + lastFetchedText : 'Refresh'}">&#8635;</button>
      <button class="btn-remove" title="Remove feed">&times;</button>
    `;
```

- [ ] **Step 4: Wire the click handler and appendTagEditor in renderFeedList()**

After the existing `li.querySelector('.btn-remove').addEventListener(...)` block (around line 83), add:

```js
    li.addEventListener('click', () => toggleFeedEditor(feed.id));

    if (feed.id === expandedFeedId) {
      appendTagEditor(li, feed);
    }
```

The full end of the `feeds.forEach` callback (after both button listeners) should look like:

```js
    li.querySelector('.btn-refresh').addEventListener('click', async (e) => {
      e.stopPropagation();
      // ... existing refresh logic (unchanged)
    });

    li.querySelector('.btn-remove').addEventListener('click', async (e) => {
      e.stopPropagation();
      // ... existing remove logic (unchanged)
    });

    li.addEventListener('click', () => toggleFeedEditor(feed.id));

    if (feed.id === expandedFeedId) {
      appendTagEditor(li, feed);
    }

    list.appendChild(li);
```

- [ ] **Step 5: Verify end-to-end manually**

Reload the extension and open the new tab page with at least one feed added.

**Verify collapsed state:**
- Feed items show no tag pills (fresh feeds have no tags) — correct.

**Verify expand/collapse:**
- Click a feed item → editor expands below it (shows empty input).
- Click the same feed item again → editor collapses.
- Click a second feed item while the first is open → first collapses, second opens.
- Click the refresh or remove buttons → editor does NOT toggle (stopPropagation works).

**Verify adding a tag:**
- Expand a feed. Type "tech" in the input, press Enter.
- Expected: "tech" chip appears in the editor; "tech" pill appears in the collapsed feed title area; "tech" chip appears in the filter bar above the feed list.

**Verify tag filtering:**
- Click "tech" chip in the filter bar → article list narrows to articles from feeds tagged "tech".
- Click chip again → article list restores.

**Verify removing a tag:**
- Expand a feed with a tag. Click × on the "tech" chip.
- Expected: chip disappears from editor; pill disappears from feed item; filter bar chip disappears if no other feeds carry that tag.

**Verify comma delimiter:**
- Type "foo,bar" in the tag input, press Enter.
- Expected: single tag "foobar" added (commas stripped, not split).

**Verify escaping:**
- Open browser console. Manually set `feeds[0].tags = ['<script>alert(1)</script>']` then call `renderFeedList()`.
- Expected: tag is rendered as escaped text, no alert fires.

- [ ] **Step 6: Commit**

```bash
git add newtab/newtab.js
git commit -m "feat: add inline tag editor and tag filter chips to feed list"
```

---

## Done

After Task 5 is complete and verified, the tags and filtering feature is fully implemented. All five tasks are independent enough to be reviewed individually but must be completed in order (each builds on the previous).
