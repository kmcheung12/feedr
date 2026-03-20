# Feedr

An in-browser RSS/Atom feed aggregator for Firefox (and Chrome). Read your feeds without leaving the browser — no accounts, no servers, no tracking.

## Features

- **Subscribe to feeds** — add RSS 2.0 or Atom 1.0 feeds by URL or via auto-detection on any page
- **3-panel reader** — feeds list, article list, and readable article view side by side
- **Tag organization** — label feeds with custom tags; filter articles by tag
- **Keyboard shortcuts** — global shortcuts to open Feedr or add a feed from the clipboard
- **Keyboard navigation** — arrow keys to move between articles and navigate links in the reader
- **Sort articles** — by time (newest first) or by source feed
- **Private browsing support** — separate ephemeral storage for incognito windows, auto-cleared on close
- **Article extraction** — full readable content via Mozilla's Readability library
- **No external services** — all data stored locally in IndexedDB

## Installation

### Firefox (recommended)

1. Clone or download this repository
2. Open `about:debugging` → **This Firefox** → **Load Temporary Add-on**
3. Select `manifest.json` from the project root

For permanent installation, load it as a signed extension via [Firefox Add-on Developer Hub](https://addons.mozilla.org/developers/).

### Chrome / Chromium

1. Open `chrome://extensions` → enable **Developer mode**
2. Click **Load unpacked** → select the project root

## Usage

### Adding feeds

- **Popup**: Click the Feedr toolbar icon. The popup auto-detects RSS/Atom links on the current page. You can also paste any feed URL manually.
- **Keyboard shortcut**: Set an "Add feed" shortcut in the popup, then use it on any page — it reads the URL from your clipboard and adds the feed.

### Reading

Click the toolbar icon → **Open Feedr** (or use the "Open Feedr" keyboard shortcut) to open the reader.

| Action | Keyboard |
|--------|----------|
| Move between articles | `↑` / `↓` |
| Navigate links in reader | `↑` / `↓` (when reader panel is focused) |

### Organizing

- **Tags**: Click the tag icon on any feed to add/remove tags (up to 20 per feed)
- **Filter by tag**: Click a tag in the sidebar to show only articles from tagged feeds
- **Filter by feed**: Click a feed name to show only its articles
- **Sort**: Toggle between "by time" and "by source" above the article list

## Development

### Prerequisites

- Node.js (for running tests)

### Running tests

```sh
cd tests
npm install
npm test
```

Tests cover the RSS/Atom parser (`lib/parser.js`).

### Project structure

```
background.js          # Service worker — message hub for all extension operations
manifest.json          # Extension manifest (MV3)
content/
  shortcuts.js         # Global keyboard shortcut listener (runs on every page)
lib/
  db.js                # IndexedDB wrapper (persistent storage)
  private-store.js     # Session storage wrapper (private browsing)
  parser.js            # RSS 2.0 & Atom 1.0 parser
  Readability.js       # Article content extraction
popup/                 # Toolbar popup (add feeds, configure shortcuts)
newtab/                # Main reader UI (3-panel layout)
tests/                 # Jest test suite
```

### Architecture

All UI components communicate with the background service worker via `chrome.runtime.sendMessage()`. The background script owns all storage access and network requests. The popup and reader tabs are purely presentational.

Storage is split: IndexedDB for normal mode, `chrome.storage.session` for private browsing (ephemeral, cleared when the last incognito window closes).

## Disclaimer

This extension was built with the assistance of Claude, an AI assistant by Anthropic.

## License

MIT
