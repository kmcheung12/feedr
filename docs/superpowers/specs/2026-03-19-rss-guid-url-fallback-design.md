# RSS guid URL Fallback Design

## Overview

Some RSS 2.0 feeds omit `<link>` on individual items and instead use `<guid isPermaLink="true">` (or `<guid>` with no attribute, which defaults to true per the RSS spec) to provide the article URL. Currently `article.url` is null for these items. This change adds a fallback so the URL is correctly extracted.

---

## Goal

When an RSS item has no `<link>`, use `<guid>` as the article URL if:
1. The `isPermaLink` attribute is not `"false"` (i.e. `"true"` explicitly, or the attribute is absent — the RSS 2.0 spec says the default is `true`)
2. The guid value starts with `http://` or `https://`

If neither condition is met, `article.url` remains `null`.

---

## Change

**File:** `lib/parser.js` only.

### URL resolution order for RSS items

1. `text(item, 'link')` — existing behaviour, unchanged
2. `rssItemUrl(item)` — new fallback, used only when step 1 returns null

### Code change in parseRss()

Current line 37:
```js
url: text(item, 'link'),
```

Replace with:
```js
url: text(item, 'link') || rssItemUrl(item),
```

### New helper function

Add after the existing `text()` helper (before `parseRss`):

```js
function rssItemUrl(item) {
  const guidEl = item.querySelector('guid');
  if (!guidEl) return null;
  if (guidEl.getAttribute('isPermaLink') === 'false') return null;
  const val = (guidEl.textContent || '').trim();
  return /^https?:\/\//i.test(val) ? val : null;
}
```

### Behaviour table

| `<link>` | `<guid>` | `isPermaLink` | `article.url` |
|----------|----------|---------------|---------------|
| `https://example.com/post` | absent | — | `https://example.com/post` |
| absent | `https://example.com/post` | absent (default true) | `https://example.com/post` |
| absent | `https://example.com/post` | `"true"` | `https://example.com/post` |
| absent | `https://example.com/post` | `"false"` | `null` |
| absent | `urn:uuid:abc123` | absent | `null` (no http scheme) |
| absent | absent | — | `null` |
| `https://example.com/post` | `https://example.com/other` | `"true"` | `https://example.com/post` (`<link>` wins) |

---

## Tests

New test cases in `tests/parser.test.js` (RSS 2.0 section):

1. Item with `<guid>` (no `isPermaLink` attr) and no `<link>` → uses guid as url
2. Item with `<guid isPermaLink="true">` and no `<link>` → uses guid as url
3. Item with `<guid isPermaLink="false">` and no `<link>` → url is null
4. Item with `<guid>` that is a URN (no http scheme) and no `<link>` → url is null
5. Item with both `<link>` and `<guid isPermaLink="true">` → uses link (link wins)

---

## Out of Scope

- Atom `<id>` fallback (deliberate deferral)
- Atom `<link rel="alternate">` preference fix
- Any change to how `article.url` is used after parsing
