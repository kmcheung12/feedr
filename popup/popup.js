// popup/popup.js
// Detects RSS/Atom <link> elements on the active tab and lets the user add the feed.

document.addEventListener('DOMContentLoaded', async () => {
  const detectedSection = document.getElementById('detected');
  const detectedUrl = document.getElementById('detected-url');
  const btnAddDetected = document.getElementById('btn-add-detected');
  const manualUrl = document.getElementById('manual-url');
  const btnAddManual = document.getElementById('btn-add-manual');
  const messageEl = document.getElementById('message');
  const statusEl = document.getElementById('status');

  // Detect RSS links on the current tab
  let feedUrl = null;
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    const results = await browser.tabs.executeScript(tab.id, {
      code: `
        (function() {
          const el = document.querySelector(
            'link[type="application/rss+xml"], link[type="application/atom+xml"]'
          );
          return el ? el.href : null;
        })()
      `
    });
    feedUrl = results && results[0];
  } catch (e) {
    // executeScript may fail on about:, file: etc. — that's fine
  }

  if (feedUrl) {
    detectedSection.classList.remove('hidden');
    detectedUrl.textContent = feedUrl;
  } else {
    statusEl.textContent = 'No feed detected on this page.';
  }

  async function addFeed(url) {
    if (!url) return;
    messageEl.className = 'message hidden';
    try {
      const resp = await browser.runtime.sendMessage({ type: MSG.ADD_FEED, url });
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
  btnAddManual.addEventListener('click', () => addFeed(manualUrl.value.trim()));
  manualUrl.addEventListener('keydown', e => { if (e.key === 'Enter') addFeed(manualUrl.value.trim()); });

  document.getElementById('btn-open-feedr').addEventListener('click', async () => {
    await browser.tabs.create({ url: browser.runtime.getURL('newtab/newtab.html') });
    window.close();
  });

  function showMessage(text, type) {
    messageEl.textContent = text;
    messageEl.className = `message ${type}`;
  }
});
