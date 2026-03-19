// newtab/newtab.js
// Three-panel new tab page UI.
// Communicates with background.js exclusively via chrome.runtime.sendMessage.

// ── State ──
let feeds = [];
let articles = [];
let selectedArticleId = null;
let currentSort = 'time';
let activeTags = new Set();
let expandedFeedId = null;
let selectedFeedId = null;
let focusedPanel = 'articles'; // 'feeds' | 'articles' | 'reader'
const PANELS = ['feeds', 'articles', 'reader'];
let isPrivate = false;

function setFocusedPanel(name) {
  focusedPanel = name;
  PANELS.forEach(p => {
    document.getElementById('panel-' + p).classList.toggle('panel-focused', p === name);
  });
}

// ── Messaging helper ──
function send(type, payload = {}) {
  return chrome.runtime.sendMessage(Object.assign({ type, private: isPrivate }, payload));
}

// ── Boot ──
document.addEventListener('DOMContentLoaded', async () => {
  const win = await chrome.windows.getCurrent();
  isPrivate = win.incognito;
  await loadFeeds();
  await loadArticles();
  bindFeedControls();
  bindSortControls();
  bindKeyboardNav();
  setFocusedPanel('articles'); // apply initial focus ring
});

// ── Feed loading ──
async function loadFeeds() {
  const resp = await send(MSG.GET_FEEDS);
  if (resp.error) return;
  feeds = resp.feeds;
  renderFeedList();
  renderTagFilterBar();
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
    if (feed.fetchError) li.classList.add('feed-error');
    if (feed.id === selectedFeedId) li.classList.add('feed-selected');

    const lastFetchedText = feed.lastFetched
      ? new Date(feed.lastFetched).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
      : '';

    const tagPillsHtml = (feed.tags || []).map(t => `<span class="tag-pill">${escHtml(t)}</span>`).join('');

    li.innerHTML = `
      <span class="feed-title">${escHtml(feed.title || feed.url)}</span>
      ${feed.fetchError ? `<span class="feed-error-badge" title="${escHtml(feed.fetchError)}">!</span>` : ''}
      ${tagPillsHtml}
      ${unreadCount > 0 ? `<span class="unread-badge">${unreadCount}</span>` : ''}
      <button class="btn-edit-tags" title="Edit tags">&#35;</button>
      <button class="btn-refresh" title="${lastFetchedText ? 'Last fetched: ' + lastFetchedText : 'Refresh'}">&#8635;</button>
      <button class="btn-remove" title="Remove feed">&times;</button>
    `;

    li.querySelector('.btn-refresh').addEventListener('click', async (e) => {
      e.stopPropagation();
      const btn = e.currentTarget;
      btn.textContent = '…';
      const resp = await send(MSG.FETCH_FEED, { id: feed.id });
      btn.textContent = '↻';
      if (resp.error) {
        btn.title = 'Refresh failed: ' + resp.error;
        btn.style.color = 'var(--danger)';
      } else {
        btn.title = 'Refresh';
        btn.style.color = '';
      }
      await loadFeeds();
      await loadArticles();
    });

    li.querySelector('.btn-edit-tags').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFeedEditor(feed.id);
    });

    li.querySelector('.btn-remove').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(`Remove "${feed.title || feed.url}"?`)) return;
      if (selectedFeedId === feed.id) selectedFeedId = null;
      await send(MSG.REMOVE_FEED, { id: feed.id });
      await loadFeeds();
      await loadArticles();
    });

    li.addEventListener('click', () => setSelectedFeed(feed.id));

    if (feed.id === expandedFeedId) {
      appendTagEditor(li, feed);
    }

    list.appendChild(li);
  });
}

function renderTagFilterBar() {
  const bar = document.getElementById('tag-filter-bar');
  const allTags = [...new Set(feeds.flatMap(f => f.tags || []))].sort();

  if (allTags.length === 0) {
    bar.classList.add('hidden');
    bar.innerHTML = '';
    return;
  }

  bar.classList.remove('hidden');
  bar.innerHTML = '';

  allTags.forEach(tag => {
    const btn = document.createElement('button');
    btn.className = 'tag-filter-chip' + (activeTags.has(tag) ? ' active' : '');
    btn.textContent = tag;
    btn.addEventListener('click', () => {
      if (activeTags.has(tag)) {
        activeTags.delete(tag);
      } else {
        activeTags.add(tag);
        selectedFeedId = null; // mutual exclusivity: activating a tag clears feed selection
      }
      renderFeedList();      // update feed-selected CSS highlight
      renderTagFilterBar();
      renderArticleList();
    });
    bar.appendChild(btn);
  });
}

function toggleFeedEditor(id) {
  expandedFeedId = (expandedFeedId === id) ? null : id;
  renderFeedList();
  renderTagFilterBar();
}

function setSelectedFeed(id) {
  selectedFeedId = (selectedFeedId === id) ? null : id;
  if (selectedFeedId !== null) activeTags.clear();
  renderFeedList();
  renderTagFilterBar();
  renderArticleList();
}

function pruneActiveTags() {
  const existingTags = new Set(feeds.flatMap(f => f.tags || []));
  let changed = false;
  activeTags.forEach(tag => {
    if (!existingTags.has(tag)) {
      activeTags.delete(tag);
      changed = true;
    }
  });
  if (changed) {
    renderTagFilterBar();
    renderArticleList();
  }
}

function appendTagEditor(li, feed) {
  const tags = feed.tags || [];
  const editor = document.createElement('div');
  editor.className = 'tag-editor';
  editor.addEventListener('click', e => e.stopPropagation());

  // Existing tags as removable chips
  tags.forEach(tag => {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';

    const label = document.createElement('span');
    label.textContent = tag;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'tag-remove';
    removeBtn.textContent = '×';
    removeBtn.title = 'Remove tag';
    removeBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const newTags = (feed.tags || []).filter(t => t !== tag);
      const resp = await send(MSG.UPDATE_FEED_TAGS, { id: feed.id, tags: newTags });
      if (!resp.error) {
        const f = feeds.find(f => f.id === feed.id);
        if (f) f.tags = newTags;
        renderFeedList();
        renderTagFilterBar();
        pruneActiveTags();
      }
    });

    chip.appendChild(label);
    chip.appendChild(removeBtn);
    editor.appendChild(chip);
  });

  // Add-tag input
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'tag-add-input';
  input.placeholder = 'Add tag\u2026';
  input.maxLength = 40;
  if (tags.length >= 20) {
    input.disabled = true;
    input.title = 'Max 20 tags';
  }

  input.addEventListener('click', e => e.stopPropagation());

  input.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter' && e.key !== ',') return;
    e.preventDefault();
    const normalised = input.value.replace(/,/g, '').trim().toLowerCase();
    input.value = '';
    if (!normalised) return;
    const currentTags = feed.tags || [];
    if (currentTags.includes(normalised) || currentTags.length >= 20) return;
    const newTags = [...currentTags, normalised];
    const resp = await send(MSG.UPDATE_FEED_TAGS, { id: feed.id, tags: newTags });
    if (!resp.error) {
      const f = feeds.find(f => f.id === feed.id);
      if (f) f.tags = newTags;
      activeTags.add(normalised);  // auto-select the new tag as a filter
      selectedFeedId = null;        // mutual exclusivity: activating a tag clears feed selection
      renderFeedList();
      renderTagFilterBar();
      renderArticleList();          // article list must update to reflect new filter
    }
  });

  editor.appendChild(input);
  li.appendChild(editor);
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
  renderTagFilterBar();
}

function renderArticleList() {
  const list = document.getElementById('article-list');
  list.innerHTML = '';

  // `articles` is already sorted (by time or domain) — it arrives pre-sorted from
  // the background via MSG.GET_ARTICLES. Filtering a sorted array preserves sort order.
  const feedsById = new Map(feeds.map(f => [f.id, f]));

  let visible = articles;
  if (activeTags.size > 0) {
    visible = articles.filter(article => {
      const feedTags = (feedsById.get(article.feedId) || {}).tags || [];
      return feedTags.some(t => activeTags.has(t));
    });
  }
  if (selectedFeedId !== null) {
    visible = visible.filter(a => a.feedId === selectedFeedId);
  }

  if (visible.length === 0) {
    const msg = activeTags.size > 0
      ? 'No articles match the selected tags.'
      : selectedFeedId !== null
      ? 'No articles in this feed.'
      : 'No articles yet.';
    list.innerHTML = `<li style="padding:14px;color:var(--muted);font-size:12px">${msg}</li>`;
    return;
  }

  visible.forEach(article => {
    const li = document.createElement('li');
    li.dataset.articleId = article.id;
    if (article.readAt) li.classList.add('read');
    if (article.id === selectedArticleId) li.classList.add('active');

    const feed = feedsById.get(article.feedId);
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

function navigateArticle(delta) {
  // Derive the same visible list as renderArticleList()
  // articles is already sorted (pre-sorted from background); do not re-sort.
  let visible = articles;
  if (activeTags.size > 0) {
    const feedsById = new Map(feeds.map(f => [f.id, f]));
    visible = articles.filter(article => {
      const feedTags = (feedsById.get(article.feedId) || {}).tags || [];
      return feedTags.some(t => activeTags.has(t));
    });
  }
  if (selectedFeedId !== null) {
    visible = visible.filter(a => a.feedId === selectedFeedId);
  }
  if (visible.length === 0) return;

  // findIndex returns -1 if no article is selected or if the selected article
  // was filtered out (e.g. by a tag change). Treat both as "no current position":
  // delta=1 → select first article; delta=-1 → do nothing.
  let idx = visible.findIndex(a => a.id === selectedArticleId);
  if (idx === -1 && delta === -1) return;

  const newIdx = Math.min(Math.max(idx + delta, 0), visible.length - 1);
  selectArticle(visible[newIdx].id);

  // Scroll the newly selected <li> into view if it's outside the visible area
  const li = document.querySelector(
    `#article-list li[data-article-id="${visible[newIdx].id}"]`
  );
  if (li) li.scrollIntoView({ block: 'nearest' });
}

function bindKeyboardNav() {
  // Panel click listeners — clicking anywhere in a panel updates keyboard focus.
  // Note: existing stopPropagation() calls on the tag editor and feed action buttons
  // prevent these from firing for those specific clicks, which is acceptable.
  document.getElementById('panel-feeds').addEventListener('click', () => setFocusedPanel('feeds'));
  document.getElementById('panel-articles').addEventListener('click', () => setFocusedPanel('articles'));
  document.getElementById('panel-reader').addEventListener('click', () => setFocusedPanel('reader'));

  document.addEventListener('keydown', e => {
    // Do not intercept when focus is in a text input or textarea (tag editor, add-feed input)
    if (e.target.closest('input, textarea')) return;

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
          document.getElementById('panel-reader').scrollBy({ top: delta * 200, behavior: 'smooth' });
        }
        e.preventDefault();
        break;
      }
    }
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
    renderTagFilterBar();
    send(MSG.MARK_READ, { id }); // fire and forget
  }

  // Fetch readable content if not cached
  if (!article.readableContent) {
    document.getElementById('reader-body').innerHTML =
      '<p style="color:var(--muted);font-size:13px">Loading article…</p>';

    const resp = await send(MSG.FETCH_ARTICLE, { id });

    // Guard against stale response if user selected a different article while fetching
    if (selectedArticleId !== id) return;

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

// Sanitizer: remove dangerous elements and attributes from Readability output.
// Strips script/style elements, iframes/objects/embeds, on* handlers,
// and javascript: URIs in href/src/action attributes.
function sanitize(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  div.querySelectorAll('script, style, iframe, object, embed').forEach(el => el.remove());
  div.querySelectorAll('*').forEach(el => {
    Array.from(el.attributes).forEach(attr => {
      if (attr.name.startsWith('on')) {
        el.removeAttribute(attr.name);
      } else if (['href', 'src', 'action'].includes(attr.name)) {
        if (/^\s*(javascript|data):/i.test(attr.value)) el.removeAttribute(attr.name);
      }
    });
  });
  return div.innerHTML;
}

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
