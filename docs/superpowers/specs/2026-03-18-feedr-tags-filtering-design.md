# Feedr Tags & Filtering Design

## Overview

Allow users to tag their feeds (sites) and filter the article inbox by tag. Tags are managed inline in the feed list and filtering applies to the article list.

---

## Goals

- Users can assign one or more tags to any feed
- Selecting a tag filters the article list to show only articles from feeds with that tag
- Multiple tags can be selected simultaneously (OR logic — any match shows)
- Tag management is inline — no separate settings screen
- Zero-infrastructure: tags stored in IndexedDB alongside feed records

---

## Data Model

### Feed record change

Add a `tags` field to each feed record in IndexedDB:

```
tags: string[]   // default [] for new feeds; treated as [] if undefined on existing records
```

No schema migration is required — IndexedDB does not enforce a schema, and existing records without `tags` are treated as `[]` by the UI.

### Constraints

- Maximum 20 tags per feed (enforced in UI; background trusts the UI and stores as-is)
- Maximum 40 characters per tag (enforced via `maxlength` on the input)

### New message type

Add `UPDATE_FEED_TAGS` to `lib/constants.js`:

```js
UPDATE_FEED_TAGS: 'UPDATE_FEED_TAGS'
```

**Payload:** `{ id: number, tags: string[] }`

**Response:** `{ ok: true }` on success (consistent with all existing handlers). On error, the background catch path returns `{ error: err.message }`. `db.updateFeed` rejects with `new Error('NOT_FOUND')` if the feed id is missing, so the caller receives `{ error: 'NOT_FOUND' }`.

Background handler calls `db.updateFeed(id, { tags })` and returns `{ ok: true }`. The handler does not re-normalise tags — it stores what the UI sends.

No manifest change is required — `lib/constants.js` is already in the background scripts list and `newtab/newtab.js` already runs in the newtab page.

---

## Tag Normalisation

Tags are normalised before being added to the `tags` array:

1. Strip all commas from the raw input string (`,` is the add-trigger character, not a multi-tag separator — `foo,bar` entered together produces the single tag `foobar`, not two tags)
2. Trim whitespace
3. Lowercase
4. Discard if empty after the above steps

Duplicate tags (after normalisation) are silently ignored.

---

## State

New state variables in `newtab.js` (alongside the existing `feeds`, `articles`, `selectedArticleId`, `currentSort`):

```js
let activeTags = new Set();   // tags currently selected in the filter bar
let expandedFeedId = null;    // id of the feed whose tag editor is currently open, or null
```

---

## UI

### Tag filter bar (feed panel)

The `<aside id="panel-feeds">` DOM order after this change:

```html
<div class="panel-header">…</div>
<div id="add-feed-form" class="hidden">…</div>
<div id="tag-filter-bar"></div>   <!-- new -->
<ul id="feed-list"></ul>
```

`#tag-filter-bar` is hidden (`.hidden` class, already defined in the stylesheet) when no feeds have any tags.

Render one `<button>` chip per unique tag, sorted alphabetically, derived by iterating `feeds`, flattening `feed.tags ?? []`, and deduplicating. No extra message needed.

- Active chips: `--accent` background, white text
- Inactive chips: `--surface` background, `--muted` text
- Clicking a chip toggles it in `activeTags` then calls `renderArticleList()`
- No explicit "All" button — deselecting all chips restores the full article list

`renderTagFilterBar()` is always called alongside `renderFeedList()`. Every call site must invoke both:

| Call site | Action |
|-----------|--------|
| `loadFeeds()` | calls `renderFeedList()` then `renderTagFilterBar()` |
| `loadArticles()` (calls `renderFeedList()` to refresh unread counts) | must also call `renderTagFilterBar()` after |
| `selectArticle()` (calls `renderFeedList()` to refresh unread badge after mark-read) | must also call `renderTagFilterBar()` after |
| After `UPDATE_FEED_TAGS` success (in-place patch path) | calls `renderFeedList()` then `renderTagFilterBar()` |

### Article list filtering

`renderArticleList()` logic (order matters):

1. Build a filtered list: if `activeTags` is non-empty, keep only articles where `feeds.find(f => f.id === article.feedId)?.tags ?? []` contains at least one tag from `activeTags`. If `activeTags` is empty, use all articles.
2. If filtered list is empty and `activeTags` is non-empty → render: `"No articles match the selected tags."`
3. If filtered list is empty and `activeTags` is empty → render: `"No articles yet."`
4. Otherwise render the filtered list.

Sort (time / domain) is applied to the filtered list. Filtering and sorting are independent.

### Feed removal and `activeTags`

When a feed is removed, `loadFeeds()` and `loadArticles()` are called (existing behaviour). `renderTagFilterBar()` redraws from the updated `feeds` array, so any tag no longer carried by any feed will not appear as a chip. Stale entries in `activeTags` match nothing and produce correct (empty) filter results. If all remaining feeds lack the stale tag, the "No articles match the selected tags" empty state appears — this is acceptable because no chip is highlighted in the filter bar, making the empty state legible. No explicit cleanup of `activeTags` on feed removal is required.

### Feed list item — collapsed state

Each feed `<li>` is built via `innerHTML` (existing pattern). Tag pills are rendered as `<span class="tag-pill">` elements inside that template. Tag text must be passed through `escHtml()` before interpolation.

Clicking anywhere on the `<li>` body opens the tag editor for that feed. The `<li>` has a single click handler that calls `toggleFeedEditor(feed.id)`. The refresh and remove buttons call `e.stopPropagation()` (existing). Collapsed-state tag pills do **not** call `stopPropagation()` — clicks on them bubble to the `<li>` handler, which opens the editor. Clicking a collapsed-state tag pill does **not** activate the tag filter; to filter, the user uses the `#tag-filter-bar` chips.

### Feed list item — expanded state (tag editor)

`expandedFeedId` tracks which feed's editor is open. When `toggleFeedEditor(id)` is called:

- If `expandedFeedId === id` → set `expandedFeedId = null` (collapse)
- Otherwise → set `expandedFeedId = id` (collapse previous, open new)

Then call `renderFeedList()` (which rebuilds the DOM and re-creates the editor for `expandedFeedId`).

Since `renderFeedList()` sets `list.innerHTML = ''` and rebuilds all `<li>` elements, the tag editor DOM is always created fresh during render. `renderFeedList()` checks `expandedFeedId` for each feed and, if it matches, appends the editor:

```
if (feed.id === expandedFeedId) {
  appendTagEditor(li, feed);
}
```

`appendTagEditor(li, feed)` creates the editor imperatively (not via `innerHTML`) so event listeners are attached directly:

- Current tags as `<span class="tag-chip">` + `<button class="tag-remove">×</button>`. Clicking × removes the tag, fires `UPDATE_FEED_TAGS`, on success patches `feed.tags` in the `feeds` array entry (find by id), then calls `renderFeedList()` and `renderTagFilterBar()`.
- `<input type="text" placeholder="Add tag…" maxlength="40">`. If `feed.tags.length >= 20` the input is disabled with `title="Max 20 tags"`. Pressing **Enter** or **,** normalises the input value and, if non-empty and not duplicate, adds it, fires `UPDATE_FEED_TAGS`, on success patches `feed.tags`, then calls `renderFeedList()` and `renderTagFilterBar()`.

**Error handling for `UPDATE_FEED_TAGS`:** If the response contains `{ error }`, the add/remove operation is not applied to the in-memory `feeds` entry. No error UI is required — the tag simply does not appear/disappear. (Feed removal mid-session is the only realistic error case.)

---

## Files Changed

| File | Change |
|------|--------|
| `lib/constants.js` | Add `UPDATE_FEED_TAGS` constant |
| `background.js` | Add `handleUpdateFeedTags` message handler |
| `newtab/newtab.html` | Add `<div id="tag-filter-bar"></div>` between `#add-feed-form` and `#feed-list` inside `#panel-feeds` |
| `newtab/newtab.css` | Styles for `.tag-pill`, tag chips in `#tag-filter-bar`, `.tag-editor`, `.tag-chip`, `.tag-remove` |
| `newtab/newtab.js` | `activeTags` + `expandedFeedId` state; `renderTagFilterBar()`; `toggleFeedEditor()`; `appendTagEditor()`; article filter + empty-state logic; updated `renderFeedList()` call sites |
| `manifest.json` | No change needed |

---

## Behaviour Details

### Filter + sort interaction

Tag filtering and sort order (time / domain) are independent. The sort applies after filtering.

### Selected article across filter changes

If the currently-selected article's feed loses visibility due to a tag filter change, the reader panel stays showing the selected article (no forced deselection). The article list item just disappears from the visible list.

### No tags case

If no feeds have tags, `#tag-filter-bar` has the `.hidden` class. The UI looks identical to the current state.

---

## Out of Scope

- Tag renaming (edit tag name globally across all feeds)
- Tag colours
- Filtering within the feed list itself (feed list always shows all feeds)
- Tags on the add-feed flow
- Persisting active tag selection across page reloads
