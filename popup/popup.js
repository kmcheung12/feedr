// popup/popup.js
// Detects RSS/Atom <link> elements on the active tab and lets the user add the feed.
// Also manages recording and display of two global keyboard shortcuts.

document.addEventListener('DOMContentLoaded', async () => {
  // Detect incognito before any send() calls or UI setup.
  const win = await chrome.windows.getCurrent();
  const isPrivate = win.incognito;

  const detectedSection = document.getElementById('detected');
  const detectedUrl     = document.getElementById('detected-url');
  const btnAddDetected  = document.getElementById('btn-add-detected');
  const manualUrl       = document.getElementById('manual-url');
  const btnAddManual    = document.getElementById('btn-add-manual');
  const messageEl       = document.getElementById('message');
  const statusEl        = document.getElementById('status');
  const btnShortcutAdd  = document.getElementById('btn-shortcut-add');
  const btnShortcutOpen = document.getElementById('btn-shortcut-open');

  // --- Shortcut display ---

  function shortcutLabel(combo) {
    return combo ? `⌨ ${combo}` : '⌨ —';
  }

  // Load stored shortcuts and update button labels.
  const stored = await chrome.storage.local.get(['shortcut_open', 'shortcut_add']);
  btnShortcutAdd.textContent  = shortcutLabel(stored.shortcut_add  || null);
  btnShortcutOpen.textContent = shortcutLabel(stored.shortcut_open || null);

  // --- Shortcut recording ---

  let cancelRecording = null; // holds cleanup fn for the active recording session

  function buildCombo(e) {
    const parts = [];
    if (e.ctrlKey)  parts.push('Ctrl');
    if (e.altKey)   parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    if (e.metaKey)  parts.push('Meta');
    const key = e.key;
    if (!['Control', 'Alt', 'Shift', 'Meta'].includes(key)) parts.push(key);
    return parts.join('+');
  }

  function startRecording(btn, storageKey) {
    // Cancel any existing recording first.
    if (cancelRecording) cancelRecording();

    const previous = btn.textContent;
    btn.textContent = 'press key…';
    btn.classList.add('recording');

    function onKeyDown(e) {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        finish(previous, null); // restore previous, no save
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        finish('⌨ —', ''); // clear shortcut
        return;
      }

      // Must include at least one modifier key (Ctrl, Alt, or Meta).
      if (!e.ctrlKey && !e.altKey && !e.metaKey) return;

      const combo = buildCombo(e);
      finish(shortcutLabel(combo), combo);
    }

    function onFocusIn(e) {
      if (e.target !== btn) finish(previous, null);
    }

    function finish(label, saveValue) {
      cleanup();
      btn.textContent = label;
      if (saveValue !== null) {
        const obj = {};
        obj[storageKey] = saveValue || null;
        chrome.storage.local.set(obj);
      }
    }

    function cleanup() {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('focusin', onFocusIn);
      btn.classList.remove('recording');
      cancelRecording = null;
    }

    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('focusin', onFocusIn);
    cancelRecording = cleanup;
  }

  btnShortcutAdd.addEventListener('click',  () => startRecording(btnShortcutAdd,  'shortcut_add'));
  btnShortcutOpen.addEventListener('click', () => startRecording(btnShortcutOpen, 'shortcut_open'));

  // --- Feed detection ---

  let feedUrl = null;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const el = document.querySelector(
          'link[type="application/rss+xml"], link[type="application/atom+xml"]'
        );
        return el ? el.href : null;
      }
    });
    feedUrl = results && results[0] && results[0].result;
  } catch (e) {
    // executeScript may fail on about:, file: etc. — that's fine
  }

  if (feedUrl) {
    detectedSection.classList.remove('hidden');
    detectedUrl.textContent = feedUrl;
  } else {
    statusEl.textContent = 'No feed detected on this page.';
  }

  // --- Add feed ---

  async function addFeed(url) {
    if (!url) return;
    messageEl.className = 'message hidden';
    try {
      const resp = await chrome.runtime.sendMessage({ type: MSG.ADD_FEED, url, private: isPrivate });
      if (resp && resp.error) {
        const text = resp.error === 'FEED_EXISTS' ? 'Already in your feeds.'
                   : resp.error === 'NOT_A_FEED'  ? 'URL is not a valid RSS/Atom feed.'
                   : 'Could not add feed: ' + resp.error;
        showMessage(text, 'error');
        return;
      }
      showMessage('Feed added!', 'success');
    } catch (e) {
      showMessage('Could not add feed: ' + e.message, 'error');
    }
  }

  btnAddDetected.addEventListener('click', () => addFeed(feedUrl));
  btnAddManual.addEventListener('click',   () => addFeed(manualUrl.value.trim()));
  manualUrl.addEventListener('keydown', e => { if (e.key === 'Enter') addFeed(manualUrl.value.trim()); });

  document.getElementById('btn-open-feedr').addEventListener('click', async () => {
    await chrome.tabs.create({ url: chrome.runtime.getURL('newtab/newtab.html') });
    window.close();
  });

  function showMessage(text, type) {
    messageEl.textContent = text;
    messageEl.className = `message ${type}`;
  }
});
