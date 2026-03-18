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

### New message type

Add `UPDATE_FEED_TAGS` to `lib/constants.js`:

```js
UPDATE_FEED_TAGS: 'UPDATE_FEED_TAGS'
```

**Payload:** `{ id: number, tags: string[] }`
**Response:** `{}` on success, `{ error: 'FEED_NOT_FOUND' }` if feed id is missing.

Background handler calls `db.updateFeed(id, { tags })`.

---

## UI

### Tag filter bar (feed panel)

- Rendered between the "Feeds" panel header and the `#feed-list`
- Shows one chip per unique tag, derived client-side from all feeds in the `feeds` array (no additional message)
- Hidden when no feeds have any tags
- Clicking a chip toggles it active/inactive
- Active chips: `--accent` background, white text
- Inactive chips: `--surface` background, `--muted` text
- No explicit "All" button — deselecting all chips restores the full article list

### Article list filtering

When one or more tag chips are active:
- `renderArticleList()` filters `articles` to those whose `feedId` belongs to a feed that has at least one of the active tags
- Filter is OR logic: an article is shown if its feed has ANY of the active tags
- Active tag state lives in `newtab.js` as `let activeTags = new Set()`

When no chips are active: all articles are shown (existing behaviour).

### Feed list item — collapsed state

Each feed `<li>` shows its tags as small read-only pills appended after the feed title, before the unread badge and action buttons. Pills are visible at a glance without expanding.

### Feed list item — expanded state (tag editor)

Clicking a feed item toggles an expanded section below it within the same `<li>`. Only one feed can be expanded at a time (expanding another collapses the previous).

The expanded section contains:
- Current tags rendered as chips with an × button to remove
- A text input with placeholder "Add tag…"
  - Pressing **Enter** or **,** adds the trimmed, lowercased tag (duplicate tags are silently ignored)
  - The input is cleared after adding
- Every add or remove fires `UPDATE_FEED_TAGS` immediately (no explicit save button)

Clicking the feed item again (or clicking another feed item) collapses the editor.

---

## Files Changed

| File | Change |
|------|--------|
| `lib/constants.js` | Add `UPDATE_FEED_TAGS` constant |
| `background.js` | Add `handleUpdateFeedTags` message handler |
| `newtab/newtab.html` | Add `#tag-filter-bar` container between panel header and `#feed-list` |
| `newtab/newtab.css` | Styles for tag chips (filter bar + feed item pills + editor) |
| `newtab/newtab.js` | `activeTags` state, filter bar rendering, inline editor toggle, article filter logic |

---

## Behaviour Details

### Tag normalisation

Tags are trimmed and lowercased before storing. Empty strings after trim are discarded.

### Filter + sort interaction

Tag filtering and sort order (time / domain) are independent. The sort applies after filtering.

### Selected article across filter changes

If the currently-selected article's feed loses visibility due to a tag filter change, the reader panel stays showing the selected article (no forced deselection). The article list item just disappears from the visible list.

### No tags case

If no feeds have tags, the filter bar is not rendered (or rendered empty and hidden). The UI looks identical to the current state.

---

## Out of Scope

- Tag renaming (edit tag name globally across all feeds)
- Tag colours
- Filtering within the feed list itself (feed list always shows all feeds)
- Tags on the add-feed flow
- Persisting active tag selection across page reloads
