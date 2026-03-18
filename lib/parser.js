// lib/parser.js
// Pure functions for parsing RSS 2.0 and Atom 1.0 feeds.
// Uses DOMParser (available in browser and jsdom environments).
// Exposes global: parseFeed(xmlString) → { feedMeta, articles }

function parseFeed(xmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'application/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) throw new Error('NOT_A_FEED');

  const root = doc.documentElement;

  if (root.tagName === 'rss') return parseRss(doc);
  if (root.tagName === 'feed') return parseAtom(doc);

  throw new Error('NOT_A_FEED');
}

function text(el, selector) {
  const found = el.querySelector(selector);
  return found ? (found.textContent || '').trim() || null : null;
}

function parseRss(doc) {
  const channel = doc.querySelector('channel');
  if (!channel) throw new Error('NOT_A_FEED');

  const feedMeta = {
    title:   text(channel, 'title'),
    siteUrl: text(channel, 'link'),
  };

  const items = Array.from(channel.querySelectorAll('item'));
  const articles = items.map(item => ({
    url:         text(item, 'link'),
    title:       text(item, 'title'),
    author:      text(item, 'author') || text(item, 'dc\\:creator') || null,
    publishedAt: parseDate(text(item, 'pubDate')),
    summary:     text(item, 'description'),
    readableContent: null,
    readAt: null,
  }));

  return { feedMeta, articles };
}

function parseAtom(doc) {
  const feed = doc.documentElement;

  // Walk direct children manually to avoid :scope issues in jsdom with namespaced docs
  let titleEl = null;
  let linkEl = null;
  const entries = [];

  for (const child of feed.childNodes) {
    if (child.nodeType !== 1) continue; // element nodes only
    const localName = child.localName;
    if (localName === 'title' && !titleEl) titleEl = child;
    if (localName === 'link' && !linkEl && child.getAttribute('href')) linkEl = child;
    if (localName === 'entry') entries.push(child);
  }

  const feedMeta = {
    title:   titleEl ? (titleEl.textContent || '').trim() || null : null,
    siteUrl: linkEl ? linkEl.getAttribute('href') : null,
  };

  const articles = entries.map(entry => {
    // Walk entry children manually for the same reason
    let entryTitle = null;
    let entryLink = null;
    let entryPublished = null;
    let entryUpdated = null;
    let entrySummary = null;
    let entryContent = null;
    let entryAuthorName = null;

    for (const child of entry.childNodes) {
      if (child.nodeType !== 1) continue;
      const localName = child.localName;
      if (localName === 'title' && !entryTitle) entryTitle = (child.textContent || '').trim() || null;
      if (localName === 'link' && !entryLink && child.getAttribute('href')) entryLink = child.getAttribute('href');
      if (localName === 'published' && !entryPublished) entryPublished = (child.textContent || '').trim() || null;
      if (localName === 'updated' && !entryUpdated) entryUpdated = (child.textContent || '').trim() || null;
      if (localName === 'summary' && !entrySummary) entrySummary = (child.textContent || '').trim() || null;
      if (localName === 'content' && !entryContent) entryContent = (child.textContent || '').trim() || null;
      if (localName === 'author' && !entryAuthorName) {
        // Find <name> child of <author>
        for (const authorChild of child.childNodes) {
          if (authorChild.nodeType === 1 && authorChild.localName === 'name') {
            entryAuthorName = (authorChild.textContent || '').trim() || null;
            break;
          }
        }
      }
    }

    return {
      url:         entryLink,
      title:       entryTitle,
      author:      entryAuthorName || null,
      publishedAt: parseDate(entryPublished || entryUpdated),
      summary:     entrySummary || entryContent,
      readableContent: null,
      readAt: null,
    };
  });

  return { feedMeta, articles };
}

function parseDate(dateStr) {
  if (!dateStr) return Date.now();
  const ts = Date.parse(dateStr);
  return isNaN(ts) ? Date.now() : ts;
}
