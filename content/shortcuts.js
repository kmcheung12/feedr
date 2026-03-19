// content/shortcuts.js
// Listens globally for user-configured keyboard shortcuts and dispatches
// OPEN_FEEDR or ADD_FEED messages to the background.

(function () {
  // MSG global is provided by lib/constants.js, which the manifest loads before this script.
  let shortcutOpen = null;
  let shortcutAdd  = null;

  // Load stored shortcuts on injection.
  chrome.storage.local.get(['shortcut_open', 'shortcut_add'], (result) => {
    shortcutOpen = result.shortcut_open || null;
    shortcutAdd  = result.shortcut_add  || null;
  });

  // Keep shortcuts in sync when the popup saves new values.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.shortcut_open !== undefined) shortcutOpen = changes.shortcut_open.newValue || null;
    if (changes.shortcut_add  !== undefined) shortcutAdd  = changes.shortcut_add.newValue  || null;
  });

  // Build a normalised combo string from a KeyboardEvent.
  // Format: Ctrl+Alt+Shift+Meta+Key (only present modifiers included)
  // Key label uses e.code for layout-independent matching (same logic as popup buildCombo).
  function comboFromEvent(e) {
    const parts = [];
    if (e.ctrlKey)  parts.push('Ctrl');
    if (e.altKey)   parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    if (e.metaKey)  parts.push('Meta');
    var k;
    if (e.code) {
      if (/^Key([A-Z])$/.test(e.code)) {
        k = e.code.slice(3);
      } else if (/^Digit(\d)$/.test(e.code)) {
        k = e.code.slice(5);
      } else if (/^Numpad(.+)$/.test(e.code)) {
        k = 'Num' + e.code.slice(6);
      } else if (/^F(\d+)$/.test(e.code)) {
        k = e.code;
      } else {
        k = (e.key && e.key.length === 1) ? e.key.toUpperCase() : e.code;
      }
    } else {
      k = e.key;
    }
    // Don't append the key itself if it IS a lone modifier press.
    if (!['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) parts.push(k);
    return parts.join('+');
  }

  document.addEventListener('keydown', async (e) => {
    const combo = comboFromEvent(e);
    if (!combo) return;

    if (shortcutOpen && combo === shortcutOpen) {
      e.preventDefault();
      chrome.runtime.sendMessage({ type: MSG.OPEN_FEEDR });
      return;
    }

    if (shortcutAdd && combo === shortcutAdd) {
      e.preventDefault();
      try {
        const url = await navigator.clipboard.readText();
        if (url && url.trim()) {
          chrome.runtime.sendMessage({ type: MSG.ADD_FEED_VIA_POPUP, url: url.trim() });
        }
      } catch (err) {
        // Clipboard access denied — silently ignore.
      }
      return;
    }
  }, true); // capture phase: intercept before page handlers
})();
