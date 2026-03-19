// background.js
// Persistent background script. Handles all messages from newtab.js and popup.js.
// Has access to: db (lib/db.js), parseFeed (lib/parser.js),
//               Readability (lib/Readability.js), MSG (lib/constants.js)

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message).then(sendResponse).catch(err => {
    console.error('[feedr background] error:', err);
    sendResponse({ error: err.message });
  });
  return true; // keep channel open for async response
});

async function handleMessage(message) {
  switch (message.type) {
    case MSG.ADD_FEED:      return handleAddFeed(message.url);
    case MSG.REMOVE_FEED:   return handleRemoveFeed(message.id);
    case MSG.FETCH_FEED:    return handleFetchFeed(message.id);
    case MSG.FETCH_ARTICLE: return handleFetchArticle(message.id);
    case MSG.MARK_READ:     return handleMarkRead(message.id);
    case MSG.GET_FEEDS:     return handleGetFeeds();
    case MSG.GET_ARTICLES:  return handleGetArticles(message.sort);
    case MSG.UPDATE_FEED_TAGS: return handleUpdateFeedTags(message.id, message.tags);
    default: throw new Error('UNKNOWN_MESSAGE_TYPE');
  }
}

async function handleAddFeed(url) {
  const existing = await db.getFeedByUrl(url);
  if (existing) throw new Error('FEED_EXISTS');

  const xml = await fetchText(url);
  const { feedMeta, articles } = parseFeed(xml); // throws NOT_A_FEED if invalid

  const feedId = await db.addFeed({
    url,
    title:       feedMeta.title || url,
    siteUrl:     feedMeta.siteUrl || null,
    favicon:     feedMeta.siteUrl ? faviconUrl(feedMeta.siteUrl) : null,
    lastFetched: Date.now(),
    addedAt:     Date.now(),
  });

  const withFeedId = articles.map(a => Object.assign({}, a, { feedId }));
  await db.upsertArticles(withFeedId);

  return { ok: true, feedId };
}

async function handleRemoveFeed(id) {
  await db.removeFeed(id);
  return { ok: true };
}

async function handleFetchFeed(id) {
  const feeds = await db.getFeeds();
  const feed = feeds.find(f => f.id === id);
  if (!feed) throw new Error('FEED_NOT_FOUND');

  let xml;
  try {
    xml = await fetchText(feed.url);
  } catch (e) {
    await db.updateFeed(id, { fetchError: e.message });
    throw new Error('NETWORK_ERROR');
  }

  let articles;
  try {
    ({ articles } = parseFeed(xml));
  } catch (e) {
    await db.updateFeed(id, { fetchError: e.message });
    throw e;
  }

  const withFeedId = articles.map(a => Object.assign({}, a, { feedId: id }));
  await db.upsertArticles(withFeedId);
  await db.updateFeed(id, { lastFetched: Date.now(), fetchError: null });

  return { ok: true };
}

async function handleFetchArticle(id) {
  const article = await db.getArticle(id);
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
    await db.updateArticle(id, { readableContent });
  }

  return { readableContent };
}

async function handleMarkRead(id) {
  await db.updateArticle(id, { readAt: Date.now() });
  return { ok: true };
}

async function handleGetFeeds() {
  const feeds = await db.getFeeds();
  return { feeds };
}

async function handleGetArticles(sort = 'time') {
  const articles = await db.getArticles();

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

async function handleUpdateFeedTags(id, tags) {
  await db.updateFeed(id, { tags });
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
