// zf-library-view.js -- the Library view: saved zines, examples, storage
// meter, per-card actions. Extracted from the inline <script> in index.html.
// NOTE: this is the VIEW component. The storage backend lives separately in
// /js/zine-library.js (window.ZFLibrary). Classic script; reads the shared
// store from window.ZF_STORE (set by zf-store.js, which must load first).
(function () {
  'use strict';

  var store = window.ZF_STORE;

  function zfRelativeTime(ts) {
    if (!ts) return '';
    var d = Date.now() - ts;
    var min = Math.floor(d / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return min + 'm ago';
    var hr = Math.floor(min / 60);
    if (hr < 24) return hr + 'h ago';
    var day = Math.floor(hr / 24);
    if (day < 30) return day + 'd ago';
    return new Date(ts).toLocaleDateString();
  }

  var ZineLibrary = {
    name: 'ZineLibrary',
    data: function () {
      return { store: store, examples: [] };
    },
    created: function () {
      var self = this;
      fetch('zines/index.json')
        .then(function (r) { return r.ok ? r.json() : { examples: [] }; })
        .then(function (data) { self.examples = (data && data.examples) || []; })
        .catch(function () { self.examples = []; });
    },
    computed: {
      entries: function () {
        // Sort by updatedAt desc
        return (store.library || []).slice().sort(function (a, b) {
          return (b.updatedAt || 0) - (a.updatedAt || 0);
        });
      }
    },
    methods: {
      loadExample: function (file) { if (window.zfLoadExample) window.zfLoadExample(file); },
      clearLibrary: function () {
        if (!window.ZFLibrary) return;
        var count = (store.library || []).length;
        if (!count) return;
        if (!confirm('Delete all ' + count + ' saved zines from your library? This cannot be undone.')) return;
        window.ZFLibrary.clearAll();
        store.library = window.ZFLibrary.list();
        if (store.currentZineId && !window.ZFLibrary.get(store.currentZineId)) store.currentZineId = null;
      },
      newZineClick: function () { if (window.ZFNewZine) window.ZFNewZine(); },
      openZine: function (id) { store.loadFromLibrary(id); },
      duplicate: function (id) { store.duplicateInLibrary(id); },
      remove: function (id) { store.deleteFromLibrary(id); },
      exportZine: function (id) {
        var rec = window.ZFLibrary ? window.ZFLibrary.get(id) : null;
        if (!rec) return;
        var payload = {
          specVersion: '1.0',
          app: 'Zine Forge',
          exported: new Date().toISOString(),
          title: rec.title,
          author: rec.author,
          modelId: rec.modelId,
          themeId: rec.themeId,
          pages: rec.pages
        };
        var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        var safe = (rec.title || 'zine').replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/^-|-$/g, '') || 'zine';
        a.href = url;
        a.download = safe + '.zine.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      },
      previewPage: function (rec) {
        // First page of a saved record, for the card thumbnail.
        if (!rec || !Array.isArray(rec.pages) || !rec.pages.length) return null;
        return rec.pages[0];
      },
      previewPageStyle: function (rec) {
        // A tiny themed mini-page. Font-size drives all the em units.
        var base = this.previewStyle(rec);
        base.fontSize = '4px';
        return base;
      },
      previewStyle: function (rec) {
        if (!window.ZFThemes) return {};
        var t = window.ZFThemes.getTheme(rec.themeId || 'classic');
        return {
          background: t.paperBg,
          color: t.inkColor,
          fontFamily: t.headingFont
        };
      },
      metaLine: function (rec) {
        var pages = (rec.pages || []).length;
        var modelLabel = '';
        if (window.ZFModels && rec.modelId) {
          modelLabel = window.ZFModels.getModel(rec.modelId).label;
        }
        var when = zfRelativeTime(rec.updatedAt);
        return pages + ' page' + (pages === 1 ? '' : 's') + ' \u00b7 ' + (modelLabel || 'zine') + (when ? ' \u00b7 ' + when : '');
      },
      storageUsedMb: function () {
        var bytes = (window.ZFLibrary) ? window.ZFLibrary.approximateSize() : 0;
        return (bytes / (1024 * 1024)).toFixed(2);
      },
      storagePct: function () {
        var bytes = (window.ZFLibrary) ? window.ZFLibrary.approximateSize() : 0;
        var cap = 5 * 1024 * 1024;
        return Math.min(100, Math.round(100 * bytes / cap));
      },
      storageClass: function () {
        var p = this.storagePct();
        if (p >= 80) return 'over';
        if (p >= 60) return 'warn';
        return '';
      }
    },
    template:
      '<div class="zf-library">' +
        '<div class="zf-library-header">' +
          '<div>' +
            '<h2>Your library</h2>' +
            '<div class="zf-muted">{{ entries.length }} saved zine<span v-if="entries.length !== 1">s</span> in this browser.</div>' +
            '<div class="zf-muted" style="margin-top:0.25rem;display:flex;align-items:center;gap:0.5rem;">' +
              '<span>Storage: {{ storageUsedMb() }} MB of ~5 MB used</span>' +
              '<span class="zf-budget-bar" :class="storageClass()" style="width:120px;">' +
                '<div :style="{ width: storagePct() + \'%\' }"></div>' +
              '</span>' +
            '</div>' +
            '<div v-if="storagePct() >= 80" class="zf-muted" style="color:var(--zf-red);margin-top:0.25rem;">' +
              'Storage is getting full. Export and delete old zines to free space.' +
            '</div>' +
          '</div>' +
'<div class="zf-header-actions" style="gap:0.5rem;">' +
        '<button class="zf-btn zf-btn-primary" @click="newZineClick()">New zine</button>' +
        '<button v-if="entries.length" class="zf-btn" style="border-color:var(--zf-border);color:var(--zf-red);" @click="clearLibrary()">Delete all</button>' +
      '</div>' +
        '</div>' +

        '<div v-if="examples.length" class="zf-examples">' +
          '<h3 class="zf-examples-title">Examples</h3>' +
          '<div class="zf-muted" style="margin-bottom:0.5rem;">Try a finished zine, then make it your own.</div>' +
          '<div class="zf-library-grid">' +
            '<div v-for="ex in examples" :key="ex.id" class="zf-lib-card">' +
              '<div class="zf-lib-preview" style="background:var(--zf2-wash-2);">' +
                '<span>{{ ex.title }}</span>' +
              '</div>' +
              '<div class="zf-lib-body">' +
                '<div class="zf-lib-title">{{ ex.title }}</div>' +
                '<div class="zf-lib-meta">{{ ex.blurb }}</div>' +
              '</div>' +
              '<div class="zf-lib-actions">' +
                '<button class="primary" @click="loadExample(ex.file)">Load</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div v-if="!entries.length" class="zf-empty">' +
          'No saved zines yet. Start writing in the editor and your draft will appear here automatically.' +
        '</div>' +

        '<div v-else class="zf-library-grid">' +
          '<div v-for="rec in entries" :key="rec.id" class="zf-lib-card">' +
            '<div class="zf-lib-preview zf-lib-thumb" :style="previewStyle(rec)">' +
              '<div class="zf-lib-thumb-page" :style="previewPageStyle(rec)" v-if="previewPage(rec)">' +
                '<div class="zf-lib-thumb-heading">{{ previewPage(rec).heading }}</div>' +
                '<div class="zf-lib-thumb-body" v-html="previewPage(rec).body"></div>' +
              '</div>' +
              '<span v-if="!previewPage(rec)">{{ rec.title || \'Untitled Zine\' }}</span>' +
            '</div>' +
            '<div class="zf-lib-body">' +
              '<div class="zf-lib-title">{{ rec.title || \'Untitled Zine\' }}</div>' +
              '<div class="zf-lib-meta">{{ metaLine(rec) }}</div>' +
            '</div>' +
            '<div class="zf-lib-actions">' +
              '<button class="primary" @click="openZine(rec.id)">Open</button>' +
              '<button @click="duplicate(rec.id)">Copy</button>' +
              '<button @click="exportZine(rec.id)">Export</button>' +
              '<button class="danger" @click="remove(rec.id)">Delete</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>'
  };

  window.ZineLibrary = ZineLibrary;
})();