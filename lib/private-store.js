// lib/private-store.js
// Ephemeral feed/article store backed by chrome.storage.session.
// Implements the same interface as lib/db.js.
// Background service worker only — loaded via importScripts() in background.js.

var privateStore = (() => {
  const FEEDS_KEY    = 'private_feeds';
  const ARTICLES_KEY = 'private_articles';

  async function load(key) {
    const result = await chrome.storage.session.get(key);
    return result[key] || [];
  }

  async function save(key, items) {
    await chrome.storage.session.set({ [key]: items });
  }

  // Math.max(0, ...) guards against empty-array → -Infinity edge case.
  function nextId(items) {
    return Math.max(0, ...items.map(i => i.id)) + 1;
  }

  async function addFeed(feed) {
    const feeds = await load(FEEDS_KEY);
    const id = nextId(feeds);
    feeds.push(Object.assign({}, feed, { id }));
    await save(FEEDS_KEY, feeds);
    return id;
  }

  async function removeFeed(id) {
    const [feeds, articles] = await Promise.all([load(FEEDS_KEY), load(ARTICLES_KEY)]);
    await Promise.all([
      save(FEEDS_KEY,    feeds.filter(f => f.id !== id)),
      save(ARTICLES_KEY, articles.filter(a => a.feedId !== id)),
    ]);
  }

  async function getFeeds() {
    return load(FEEDS_KEY);
  }

  async function updateFeed(id, patch) {
    const feeds = await load(FEEDS_KEY);
    const idx = feeds.findIndex(f => f.id === id);
    if (idx === -1) throw new Error('NOT_FOUND');
    feeds[idx] = Object.assign({}, feeds[idx], patch);
    await save(FEEDS_KEY, feeds);
    return feeds[idx];
  }

  async function getFeedByUrl(url) {
    const feeds = await load(FEEDS_KEY);
    return feeds.find(f => f.url === url) || null;
  }

  async function upsertArticles(newArticles) {
    if (newArticles.length === 0) return [];
    const articles = await load(ARTICLES_KEY);
    const existingUrls = new Set(articles.map(a => a.url));
    const insertedIds = [];
    for (const article of newArticles) {
      if (!existingUrls.has(article.url)) {
        const id = nextId(articles); // articles grows each iteration — IDs stay unique
        articles.push(Object.assign({}, article, { id }));
        insertedIds.push(id);
        existingUrls.add(article.url);
      }
    }
    await save(ARTICLES_KEY, articles);
    return insertedIds;
  }

  async function getArticles() {
    return load(ARTICLES_KEY);
  }

  async function getArticle(id) {
    const articles = await load(ARTICLES_KEY);
    return articles.find(a => a.id === id) || null;
  }

  async function updateArticle(id, patch) {
    const articles = await load(ARTICLES_KEY);
    const idx = articles.findIndex(a => a.id === id);
    if (idx === -1) throw new Error('NOT_FOUND');
    articles[idx] = Object.assign({}, articles[idx], patch);
    await save(ARTICLES_KEY, articles);
    return articles[idx];
  }

  return {
    addFeed, removeFeed, getFeeds, updateFeed, getFeedByUrl,
    upsertArticles, getArticles, getArticle, updateArticle,
  };
})();
