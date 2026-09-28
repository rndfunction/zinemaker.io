// Zine Forge - local zine library (localStorage-backed)
// Stores named zine records in the browser. Not synced to any server.

(function () {
  var KEY = 'zine-forge-library-v1';

  function readAll() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed;
    } catch (e) {
      console.warn('Zine library read failed', e);
      return [];
    }
  }

  function writeAll(list) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      console.warn('Zine library write failed', e);
      return false;
    }
  }

  function list() {
    return readAll();
  }

  function get(id) {
    var all = readAll();
    for (var i = 0; i < all.length; i++) {
      if (all[i].id === id) return all[i];
    }
    return null;
  }

  // Insert or update a zine record. Expects {id, title, author, themeId,
  // modelId, pages, updatedAt}. Returns true on success.
  function upsert(record) {
    if (!record || !record.id) return false;
    var all = readAll();
    var idx = -1;
    for (var i = 0; i < all.length; i++) {
      if (all[i].id === record.id) { idx = i; break; }
    }
    var entry = {
      id: record.id,
      title: record.title || 'Untitled Zine',
      author: record.author || '',
      themeId: record.themeId || 'classic',
      modelId: record.modelId || 'mini-8',
      pages: (record.pages || []).map(function (p) {
        return { heading: p.heading || '', body: p.body || '', image: p.image || '' };
      }),
      updatedAt: record.updatedAt || Date.now()
    };
    if (idx >= 0) all[idx] = entry;
    else all.unshift(entry);
    return writeAll(all);
  }

  function remove(id) {
    var all = readAll();
    var next = all.filter(function (z) { return z.id !== id; });
    return writeAll(next);
  }

  function duplicate(id, newId) {
    var src = get(id);
    if (!src) return null;
    var copy = {
      id: newId || ('z-' + Math.random().toString(36).slice(2, 9)),
      title: src.title + ' (copy)',
      author: src.author,
      themeId: src.themeId,
      modelId: src.modelId,
      pages: src.pages.map(function (p) {
        return { heading: p.heading, body: p.body, image: p.image };
      }),
      updatedAt: Date.now()
    };
    var all = readAll();
    all.unshift(copy);
    writeAll(all);
    return copy;
  }

  // Returns the approximate size of the library in bytes (rough).
  function approximateSize() {
    try {
      var raw = localStorage.getItem(KEY) || '';
      return raw.length;
    } catch (e) { return 0; }
  }

  function newId() {
    return 'z-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  window.ZFLibrary = {
    list: list,
    get: get,
    upsert: upsert,
    remove: remove,
    duplicate: duplicate,
    approximateSize: approximateSize,
    newId: newId
  };
})();