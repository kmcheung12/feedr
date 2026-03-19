# Reader Panel Link Focus Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `↓`/`↑` navigate DOM focus through links in the reader panel (like Tab/Shift+Tab), with `↑` on the first link returning to panel-level focus and `←` on the first link jumping to the middle panel.

**Architecture:** Two targeted edits — `tabindex="-1"` on the reader panel element (so `.focus()` works programmatically), and a State B early-return block inserted before the existing switch in `bindKeyboardNav()` plus a State A replacement inside the reader's `ArrowDown` branch.

**Tech Stack:** Vanilla JS, browser DOM APIs.

---

### Task 1: Add `tabindex="-1"` to `#panel-reader` and implement link focus navigation

**Files:**
- Modify: `newtab/newtab.html:38`
- Modify: `newtab/newtab.js:409-438` (`bindKeyboardNav` keydown handler)

No automated tests — all behaviour is keyboard interaction in the browser. Manual verification steps are provided below.

- [ ] **Step 1: Add `tabindex="-1"` to `#panel-reader` in `newtab/newtab.html`**

Change line 38 from:
```html
    <article id="panel-reader">
```
to:
```html
    <article id="panel-reader" tabindex="-1">
```

`tabindex="-1"` makes the element reachable by `.focus()` programmatically without adding it to the Tab key order.

- [ ] **Step 2: Insert the State B block into `bindKeyboardNav()` in `newtab/newtab.js`**

Inside the `document.addEventListener('keydown', e => {` handler, after the existing `if (e.target.closest('input, textarea')) return;` line and **before** the `switch (e.key)` statement, insert:

```js
    // State B: a link inside the reader panel has DOM focus — navigate links.
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

- [ ] **Step 3: Replace the reader panel scroll with State A handling inside the existing switch**

Find this block inside the `case 'ArrowUp': case 'ArrowDown':` branch (currently lines 431–432):

```js
        } else if (focusedPanel === 'reader') {
          document.getElementById('panel-reader').scrollBy({ top: delta * 200, behavior: 'smooth' });
        }
```

Replace it with:

```js
        } else if (focusedPanel === 'reader') {
          // State A: panel-level focus — Down focuses the first link; Up does nothing.
          if (e.key === 'ArrowDown') {
            const first = document.querySelector('#panel-reader a[href]');
            if (first) first.focus();
          }
        }
```

- [ ] **Step 4: Verify the full handler looks correct**

After both edits, the full `bindKeyboardNav` handler should look like this (check it matches before committing):

```js
function bindKeyboardNav() {
  document.getElementById('panel-feeds').addEventListener('click', () => setFocusedPanel('feeds'));
  document.getElementById('panel-articles').addEventListener('click', () => setFocusedPanel('articles'));
  document.getElementById('panel-reader').addEventListener('click', () => setFocusedPanel('reader'));

  document.addEventListener('keydown', e => {
    // Do not intercept when focus is in a text input or textarea (tag editor, add-feed input)
    if (e.target.closest('input, textarea')) return;

    // State B: a link inside the reader panel has DOM focus — navigate links.
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

    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowRight': {
        const idx = PANELS.indexOf(focusedPanel);
        const next = e.key === 'ArrowRight'
          ? Math.min(idx + 1, PANELS.length - 1)
          : Math.max(idx - 1, 0);
        setFocusedPanel(PANELS[next]);
        e.preventDefault();
        break;
      }
      case 'ArrowUp':
      case 'ArrowDown': {
        const delta = e.key === 'ArrowDown' ? 1 : -1;
        if (focusedPanel === 'articles') {
          navigateArticle(delta);
        } else if (focusedPanel === 'feeds') {
          document.getElementById('feed-list').scrollBy({ top: delta * 60, behavior: 'smooth' });
        } else if (focusedPanel === 'reader') {
          // State A: panel-level focus — Down focuses the first link; Up does nothing.
          if (e.key === 'ArrowDown') {
            const first = document.querySelector('#panel-reader a[href]');
            if (first) first.focus();
          }
        }
        e.preventDefault();
        break;
      }
    }
  });
}
```

- [ ] **Step 5: Manual verification in the browser**

Load the extension newtab page. Select an article to populate the reader panel. Then:

1. Click the reader panel to give it keyboard focus (blue highlight on panel).
2. Press `↓` → the "Open original" link should receive DOM focus (visible focus ring).
3. Press `↓` again → focus moves to the next link in the article body (if any).
4. Press `↑` → focus moves back to "Open original".
5. Press `↑` again (while on "Open original") → focus returns to the panel itself (focus ring moves back to the panel border, no individual link highlighted).
6. Press `↓` → "Open original" receives focus again.
7. While "Open original" is focused, press `←` → the middle panel (articles) becomes keyboard-focused.

- [ ] **Step 6: Commit**

```bash
git add newtab/newtab.html newtab/newtab.js
git commit -m "feat: reader panel link focus navigation with arrow keys"
```
