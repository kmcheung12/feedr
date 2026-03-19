// tests/parser.test.js
// Copy lib/parser.js content into scope for testing (no ES modules in MV2).
// We load it by reading the file and using eval — keeps parser.js dependency-free.

const fs = require('fs');
const path = require('path');

// Load parser into scope
eval(fs.readFileSync(path.join(__dirname, '../lib/parser.js'), 'utf8'));

const RSS_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Blog</title>
    <link>https://example.com</link>
    <description>A test feed</description>
    <item>
      <title>First Post</title>
      <link>https://example.com/first</link>
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
      <description>Summary of first post</description>
      <author>alice@example.com</author>
    </item>
    <item>
      <title>Second Post</title>
      <link>https://example.com/second</link>
      <pubDate>Tue, 02 Jan 2024 00:00:00 GMT</pubDate>
      <description>Summary of second post</description>
    </item>
  </channel>
</rss>`;

const ATOM_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Test Feed</title>
  <link href="https://atom-example.com"/>
  <entry>
    <title>Atom Entry One</title>
    <link href="https://atom-example.com/one"/>
    <published>2024-03-01T10:00:00Z</published>
    <summary>Atom summary one</summary>
    <author><name>Bob</name></author>
  </entry>
</feed>`;

const INVALID_FIXTURE = `<html><body>Not a feed</body></html>`;

describe('parseFeed — RSS 2.0', () => {
  let result;
  beforeAll(() => { result = parseFeed(RSS_FIXTURE); });

  test('returns feedMeta with title', () => {
    expect(result.feedMeta.title).toBe('Test Blog');
  });
  test('returns feedMeta with siteUrl', () => {
    expect(result.feedMeta.siteUrl).toBe('https://example.com');
  });
  test('returns correct number of articles', () => {
    expect(result.articles).toHaveLength(2);
  });
  test('article has correct title', () => {
    expect(result.articles[0].title).toBe('First Post');
  });
  test('article has correct url', () => {
    expect(result.articles[0].url).toBe('https://example.com/first');
  });
  test('article has publishedAt as number', () => {
    expect(typeof result.articles[0].publishedAt).toBe('number');
    expect(result.articles[0].publishedAt).toBeGreaterThan(0);
  });
  test('article has summary', () => {
    expect(result.articles[0].summary).toBe('Summary of first post');
  });
  test('article has author', () => {
    expect(result.articles[0].author).toBe('alice@example.com');
  });
  test('article without author has null author', () => {
    expect(result.articles[1].author).toBeNull();
  });
});

describe('parseFeed — Atom 1.0', () => {
  let result;
  beforeAll(() => { result = parseFeed(ATOM_FIXTURE); });

  test('returns feedMeta with title', () => {
    expect(result.feedMeta.title).toBe('Atom Test Feed');
  });
  test('returns feedMeta with siteUrl', () => {
    expect(result.feedMeta.siteUrl).toBe('https://atom-example.com');
  });
  test('returns correct number of entries', () => {
    expect(result.articles).toHaveLength(1);
  });
  test('entry has correct title', () => {
    expect(result.articles[0].title).toBe('Atom Entry One');
  });
  test('entry has correct url', () => {
    expect(result.articles[0].url).toBe('https://atom-example.com/one');
  });
  test('entry has publishedAt as number', () => {
    expect(typeof result.articles[0].publishedAt).toBe('number');
  });
  test('entry has summary', () => {
    expect(result.articles[0].summary).toBe('Atom summary one');
  });
  test('entry has author', () => {
    expect(result.articles[0].author).toBe('Bob');
  });
});

describe('parseFeed — invalid input', () => {
  test('throws NOT_A_FEED for HTML', () => {
    expect(() => parseFeed(INVALID_FIXTURE)).toThrow('NOT_A_FEED');
  });
  test('throws NOT_A_FEED for empty string', () => {
    expect(() => parseFeed('')).toThrow('NOT_A_FEED');
  });
});

describe('parseFeed — RSS 2.0 guid URL fallback', () => {
  function makeRss(itemXml) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>T</title>
    <link>https://example.com</link>
    ${itemXml}
  </channel>
</rss>`;
  }

  test('guid with no isPermaLink attr and no link → url equals guid value', () => {
    const xml = makeRss(`
      <item>
        <title>Post</title>
        <guid>https://example.com/post-1</guid>
      </item>`);
    const result = parseFeed(xml);
    expect(result.articles[0].url).toBe('https://example.com/post-1');
  });

  test('guid isPermaLink="true" and no link → url equals guid value', () => {
    const xml = makeRss(`
      <item>
        <title>Post</title>
        <guid isPermaLink="true">https://example.com/post-2</guid>
      </item>`);
    const result = parseFeed(xml);
    expect(result.articles[0].url).toBe('https://example.com/post-2');
  });

  test('guid isPermaLink="false" and no link → url is null', () => {
    const xml = makeRss(`
      <item>
        <title>Post</title>
        <guid isPermaLink="false">https://example.com/post-3</guid>
      </item>`);
    const result = parseFeed(xml);
    expect(result.articles[0].url).toBeNull();
  });

  test('guid is a URN with no isPermaLink attr and no link → url is null', () => {
    const xml = makeRss(`
      <item>
        <title>Post</title>
        <guid>urn:uuid:abc123</guid>
      </item>`);
    const result = parseFeed(xml);
    expect(result.articles[0].url).toBeNull();
  });

  test('guid isPermaLink="true" is a URN and no link → url is null', () => {
    const xml = makeRss(`
      <item>
        <title>Post</title>
        <guid isPermaLink="true">urn:uuid:def456</guid>
      </item>`);
    const result = parseFeed(xml);
    expect(result.articles[0].url).toBeNull();
  });

  test('guid isPermaLink="true" wins over link', () => {
    const xml = makeRss(`
      <item>
        <title>Post</title>
        <link>https://example.com/post</link>
        <guid isPermaLink="true">https://example.com/other</guid>
      </item>`);
    const result = parseFeed(xml);
    expect(result.articles[0].url).toBe('https://example.com/other');
  });

  test('no guid and no link → url is null', () => {
    const xml = makeRss(`
      <item>
        <title>Post</title>
      </item>`);
    const result = parseFeed(xml);
    expect(result.articles[0].url).toBeNull();
  });
});
