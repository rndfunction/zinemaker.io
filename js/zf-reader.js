// zf-reader.js -- the reader (Read) view: paginated preview of the zine.
// Extracted from the inline <script> in index.html. Classic script; reads
// the shared store from window.ZF_STORE (set by zf-store.js, which must
// load first). Uses zfElementStyle / zfTextBoxStyle (util.js) and
// window.ZFModels / window.ZFThemes.
(function () {
  'use strict';

  if (typeof zfAssertDeps === 'function') zfAssertDeps('zf-reader', ['ZF_STORE', 'ZFModels', 'ZFThemes', 'zfElementStyle', 'zfTextBoxStyle']);

  var store = window.ZF_STORE;

  var ZF_READER_METHODS = {
    next: function () { if (this.currentIndex < this.total - 1) this.currentIndex++; },
    prev: function () { if (this.currentIndex > 0) this.currentIndex--; },
    printZine: function () { window.print(); },
    shareLink: function () {
      var self = this;
      try {
        // Share the rich page content (images + text boxes), since text
        // lives in text boxes now. Each page is encoded as {tb, im}.
        // (Legacy {h,b,i} compact links are still handled by the loader
        // for links already shared with the old format.)
        var payload = { t: store.title, a: store.author, p: store.pages.map(function (p) {
          return {
            tb: Array.isArray(p.textBoxes) ? p.textBoxes : [],
            im: Array.isArray(p.images) ? p.images : []
          };
        }) };
        var b64 = zfB64EncodeUtf8(JSON.stringify(payload));
        var url = location.origin + location.pathname + "#z=" + b64;
        var done = function (msg) { self.shareStatus = msg; setTimeout(function () { self.shareStatus = ""; }, 4000); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(
            function () { done("Share link copied to clipboard."); },
            function () { done("Copy this link: " + url); }
          );
        } else { done("Copy this link: " + url); }
      } catch (e) { this.shareStatus = "Could not build share link."; }
    },
      readerBlockImageStyleFor: function (img) {
        if (!img || !img.src) return {};
        var m = store.model();
        if (!m) return {};
        var base = zfElementStyle(img, m.page.width, m.page.height, store.modelMarginIn(), { block: true });
        base.borderRadius = "calc(0.02in * var(--zf-page-scale, 1))";
        return base;
      },
      readerFreeImageStyleFor: function (img) {
        if (!img) return {};
        // Decorative kinds have no src but still need position/size/rotation.
        var decorKinds = { tape: 1, scrap: 1, sticky: 1, sticker: 1 };
        if (!img.src && !decorKinds[img.kind]) return {};
        var m = store.model();
        if (!m) return {};
        return zfElementStyle(img, m.page.width, m.page.height, store.modelMarginIn(), {});
      },
      // Merge a decorative element's position style with its custom color
      // (hex from the color picker) so sticky notes and stickers recolor in
      // the reader view. Mirrors the editor and sheet components.
      stickyStyle: function (img, base) {
        var out = Object.assign({}, base || {});
        var safe = (img && typeof zfSafeColor === 'function') ? zfSafeColor(img.color) : '';
        if (safe) out['--zf-sticky-bg'] = safe;
        return out;
      },
      stickerStyle: function (img, base) {
        var out = Object.assign({}, base || {});
        var safe = (img && typeof zfSafeColor === 'function') ? zfSafeColor(img.color) : '';
        if (safe) out['--zf-sticker-bg'] = safe;
        return out;
      },
      readerTextBoxStyleFor: function (box) {
        if (!box) return {};
        var m = store.model();
        if (!m) return {};
        return zfTextBoxStyle(box, m.page.width, m.page.height, store.modelMarginIn());
      },
      // Flow-wrap is retired, and the reader has no inline body to wrap.
      // This is a no-op kept so the existing watch/mounted/updated hooks
      // that call injectReaderFlow() stay valid without hunting call sites.
      injectReaderFlow: function () {}
  };

  var ZineReader = {
    data: function () { return { store: store, currentIndex: 0, shareStatus: "" }; },
    computed: {
      total: function () { return store.pages.length; },
      page: function () { return store.pages[this.currentIndex] || store.pages[0]; },
      readerThemeStyle: function () {
        if (!window.ZFThemes || !store.theme()) return {};
        return window.ZFThemes.pageStyle(store.theme());
      },
      // bodyHtml computed removed (inline body retired).
      readerPageStyle: function () {
        var m = store.model();
        if (!m || !m.page) return {};
        var w = m.page.width;
        var h = m.page.height;
        var longSide = Math.max(w, h);
        var onscreenLong = 560;
        var screenScale = onscreenLong / longSide;
        var renderedW = w * screenScale;
        var renderedH = h * screenScale;
        var unit = m.page.unit || "in";
        var physicalInches = unit === "mm" ? w / 25.4 : w;
        var physicalCssPx = physicalInches * 96;
        var pageScale = renderedW / physicalCssPx;
        return {
          width: Math.round(renderedW) + "px",
          height: Math.round(renderedH) + "px",
          "--zf-page-scale": pageScale,
          "--zf-page-margin": store.modelMarginIn() + "in"
        };
      }
    },
    watch: {
      "store.view": function (v) {
        if (v === "reader") {
          var self = this;
          this.$nextTick(function () { self.injectReaderFlow(); });
        }
      },
      currentIndex: function () {
        var self = this;
        this.$nextTick(function () { self.injectReaderFlow(); });
      }
    },
    mounted: function () { this.injectReaderFlow(); },
    updated: function () { this.injectReaderFlow(); },
    methods: ZF_READER_METHODS,
    template: "#zine-reader-template"
  };

  window.ZineReader = ZineReader;
})();