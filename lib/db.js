// lib/db.js
// Promise-based wrapper around IndexedDB.
// Exposes a global `db` object used by background.js.

var db = (() => {
  const DB_NAME = 'feedr';
  const DB_VERSION = 1;
  let _db = null;

  function open() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const database = e.target.result;
        if (!database.objectStoreNames.contains('feeds')) {
          const feedsStore = database.createObjectStore('feeds', { keyPath: 'id', autoIncrement: true });
          feedsStore.createIndex('url', 'url', { unique: true });
        }
        if (!database.objectStoreNames.contains('articles')) {
          const articlesStore = database.createObjectStore('articles', { keyPath: 'id', autoIncrement: true });
          articlesStore.createIndex('feedId', 'feedId', { unique: false });
          articlesStore.createIndex('url', 'url', { unique: true });
          articlesStore.createIndex('publishedAt', 'publishedAt', { unique: false });
        }
      };
      req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  function tx(storeName, mode, fn) {
    return open().then(database => new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      const req = fn(store);
      transaction.oncomplete = () => resolve(req ? req.result : undefined);
      transaction.onerror = (e) => reject(e.target.error);
    }));
  }

  // Feeds
  function addFeed(feed) {
    return tx('feeds', 'readwrite', store => store.add(feed));
  }

  function removeFeed(id) {
    return tx('feeds', 'readwrite', store => store.delete(id)).then(() =>
      tx('articles', 'readwrite', store => {
        const index = store.index('feedId');
        const req = index.openCursor(IDBKeyRange.only(id));
        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) { cursor.delete(); cursor.continue(); }
        };
        return req;
      })
    );
  }

  function getFeeds() {
    return open().then(database => new Promise((resolve, reject) => {
      const transaction = database.transaction('feeds', 'readonly');
      const store = transaction.objectStore('feeds');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e.target.error);
    }));
  }

  function updateFeed(id, patch) {
    return open().then(database => new Promise((resolve, reject) => {
      const transaction = database.transaction('feeds', 'readwrite');
      const store = transaction.objectStore('feeds');
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        if (!getReq.result) {
          reject(new Error('NOT_FOUND'));
          return;
        }
        const updated = Object.assign({}, getReq.result, patch);
        store.put(updated);
        transaction.oncomplete = () => resolve(updated);
        transaction.onerror = (e) => reject(e.target.error);
      };
    }));
  }

  function getFeedByUrl(url) {
    return open().then(database => new Promise((resolve, reject) => {
      const transaction = database.transaction('feeds', 'readonly');
      const index = transaction.objectStore('feeds').index('url');
      const req = index.get(url);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = (e) => reject(e.target.error);
    }));
  }

  // Articles
  function upsertArticles(articles) {
    // Insert each article; skip if URL already exists (dedup by url).
    return open().then(database => new Promise((resolve, reject) => {
      if (articles.length === 0) { resolve([]); return; }
      const transaction = database.transaction('articles', 'readwrite');
      const store = transaction.objectStore('articles');
      const urlIndex = store.index('url');
      const inserted = [];
      articles.forEach(article => {
        const checkReq = urlIndex.getKey(article.url);
        checkReq.onsuccess = () => {
          if (checkReq.result == null) {
            const addReq = store.add(article);
            addReq.onsuccess = () => inserted.push(addReq.result);
          }
        };
      });
      transaction.oncomplete = () => resolve(inserted);
      transaction.onerror = (e) => reject(e.target.error);
    }));
  }

  function getArticles() {
    return open().then(database => new Promise((resolve, reject) => {
      const transaction = database.transaction('articles', 'readonly');
      const req = transaction.objectStore('articles').getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e.target.error);
    }));
  }

  function getArticle(id) {
    return open().then(database => new Promise((resolve, reject) => {
      const transaction = database.transaction('articles', 'readonly');
      const req = transaction.objectStore('articles').get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = (e) => reject(e.target.error);
    }));
  }

  function updateArticle(id, patch) {
    return open().then(database => new Promise((resolve, reject) => {
      const transaction = database.transaction('articles', 'readwrite');
      const store = transaction.objectStore('articles');
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        if (!getReq.result) {
          reject(new Error('NOT_FOUND'));
          return;
        }
        const updated = Object.assign({}, getReq.result, patch);
        store.put(updated);
        transaction.oncomplete = () => resolve(updated);
        transaction.onerror = (e) => reject(e.target.error);
      };
    }));
  }

  return { addFeed, removeFeed, getFeeds, updateFeed, getFeedByUrl, upsertArticles, getArticles, getArticle, updateArticle };
})();
