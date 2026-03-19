# Reader Panel Link Focus Navigation Design

## Overview

When the reader panel (right panel) is keyboard-focused, `↓`/`↑` navigate DOM focus through the panel's links (`a[href]` elements) rather than scrolling. This mirrors Tab / Shift+Tab, letting the user reach and activate article links from the keyboard without touching the mouse.

---

## Two Focus States

### State A — Panel-level focus
`focusedPanel === 'reader'` and `document.activeElement` is **not** a link inside `#panel-reader`.

| Key | Action |
|-----|--------|
| `↓` | Focus the first `a[href]` inside `#panel-reader` (typically "Open original") |
| `↑` | No change (panel remains active; no link to go back to) |

### State B — Link-level focus
`document.activeElement` is an `a[href]` inside `#panel-reader`.

| Key | Condition | Action |
|-----|-----------|--------|
| `↓` | Any link | Focus the next `a[href]` in the panel; if already the last, do nothing (default scroll suppressed) |
| `↑` | Not the first link | Focus the previous `a[href]` |
| `↑` | First link | Return to panel-level focus: call `panel-reader.focus()` |
| `←` | First link | `setFocusedPanel('articles')` (move to middle panel) |
| `←` | Not the first link | Do nothing (let the browser handle it) |

---

## Implementation

### `newtab/newtab.html`

Add `tabindex="-1"` to `#panel-reader` so it can receive programmatic focus via `.focus()` when returning from a link to panel-level state:

```html
<article id="panel-reader" tabindex="-1">
```

### `newtab/newtab.js` — `bindKeyboardNav()`

The existing global `keydown` handler already skips `input`/`textarea` targets. Add a second early-exit path for links inside the reader panel that handles State B, **before** the existing panel switch logic:

```js
// State B: a link inside the reader panel has DOM focus
const readerLink = e.target.closest('#panel-reader a');
if (readerLink) {
  const links = Array.from(document.querySelectorAll('#panel-reader a[href]'));
  const idx = links.indexOf(readerLink);
  if (e.key === 'ArrowDown') {
    if (idx < links.length - 1) links[idx + 1].focus();
    e.preventDefault();
  } else if (e.key === 'ArrowUp') {
    if (idx === 0) {
      document.getElementById('panel-reader').focus();
    } else {
      links[idx - 1].focus();
    }
    e.preventDefault();
  } else if (e.key === 'ArrowLeft' && idx === 0) {
    setFocusedPanel('articles');
    e.preventDefault();
  }
  return;
}
```

Then, inside the existing `case 'ArrowDown'` / `case 'ArrowUp'` for `focusedPanel === 'reader'`, replace the current scroll-only behaviour with State A handling:

```js
} else if (focusedPanel === 'reader') {
  if (e.key === 'ArrowDown') {
    const first = document.querySelector('#panel-reader a[href]');
    if (first) first.focus();
  }
  // ArrowUp at panel level: no action
}
```

---

## What Does Not Change

- `←`/`→` panel switching at panel level is unchanged.
- Up/Down in the feeds or articles panels is unchanged.
- Scrolling the reader panel by keyboard is replaced by link navigation (the two actions cannot coexist on the same keys without ambiguity).

---

## No Tests

All behaviour is keyboard interaction in the newtab page. Verification is manual in the browser.
