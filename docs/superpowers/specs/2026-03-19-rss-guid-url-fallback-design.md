# RSS guid URL Fallback Design

## Overview

Some RSS 2.0 feeds omit `<link>` on individual items and instead use `<guid isPermaLink="true">` (or `<guid>` with no attribute, which defaults to true per the RSS spec) to provide the article URL. Currently `article.url` is null for these items. This change adds a fallback so the URL is correctly extracted.

---

## Goal

When an RSS item has no `<link>`, use `<guid>` as the article URL if both conditions are met:
1. The `isPermaLink` attribute is not `"false"` (i.e. `"true"` explicitly, or the attribute is absent — the RSS 2.0 spec says the default is `true`)
2. The guid value starts with `http://` or `https://` (lowercase — uppercase schemes are not matched and are treated as null)

If either condition fails, `article.url` remains `null`.

---

## Change

**File:** `lib/parser.js` only.

### URL resolution order for RSS items

1. `text(item, 'link')` — existing behaviour, unchanged
2. `rssItemUrl(item)` — new fallback, used only when step 1 returns null

### Code change in parseRss()

In `parseRss()`, find the articles mapping block. The line:
```js
url:         text(item, 'link'),
```
Replace with:
```js
url:         text(item, 'link') || rssItemUrl(item),
```

### New helper function

Add after the existing `text()` helper (before `parseRss`). `item` is an individual `<item>` DOM element from `channel.querySelectorAll('item')` — `querySelector('guid')` is scoped to that element and will not traverse sibling or ancestor nodes.

```js
function rssItemUrl(item) {
  const guidEl = item.querySelector('guid');
  if (!guidEl) return null;
  // Attribute names are case-sensitive in XML documents parsed via DOMParser.
  // The RSS 2.0 spec defines this attribute as 'isPermaLink' (camel case exactly).
  // isPermaLink defaults to true when absent per the RSS 2.0 spec.
  if (guidEl.getAttribute('isPermaLink') === 'false') return null;
  const val = (guidEl.textContent || '').trim();
  return /^https?:\/\//.test(val) ? val : null;
}
```

Note: the regex has no `i` flag — only lowercase `http://` and `https://` are matched, consistent with all real-world RSS feeds.

### Behaviour table

| `<link>` | `<guid>` value | `isPermaLink` attr | `article.url` |
|----------|----------------|--------------------|---------------|
| `https://example.com/post` | absent | — | `https://example.com/post` |
| `https://example.com/post` | `https://example.com/other` | `"true"` | `https://example.com/post` (`<link>` wins) |
| `https://example.com/post` | `https://example.com/other` | `"false"` | `https://example.com/post` (`<link>` wins) |
| absent | `https://example.com/post` | absent (default true) | `https://example.com/post` |
| absent | `https://example.com/post` | `"true"` | `https://example.com/post` |
| absent | `https://example.com/post` | `"false"` | `null` |
| absent | `urn:uuid:abc123` | absent (default true) | `null` (no http scheme) |
| absent | `urn:uuid:abc123` | `"true"` | `null` (no http scheme) |
| absent | absent | — | `null` |

---

## Tests

New test cases in `tests/parser.test.js` (RSS 2.0 section):

1. Item with `<guid>` (no `isPermaLink` attr) and no `<link>` → `article.url` equals the guid value
2. Item with `<guid isPermaLink="true">` and no `<link>` → `article.url` equals the guid value
3. Item with `<guid isPermaLink="false">` and no `<link>` → `article.url` is `null`
4. Item with `<guid>` that is a URN (e.g. `urn:uuid:abc`) and no `<link>` → `article.url` is `null`
5. Item with `<guid isPermaLink="true">` that is a URN and no `<link>` → `article.url` is `null`
6. Item with `<link>https://example.com/post</link>` and `<guid isPermaLink="true">https://example.com/other</guid>` → `article.url` is `https://example.com/post` (`<link>` wins)

---

## Out of Scope

- Atom `<id>` fallback (deliberate deferral)
- Atom `<link rel="alternate">` preference fix
- Any change to how `article.url` is used after parsing
