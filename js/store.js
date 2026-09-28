// Zine Forge - shared reactive store (classic script, attaches window.ZFStore)
(function () {
  var reactive = window.Vue.reactive;

  var STORAGE_KEY = 'zine-forge-draft-v1';

  function emptyPage() {
    return {
      id: 'p' + Math.random().toString(36).slice(2, 9),
      heading: '',
      body: '',
      image: ''
    };
  }

  function loadFromStorage() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.pages) && parsed.pages.length) return parsed;
    } catch (e) { console.warn('Could not load draft', e); }
    return null;
  }

  var saved = loadFromStorage();
  var initialPages = (saved && saved.pages && saved.pages.length) ? saved.pages : [emptyPage()];

  var store = reactive({
    title: saved ? saved.title : 'Untitled Zine',
    author: saved ? saved.author : '',
    pages: initialPages,
    activePageId: initialPages[0].id,
    view: 'editor',
    status: '',

    activePage: function () {
      var id = this.activePageId;
      var found = this.pages.find(function (p) { return p.id === id; });
      return found || this.pages[0];
    },

    activeIndex: function () {
      var id = this.activePageId;
      return this.pages.findIndex(function (p) { return p.id === id; });
    },

    addPage: function () {
      var p = emptyPage();
      this.pages.push(p);
      this.activePageId = p.id;
    },

    duplicatePage: function (id) {
      var idx = this.pages.findIndex(function (p) { return p.id === id; });
      if (idx < 0) return;
      var src = this.pages[idx];
      var copy = { id: 'p' + Math.random().toString(36).slice(2, 9),
                   heading: src.heading, body: src.body, image: src.image };
      this.pages.splice(idx + 1, 0, copy);
      this.activePageId = copy.id;
    },

    deletePage: function (id) {
      if (this.pages.length <= 1) return;
      var idx = this.pages.findIndex(function (p) { return p.id === id; });
      if (idx < 0) return;
      this.pages.splice(idx, 1);
      var next = this.pages[Math.min(idx, this.pages.length - 1)];
      this.activePageId = next.id;
    },

    movePage: function (id, dir) {
      var idx = this.pages.findIndex(function (p) { return p.id === id; });
      if (idx < 0) return;
      var target = idx + dir;
      if (target < 0 || target >= this.pages.length) return;
      var item = this.pages.splice(idx, 1)[0];
      this.pages.splice(target, 0, item);
    },

    saveDraft: function () {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          title: this.title, author: this.author, pages: this.pages
        }));
        this.status = 'Draft saved.';
        var self = this;
        setTimeout(function () {
          if (self.status === 'Draft saved.') self.status = '';
        }, 2000);
      } catch (e) { this.status = 'Could not save draft.'; }
    },

    newZine: function () {
      this.title = 'Untitled Zine';
      this.author = '';
      this.pages = [emptyPage()];
      this.activePageId = this.pages[0].id;
      this.view = 'editor';
      this.status = 'Started a new zine.';
    },

    setView: function (v) { this.view = v; }
  });

  window.ZFStore = store;
})();