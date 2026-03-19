// lib/constants.js
// Shared message type constants used by background.js, newtab.js, and popup.js.
// Loaded as a plain script in all contexts (no ES modules in MV2 background scripts).

var MSG = {
  ADD_FEED:          'ADD_FEED',
  REMOVE_FEED:       'REMOVE_FEED',
  FETCH_FEED:        'FETCH_FEED',
  FETCH_ARTICLE:     'FETCH_ARTICLE',
  MARK_READ:         'MARK_READ',
  GET_FEEDS:         'GET_FEEDS',
  GET_ARTICLES:      'GET_ARTICLES',
  UPDATE_FEED_TAGS:  'UPDATE_FEED_TAGS',
};
