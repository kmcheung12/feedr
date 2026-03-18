// newtab/newtab.js
// Three-panel new tab page UI.
// Communicates with background.js exclusively via browser.runtime.sendMessage.

// ── State ──
let feeds = [];
let articles = [];
let selectedArticleId = null;
let currentSort = 'time';

// ── Messaging helper ──
function send(type, payload = {}) {
  return browser.runtime.sendMessage(Object.assign({ type }, payload));
}

// ── Boot ──
document.addEventListener('DOMContentLoaded', async () => {
  await loadFeeds();
  await loadArticles();
  bindFeedControls();
  bindSortControls();
});

// ── Feed loading ──
async function loadFeeds() {
  const resp = await send(MSG.GET_FEEDS);
  if (resp.error) return;
  feeds = resp.feeds;
  renderFeedList();
}

function renderFeedList() {
  const list = document.getElementById('feed-list');
  list.innerHTML = '';

  if (feeds.length === 0) {
    list.innerHTML = '<li style="padding:12px 14px;color:var(--muted);font-size:12px">No feeds yet. Add one above.</li>';
    return;
  }

  feeds.forEach(feed => {
    const unreadCount = articles.filter(a => a.feedId === feed.id && !a.readAt).length;
    const li = document.createElement('li');
    li.dataset.feedId = feed.id;
    li.title = feed.url;

    li.innerHTML = `
      <span class="feed-title">${escHtml(feed.title || feed.url)}</span>
      ${unreadCount > 0 ? `<span class="unread-badge">${unreadCount}</span>` : ''}
      <button class="btn-refresh" data-feed-id="${feed.id}" title="Refresh">&#8635;</button>
    `;

    li.querySelector('.btn-refresh').addEventListener('click', async (e) => {
      e.stopPropagation();
      const btn = e.currentTarget;
      btn.textContent = '…';
      await send(MSG.FETCH_FEED, { id: feed.id });
      btn.textContent = '↻';
      await loadArticles();
      renderFeedList();
    });

    list.appendChild(li);
  });
}

// ── Add feed ──
function bindFeedControls() {
  const btnShowAdd = document.getElementById('btn-show-add');
  const addForm = document.getElementById('add-feed-form');
  const addInput = document.getElementById('add-feed-url');
  const btnAdd = document.getElementById('btn-add-feed');
  const errorEl = document.getElementById('add-feed-error');

  btnShowAdd.addEventListener('click', () => {
    addForm.classList.toggle('hidden');
    if (!addForm.classList.contains('hidden')) addInput.focus();
  });

  async function submitAddFeed() {
    const url = addInput.value.trim();
    if (!url) return;
    errorEl.classList.add('hidden');
    btnAdd.textContent = '…';
    const resp = await send(MSG.ADD_FEED, { url });
    btnAdd.textContent = 'Add';
    if (resp.error) {
      const msg = resp.error === 'FEED_EXISTS'   ? 'Already added.'
                : resp.error === 'NOT_A_FEED'    ? 'Not a valid RSS/Atom feed.'
                : resp.error === 'NETWORK_ERROR' ? 'Could not reach that URL.'
                : resp.error;
      errorEl.textContent = msg;
      errorEl.classList.remove('hidden');
      return;
    }
    addInput.value = '';
    addForm.classList.add('hidden');
    await loadFeeds();
    await loadArticles();
  }

  btnAdd.addEventListener('click', submitAddFeed);
  addInput.addEventListener('keydown', e => { if (e.key === 'Enter') submitAddFeed(); });
}

// ── Article loading + rendering ──
async function loadArticles() {
  const resp = await send(MSG.GET_ARTICLES, { sort: currentSort });
  if (resp.error) return;
  articles = resp.articles;
  renderArticleList();
  renderFeedList(); // refresh unread counts
}

function renderArticleList() {
  const list = document.getElementById('article-list');
  list.innerHTML = '';

  if (articles.length === 0) {
    list.innerHTML = '<li style="padding:14px;color:var(--muted);font-size:12px">No articles yet.</li>';
    return;
  }

  articles.forEach(article => {
    const li = document.createElement('li');
    li.dataset.articleId = article.id;
    if (article.readAt) li.classList.add('read');
    if (article.id === selectedArticleId) li.classList.add('active');

    const feed = feeds.find(f => f.id === article.feedId);
    const source = feed ? (feed.title || feed.url) : '';
    const date = article.publishedAt
      ? new Date(article.publishedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      : '';

    li.innerHTML = `
      <div class="article-title">${escHtml(article.title || '(no title)')}</div>
      <div class="article-meta">${escHtml(source)}${source && date ? ' · ' : ''}${date}</div>
    `;

    li.addEventListener('click', () => selectArticle(article.id));
    list.appendChild(li);
  });
}

function bindSortControls() {
  document.querySelectorAll('input[name="sort"]').forEach(radio => {
    radio.addEventListener('change', async (e) => {
      currentSort = e.target.value;
      await loadArticles();
    });
  });
}

// ── Article reader ──
async function selectArticle(id) {
  selectedArticleId = id;

  // Update active state in list
  document.querySelectorAll('#article-list li').forEach(li => {
    li.classList.toggle('active', Number(li.dataset.articleId) === id);
  });

  const article = articles.find(a => a.id === id);
  if (!article) return;

  // Show reader shell immediately with what we have
  showReaderShell(article);

  // Mark read
  if (!article.readAt) {
    article.readAt = Date.now(); // optimistic update
    const li = document.querySelector(`#article-list li[data-article-id="${id}"]`);
    if (li) li.classList.add('read');
    renderFeedList(); // update unread badge
    send(MSG.MARK_READ, { id }); // fire and forget
  }

  // Fetch readable content if not cached
  if (!article.readableContent) {
    document.getElementById('reader-body').innerHTML =
      '<p style="color:var(--muted);font-size:13px">Loading article…</p>';

    const resp = await send(MSG.FETCH_ARTICLE, { id });

    if (resp.readableContent) {
      article.readableContent = resp.readableContent;
      document.getElementById('reader-body').innerHTML = sanitize(resp.readableContent);
    } else {
      // Fall back to summary
      document.getElementById('reader-body').innerHTML =
        article.summary
          ? `<p>${escHtml(article.summary)}</p>`
          : '<p style="color:var(--muted)">No content available.</p>';
    }
  } else {
    document.getElementById('reader-body').innerHTML = sanitize(article.readableContent);
  }
}

function showReaderShell(article) {
  document.getElementById('reader-placeholder').classList.add('hidden');
  document.getElementById('reader-content').classList.remove('hidden');

  document.getElementById('reader-title').textContent = article.title || '(no title)';

  const feed = feeds.find(f => f.id === article.feedId);
  const date = article.publishedAt
    ? new Date(article.publishedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : '';
  const byline = [
    article.author,
    feed ? (feed.title || '') : '',
    date
  ].filter(Boolean).join(' · ');
  document.getElementById('reader-byline').textContent = byline;

  const originalLink = document.getElementById('reader-original');
  originalLink.href = article.url || '#';
  originalLink.style.display = article.url ? '' : 'none';

  document.getElementById('reader-body').innerHTML = '';
  document.getElementById('panel-reader').scrollTop = 0;
}

// Minimal sanitizer: strip <script>, <style>, and on* event handlers from Readability output.
function sanitize(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  div.querySelectorAll('script, style').forEach(el => el.remove());
  div.querySelectorAll('*').forEach(el => {
    Array.from(el.attributes).forEach(attr => {
      if (attr.name.startsWith('on')) el.removeAttribute(attr.name);
    });
  });
  return div.innerHTML;
}

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
