# Feed Selection & Tag Auto-Filter Design

## Overview

Three new UX behaviours for the Feedr reader's left and middle panels, all in `newtab/newtab.js`:

1. **Feed click → filter articles to that feed.** Clicking a feed item selects it and filters the article list to show only that feed's articles. A separate small button on each feed item opens the tag editor (replacing the current click-to-open-editor behaviour). Clicking the selected feed again deselects it.

2. **Tag created → auto-selected as filter.** After successfully adding a new tag in the inline editor, the tag is immediately added to `activeTags` so articles filter by it without requiring a manual click in the tag filter bar.

3. **Stale active tag auto-removal.** If a tag in `activeTags` no longer exists on any feed (because tags were removed or the feed was deleted), it is silently removed from `activeTags` and the UI updates accordingly.

**Mutual exclusivity (B):** Feed selection and tag filtering are mutually exclusive. Selecting a feed clears `activeTags`. Activating a tag clears `selectedFeedId`. They can never both be active simultaneously.

---

## Architecture

Two new state variables, two new helpers, and targeted edits to six existing functions. No new files except one CSS rule. No new message types.

| File | Change |
|------|--------|
| `newtab/newtab.js` | New state `selectedFeedId`; new `setSelectedFeed()` and `pruneActiveTags()` helpers; update `renderFeedList()`, `renderTagFilterBar()`, `renderArticleList()`, `appendTagEditor()`, `loadFeeds()`, and the feed-remove click handler |
| `newtab/newtab.css` | Add `.feed-selected` rule |

---

## Behaviour 1: Feed Click → Filter Articles

### State

Add `let selectedFeedId = null;` to the state block, after `expandedFeedId`.

### `setSelectedFeed(id)`

New helper placed after `toggleFeedEditor`:

```js
function setSelectedFeed(id) {
  selectedFeedId = (selectedFeedId === id) ? null : id;
  if (selectedFeedId !== null) activeTags.clear();
  renderFeedList();
  renderTagFilterBar();
  renderArticleList();
}
```

- Toggles: clicking the already-selected feed sets `selectedFeedId = null`.
- Clears `activeTags` when selecting a feed (mutual exclusivity).
- Re-renders all three affected UI areas.

### `renderFeedList()` changes

Three changes to the existing function:

1. **CSS class:** after `li.dataset.feedId = feed.id;`, add:
   ```js
   if (feed.id === selectedFeedId) li.classList.add('feed-selected');
   ```

2. **Edit-tags button:** add `<button class="btn-edit-tags" title="Edit tags">&#35;</button>` to `li.innerHTML` (before `btn-refresh`). The `#` glyph signals "tags". Its click handler calls `e.stopPropagation(); toggleFeedEditor(feed.id);`

3. **Click handler:** change line 105 from `toggleFeedEditor(feed.id)` to `setSelectedFeed(feed.id)`.

### `renderArticleList()` changes

After the existing `activeTags` filter block (lines 279–284), add a second filter:

```js
if (selectedFeedId !== null) {
  visible = visible.filter(a => a.feedId === selectedFeedId);
}
```

Because they are mutually exclusive, at most one of `activeTags.size > 0` and `selectedFeedId !== null` is true at any time — but the two-filter structure keeps the code clean and handles edge cases safely.

Update the empty-state message to cover the feed-selection case:

```js
const msg = activeTags.size > 0
  ? 'No articles match the selected tags.'
  : selectedFeedId !== null
  ? 'No articles in this feed.'
  : 'No articles yet.';
```

### CSS

Add to `newtab/newtab.css` after existing feed list rules:

```css
#feed-list li.feed-selected {
  background: var(--accent-muted, rgba(31,111,235,0.15));
}
```

---

## Behaviour 2: Tag Created → Auto-Selected

### `appendTagEditor()` change

In the tag-add `keydown` handler, after the successful save block (currently lines 209–213):

```js
if (!resp.error) {
  const f = feeds.find(f => f.id === feed.id);
  if (f) f.tags = newTags;
  // Auto-select the new tag and clear feed selection (mutual exclusivity)
  activeTags.add(normalised);
  selectedFeedId = null;
  renderFeedList();
  renderTagFilterBar();
  renderArticleList();
}
```

Replace the current `renderFeedList(); renderTagFilterBar();` with the block above so the article list also updates immediately.

---

## Behaviour 3: Stale Active Tag Auto-Removal

### `pruneActiveTags()`

New helper, placed after `setSelectedFeed`:

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

### Call sites

Call `pruneActiveTags()` in three places:

1. **`loadFeeds()`** — after `renderTagFilterBar()` on the current line 46:
   ```js
   renderFeedList();
   renderTagFilterBar();
   pruneActiveTags(); // remove active tags no longer on any feed
   ```

2. **Tag-remove handler in `appendTagEditor()`** — after the existing `renderFeedList(); renderTagFilterBar();` in the tag chip remove button handler (currently lines 176–177):
   ```js
   renderFeedList();
   renderTagFilterBar();
   pruneActiveTags();
   ```

3. **Feed-remove handler in `renderFeedList()`** — after `await loadFeeds(); await loadArticles();` in the `.btn-remove` click handler (lines 101–102). `loadFeeds()` already calls `pruneActiveTags()` internally (from call site 1), so no explicit additional call is needed here.

---

## Tag Chip Click: Mutual Exclusivity

In `renderTagFilterBar()`, the existing tag chip click handler (lines 132–139) only manages `activeTags` and re-renders. With mutual exclusivity, activating a tag must also clear `selectedFeedId` and re-render the feed list (to remove the `feed-selected` CSS class):

```js
btn.addEventListener('click', () => {
  if (activeTags.has(tag)) {
    activeTags.delete(tag);
  } else {
    activeTags.add(tag);
    selectedFeedId = null; // clear feed selection
  }
  renderFeedList(); // update feed-selected CSS
  renderTagFilterBar();
  renderArticleList();
});
```

---

## No Tests

All behaviour is UI interaction in the newtab page. Verification is manual in the browser.
