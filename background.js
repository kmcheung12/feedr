// background.js
// Service worker entry point. Handles all messages from newtab.js and popup.js.
// Has access to: db, privateStore, parseFeed, Readability, MSG (loaded via importScripts).

// In Chrome (service worker), importScripts loads the libs.
// In Firefox (event page via background.scripts), they're already loaded — importScripts is undefined.
if (typeof importScripts !== 'undefined') {
  importScripts(
    'lib/constants.js',
    'lib/db.js',
    'lib/parser.js',
    'lib/Readability.js',
    'lib/private-store.js'
  );
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message).then(sendResponse).catch(err => {
    console.error('[feedr background] error:', err);
    sendResponse({ error: err.message });
  });
  return true; // keep channel open for async response
});

async function handleMessage(message) {
  const store = message.private ? privateStore : db;
  switch (message.type) {
    case MSG.ADD_FEED:         return handleAddFeed(message.url, store);
    case MSG.REMOVE_FEED:      return handleRemoveFeed(message.id, store);
    case MSG.FETCH_FEED:       return handleFetchFeed(message.id, store);
    case MSG.FETCH_ARTICLE:    return handleFetchArticle(message.id, store);
    case MSG.MARK_READ:        return handleMarkRead(message.id, store);
    case MSG.GET_FEEDS:        return handleGetFeeds(store);
    case MSG.GET_ARTICLES:     return handleGetArticles(message.sort, store);
    case MSG.UPDATE_FEED_TAGS: return handleUpdateFeedTags(message.id, message.tags, store);
    case MSG.OPEN_FEEDR:
      await chrome.tabs.create({ url: chrome.runtime.getURL('newtab/newtab.html') });
      return { ok: true };
    case MSG.ADD_FEED_FROM_SHORTCUT: return handleAddFeed(message.url, store);
    default: throw new Error('UNKNOWN_MESSAGE_TYPE');
  }
}

async function handleAddFeed(url, store) {
  const existing = await store.getFeedByUrl(url);
  if (existing) throw new Error('FEED_EXISTS');

  const xml = await fetchText(url);
  const { feedMeta, articles } = parseFeed(xml); // throws NOT_A_FEED if invalid

  const feedId = await store.addFeed({
    url,
    title:       feedMeta.title || url,
    siteUrl:     feedMeta.siteUrl || null,
    favicon:     feedMeta.siteUrl ? faviconUrl(feedMeta.siteUrl) : null,
    lastFetched: Date.now(),
    addedAt:     Date.now(),
  });

  const withFeedId = articles.map(a => Object.assign({}, a, { feedId }));
  await store.upsertArticles(withFeedId);

  return { ok: true, feedId };
}

async function handleRemoveFeed(id, store) {
  await store.removeFeed(id);
  return { ok: true };
}

async function handleFetchFeed(id, store) {
  const feeds = await store.getFeeds();
  const feed = feeds.find(f => f.id === id);
  if (!feed) throw new Error('FEED_NOT_FOUND');

  let xml;
  try {
    xml = await fetchText(feed.url);
  } catch (e) {
    await store.updateFeed(id, { fetchError: e.message });
    throw new Error('NETWORK_ERROR');
  }

  let articles;
  try {
    ({ articles } = parseFeed(xml));
  } catch (e) {
    await store.updateFeed(id, { fetchError: e.message });
    throw e;
  }

  const withFeedId = articles.map(a => Object.assign({}, a, { feedId: id }));
  await store.upsertArticles(withFeedId);
  await store.updateFeed(id, { lastFetched: Date.now(), fetchError: null });

  return { ok: true };
}

async function handleFetchArticle(id, store) {
  const article = await store.getArticle(id);
  if (!article) throw new Error('ARTICLE_NOT_FOUND');

  if (article.readableContent) return { readableContent: article.readableContent };

  let html;
  try {
    html = await fetchText(article.url);
  } catch (e) {
    return { readableContent: null, error: 'NETWORK_ERROR' };
  }

  const domParser = new DOMParser();
  const doc = domParser.parseFromString(html, 'text/html');
  // Set base URI so Readability resolves relative URLs
  const base = doc.createElement('base');
  base.href = article.url;
  doc.head.prepend(base);

  let readableContent = null;
  try {
    const reader = new Readability(doc);
    const parsed = reader.parse();
    readableContent = parsed ? parsed.content : null;
  } catch (e) {
    // Extraction failed — caller falls back to summary
  }

  if (readableContent) {
    await store.updateArticle(id, { readableContent });
  }

  return { readableContent };
}

async function handleMarkRead(id, store) {
  await store.updateArticle(id, { readAt: Date.now() });
  return { ok: true };
}

async function handleGetFeeds(store) {
  const feeds = await store.getFeeds();
  return { feeds };
}

async function handleGetArticles(sort = 'time', store) {
  const articles = await store.getArticles();

  if (sort === 'time') {
    articles.sort((a, b) => b.publishedAt - a.publishedAt);
  } else if (sort === 'domain') {
    articles.sort((a, b) => {
      if (a.feedId !== b.feedId) return a.feedId - b.feedId;
      return b.publishedAt - a.publishedAt;
    });
  }

  return { articles };
}

async function handleUpdateFeedTags(id, tags, store) {
  await store.updateFeed(id, { tags });
  return { ok: true };
}

// --- Helpers ---

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

function faviconUrl(siteUrl) {
  try {
    const origin = new URL(siteUrl).origin;
    return `${origin}/favicon.ico`;
  } catch {
    return null;
  }
}

// Clear private store when the last incognito window closes.
chrome.windows.onRemoved.addListener(async () => {
  const allWindows = await chrome.windows.getAll();
  const hasPrivate = allWindows.some(w => w.incognito);
  if (!hasPrivate) {
    await chrome.storage.session.set({ private_feeds: [], private_articles: [] });
  }
});
