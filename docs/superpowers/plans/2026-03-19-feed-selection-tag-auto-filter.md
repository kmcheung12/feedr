# Feed Selection & Tag Auto-Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three UX improvements to the feed/article panels: clicking a feed filters articles to that feed; creating a tag auto-activates it as a filter; and active tags that no longer exist on any feed are auto-removed.

**Architecture:** All changes are surgical edits to `newtab/newtab.js` and one new CSS rule in `newtab/newtab.css`. Two new state variables and two new helpers are added; six existing functions are updated. Feed selection and tag filtering are mutually exclusive — each clears the other.

**Tech Stack:** Vanilla JS/CSS in the Firefox/Chrome extension newtab page. No automated tests — verification is manual in the browser.

---

## Files Changed

| File | Change |
|------|--------|
| `newtab/newtab.css` | Add `.feed-selected` highlight rule |
| `newtab/newtab.js` | Add `selectedFeedId` state, `setSelectedFeed()`, `pruneActiveTags()`; update `renderFeedList()`, `renderTagFilterBar()`, `renderArticleList()`, `appendTagEditor()`, `loadFeeds()` |

---

### Task 1: Add CSS rule, state variable, and two helpers

**Files:**
- Modify: `newtab/newtab.css`
- Modify: `newtab/newtab.js`

No automated tests exist for UI code. All changes in this task are foundational — subsequent tasks wire them up.

- [ ] **Step 1: Add `.feed-selected` CSS rule to `newtab/newtab.css`**

Find the existing panel/feed list rules. Append after them:

```css
#feed-list li.feed-selected {
  background: var(--accent-muted, rgba(31,111,235,0.15));
}
```

`var(--accent-muted)` uses the existing accent colour with low opacity. The fallback `rgba(31,111,235,0.15)` matches the blue used elsewhere in the palette.

- [ ] **Step 2: Add `selectedFeedId` state variable to `newtab/newtab.js`**

The state block currently ends at (line 11–14):
```js
let expandedFeedId = null;
let focusedPanel = 'articles'; // 'feeds' | 'articles' | 'reader'
const PANELS = ['feeds', 'articles', 'reader'];
let isPrivate = false;
```

Add `selectedFeedId` after `expandedFeedId`:
```js
let expandedFeedId = null;
let selectedFeedId = null;
let focusedPanel = 'articles'; // 'feeds' | 'articles' | 'reader'
const PANELS = ['feeds', 'articles', 'reader'];
let isPrivate = false;
```

- [ ] **Step 3: Add `setSelectedFeed()` helper after `toggleFeedEditor()`**

`toggleFeedEditor` is at line 145–149:
```js
function toggleFeedEditor(id) {
  expandedFeedId = (expandedFeedId === id) ? null : id;
  renderFeedList();
  renderTagFilterBar();
}
```

Insert `setSelectedFeed` immediately after it:

```js
function setSelectedFeed(id) {
  selectedFeedId = (selectedFeedId === id) ? null : id;
  if (selectedFeedId !== null) activeTags.clear();
  renderFeedList();
  renderTagFilterBar();
  renderArticleList();
}
```

Toggling: clicking the already-selected feed sets `selectedFeedId = null`. Selecting a feed clears `activeTags` (mutual exclusivity).

- [ ] **Step 4: Add `pruneActiveTags()` helper after `setSelectedFeed()`**

```js
function pruneActiveTags() {
  const existingTags = new Set(feeds.flatMap(f => f.tags || []));
  let changed = false;
  activeTags.forEach(tag => {
    if (!existingTags.has(tag)) {
      activeTags.delete(tag);
      changed = true;
    }
  });
  if (changed) {
    renderTagFilterBar();
    renderArticleList();
  }
}
```

Only re-renders if something was actually pruned. Checks every tag in `activeTags` against the union of all feed tags.

- [ ] **Step 5: Commit**

```bash
git add newtab/newtab.css newtab/newtab.js
git commit -m "feat: add selectedFeedId state, setSelectedFeed, pruneActiveTags helpers"
```

---

### Task 2: Update `renderFeedList()` — selection, edit-tags button, and remove fix

**Files:**
- Modify: `newtab/newtab.js` (the `renderFeedList` function, lines 49–113)

Four changes to `renderFeedList()`:
1. Mark the selected feed with `feed-selected` CSS class
2. Add a `btn-edit-tags` button that opens the tag editor (replaces old click-to-open-editor)
3. Change the feed item click handler from `toggleFeedEditor` to `setSelectedFeed`
4. Fix `.btn-remove` to clear `selectedFeedId` when the selected feed is deleted

- [ ] **Step 1: Add `feed-selected` class to the feed `<li>`**

After `li.dataset.feedId = feed.id;` (line 61), add:
```js
if (feed.id === selectedFeedId) li.classList.add('feed-selected');
```

- [ ] **Step 2: Add `btn-edit-tags` to `li.innerHTML`**

Current `li.innerHTML` (lines 71–78):
```js
li.innerHTML = `
  <span class="feed-title">${escHtml(feed.title || feed.url)}</span>
  ${feed.fetchError ? `<span class="feed-error-badge" title="${escHtml(feed.fetchError)}">!</span>` : ''}
  ${tagPillsHtml}
  ${unreadCount > 0 ? `<span class="unread-badge">${unreadCount}</span>` : ''}
  <button class="btn-refresh" title="${lastFetchedText ? 'Last fetched: ' + lastFetchedText : 'Refresh'}">&#8635;</button>
  <button class="btn-remove" title="Remove feed">&times;</button>
`;
```

Replace with (add `btn-edit-tags` before `btn-refresh`):
```js
li.innerHTML = `
  <span class="feed-title">${escHtml(feed.title || feed.url)}</span>
  ${feed.fetchError ? `<span class="feed-error-badge" title="${escHtml(feed.fetchError)}">!</span>` : ''}
  ${tagPillsHtml}
  ${unreadCount > 0 ? `<span class="unread-badge">${unreadCount}</span>` : ''}
  <button class="btn-edit-tags" title="Edit tags">&#35;</button>
  <button class="btn-refresh" title="${lastFetchedText ? 'Last fetched: ' + lastFetchedText : 'Refresh'}">&#8635;</button>
  <button class="btn-remove" title="Remove feed">&times;</button>
`;
```

`&#35;` renders as `#`, signalling "tags". The button uses the existing button styles.

- [ ] **Step 3: Add the `btn-edit-tags` click handler**

After the existing `li.querySelector('.btn-refresh').addEventListener(...)` block (lines 80–95), add:
```js
li.querySelector('.btn-edit-tags').addEventListener('click', (e) => {
  e.stopPropagation();
  toggleFeedEditor(feed.id);
});
```

`e.stopPropagation()` prevents the click from bubbling to the `li` and triggering `setSelectedFeed`.

- [ ] **Step 4: Change the `li` click handler from `toggleFeedEditor` to `setSelectedFeed`**

Line 105:
```js
// Before:
li.addEventListener('click', () => toggleFeedEditor(feed.id));

// After:
li.addEventListener('click', () => setSelectedFeed(feed.id));
```

- [ ] **Step 5: Fix `.btn-remove` to clear `selectedFeedId` before removing**

Current `.btn-remove` handler (lines 97–103):
```js
li.querySelector('.btn-remove').addEventListener('click', async (e) => {
  e.stopPropagation();
  if (!confirm(`Remove "${feed.title || feed.url}"?`)) return;
  await send(MSG.REMOVE_FEED, { id: feed.id });
  await loadFeeds();
  await loadArticles();
});
```

Replace with:
```js
li.querySelector('.btn-remove').addEventListener('click', async (e) => {
  e.stopPropagation();
  if (!confirm(`Remove "${feed.title || feed.url}"?`)) return;
  if (selectedFeedId === feed.id) selectedFeedId = null;
  await send(MSG.REMOVE_FEED, { id: feed.id });
  await loadFeeds();   // calls pruneActiveTags() internally after this task is done
  await loadArticles();
});
```

Without `selectedFeedId = null`, deleting the currently selected feed leaves a stale ID that causes the article list to show "No articles in this feed." with nothing highlighted.

- [ ] **Step 6: Commit**

```bash
git add newtab/newtab.js
git commit -m "feat: feed click selects and filters articles, btn-edit-tags opens tag editor"
```

---

### Task 3: Update `renderTagFilterBar()` for mutual exclusivity

**Files:**
- Modify: `newtab/newtab.js` (the `renderTagFilterBar` function, lines 115–143)

When a tag is activated (added to `activeTags`), `selectedFeedId` must be cleared and the feed list re-rendered to remove the `feed-selected` CSS highlight.

- [ ] **Step 1: Update the tag chip click handler**

Current handler (lines 132–140):
```js
btn.addEventListener('click', () => {
  if (activeTags.has(tag)) {
    activeTags.delete(tag);
  } else {
    activeTags.add(tag);
  }
  renderTagFilterBar();
  renderArticleList();
});
```

Replace with:
```js
btn.addEventListener('click', () => {
  if (activeTags.has(tag)) {
    activeTags.delete(tag);
  } else {
    activeTags.add(tag);
    selectedFeedId = null; // mutual exclusivity: activating a tag clears feed selection
  }
  renderFeedList();      // update feed-selected CSS highlight
  renderTagFilterBar();
  renderArticleList();
});
```

`selectedFeedId = null` is only in the `else` branch — deactivating a tag does not need to affect `selectedFeedId` (it's already null when tags are active). `renderFeedList()` is called in both branches to keep rendering symmetric, and the cost is negligible.

- [ ] **Step 2: Commit**

```bash
git add newtab/newtab.js
git commit -m "feat: activating a tag clears feed selection (mutual exclusivity)"
```

---

### Task 4: Update `renderArticleList()` — selectedFeedId filter and empty-state message

**Files:**
- Modify: `newtab/newtab.js` (the `renderArticleList` function, lines 270–314)

- [ ] **Step 1: Add `selectedFeedId` filter after the `activeTags` filter**

Current filter block (lines 278–284):
```js
let visible = articles;
if (activeTags.size > 0) {
  visible = articles.filter(article => {
    const feedTags = (feedsById.get(article.feedId) || {}).tags || [];
    return feedTags.some(t => activeTags.has(t));
  });
}
```

Replace with:
```js
let visible = articles;
if (activeTags.size > 0) {
  visible = articles.filter(article => {
    const feedTags = (feedsById.get(article.feedId) || {}).tags || [];
    return feedTags.some(t => activeTags.has(t));
  });
}
if (selectedFeedId !== null) {
  visible = visible.filter(a => a.feedId === selectedFeedId);
}
```

Due to mutual exclusivity, at most one of `activeTags.size > 0` and `selectedFeedId !== null` is true at any time — but the two-filter structure is safe regardless.

- [ ] **Step 2: Update the empty-state message**

Current empty-state block (lines 286–291):
```js
if (visible.length === 0) {
  const msg = activeTags.size > 0
    ? 'No articles match the selected tags.'
    : 'No articles yet.';
  list.innerHTML = `<li style="padding:14px;color:var(--muted);font-size:12px">${msg}</li>`;
  return;
}
```

Replace with:
```js
if (visible.length === 0) {
  const msg = activeTags.size > 0
    ? 'No articles match the selected tags.'
    : selectedFeedId !== null
    ? 'No articles in this feed.'
    : 'No articles yet.';
  list.innerHTML = `<li style="padding:14px;color:var(--muted);font-size:12px">${msg}</li>`;
  return;
}
```

- [ ] **Step 3: Commit**

```bash
git add newtab/newtab.js
git commit -m "feat: filter articles by selected feed, add feed-specific empty state"
```

---

### Task 5: Update `appendTagEditor()` — tag-add auto-selects, tag-remove prunes stale tags

**Files:**
- Modify: `newtab/newtab.js` (the `appendTagEditor` function, lines 151–219)

Two changes: (1) after adding a tag, auto-activate it as a filter; (2) after removing a tag, prune any now-stale active tags.

- [ ] **Step 1: Auto-activate newly added tag**

In the `keydown` handler for the add-tag input, the success block currently reads (lines 209–214):
```js
if (!resp.error) {
  const f = feeds.find(f => f.id === feed.id);
  if (f) f.tags = newTags;
  renderFeedList();
  renderTagFilterBar();
}
```

Replace with:
```js
if (!resp.error) {
  const f = feeds.find(f => f.id === feed.id);
  if (f) f.tags = newTags;
  activeTags.add(normalised);  // auto-select the new tag as a filter
  selectedFeedId = null;        // mutual exclusivity: activating a tag clears feed selection
  renderFeedList();
  renderTagFilterBar();
  renderArticleList();          // article list must update to reflect new filter
}
```

`normalised` is already computed at line 202 (`input.value.replace(/,/g, '').trim().toLowerCase()`), so it is in scope here.

- [ ] **Step 2: Prune stale active tags after tag removal**

In the tag chip `removeBtn` handler, the success block currently reads (lines 173–178):
```js
if (!resp.error) {
  const f = feeds.find(f => f.id === feed.id);
  if (f) f.tags = newTags;
  renderFeedList();
  renderTagFilterBar();
}
```

Replace with:
```js
if (!resp.error) {
  const f = feeds.find(f => f.id === feed.id);
  if (f) f.tags = newTags;
  renderFeedList();
  renderTagFilterBar();
  pruneActiveTags(); // remove tag from activeTags if no feed has it anymore
}
```

`pruneActiveTags()` compares `activeTags` against the now-updated `feeds` array, so it will correctly detect if the removed tag is no longer on any feed.

- [ ] **Step 3: Commit**

```bash
git add newtab/newtab.js
git commit -m "feat: auto-activate new tag as filter; prune stale active tags on removal"
```

---

### Task 6: Update `loadFeeds()` — call `pruneActiveTags()` after render

**Files:**
- Modify: `newtab/newtab.js` (the `loadFeeds` function, lines 41–47)

`loadFeeds()` is called on boot, after refresh, and after feed removal. Adding `pruneActiveTags()` here catches any stale active tags that may have accumulated (e.g. a tag was removed from a feed in another window or session).

- [ ] **Step 1: Add `pruneActiveTags()` call**

Current `loadFeeds()` (lines 41–47):
```js
async function loadFeeds() {
  const resp = await send(MSG.GET_FEEDS);
  if (resp.error) return;
  feeds = resp.feeds;
  renderFeedList();
  renderTagFilterBar();
}
```

Replace with:
```js
async function loadFeeds() {
  const resp = await send(MSG.GET_FEEDS);
  if (resp.error) return;
  feeds = resp.feeds;
  renderFeedList();
  renderTagFilterBar();
  pruneActiveTags();
}
```

`pruneActiveTags()` must be called after `renderTagFilterBar()` because it may call `renderTagFilterBar()` again if pruning occurs — calling it before would cause a double render with stale data.

- [ ] **Step 2: Commit**

```bash
git add newtab/newtab.js
git commit -m "feat: prune stale active tags after feed list loads"
```

---

### Task 7: Manual Verification in Firefox

Load the extension and verify all three behaviours.

- [ ] **Step 1: Load the extension**

`about:debugging` → "This Firefox" → "Load Temporary Add-on" → select `manifest.json`. Open a new tab and navigate to the Feedr reader (click "Open Feedr ↗" in the popup, or open `newtab/newtab.html` directly from `about:debugging`).

- [ ] **Step 2: Add at least two feeds with overlapping tags**

Use the popup or the add-feed form in the reader. Add two feeds. Give one feed the tag `tech`. Verify that adding `tech` immediately shows only articles from feeds tagged `tech` (Behaviour 2: tag auto-select).

- [ ] **Step 3: Verify feed click selects and filters**

Click a feed in the feed list. The feed should highlight with the accent-coloured background. The article list should show only articles from that feed. The tag filter bar should have no active tags.

- [ ] **Step 4: Verify feed deselection**

Click the highlighted feed again. The highlight should disappear and the article list should show all articles.

- [ ] **Step 5: Verify mutual exclusivity — feed → tag**

Select a feed (articles filtered to that feed). Click a tag in the tag filter bar. The feed selection should clear (no highlighted feed). Articles should now filter by the tag instead.

- [ ] **Step 6: Verify mutual exclusivity — tag → feed**

Activate a tag filter. Click a feed. The tag filter should clear (no active tag chips). Articles should filter by the feed.

- [ ] **Step 7: Verify `btn-edit-tags` still opens the tag editor**

Click the `#` button on a feed item (not the feed item itself). The inline tag editor should open for that feed. The feed item click (outside the `#` button) should not open the editor anymore.

- [ ] **Step 8: Verify stale tag auto-removal**

Activate a tag filter (e.g. `tech`). Remove the `tech` tag from all feeds via the tag editor. The `tech` chip in the filter bar should disappear automatically, and the article list should revert to showing all articles (Behaviour 3).

- [ ] **Step 9: Verify selected feed cleared on removal**

Select a feed in the list. Delete that feed via the `×` button. The feed selection should clear; the article list should show all remaining articles (not the stale "No articles in this feed." message).

- [ ] **Step 10: Commit any fixes, then done**

If any fixes were needed during verification, commit them with a descriptive message. Otherwise confirm all 6 feature commits are present with `git log --oneline -8`.
