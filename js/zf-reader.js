// zf-reader.js -- the reader (Read) view: paginated preview of the zine.
// Extracted from the inline <script> in index.html. Classic script; reads
// the shared store from window.ZF_STORE (set by zf-store.js, which must
// load first). Uses zfElementStyle / zfTextBoxStyle (util.js) and
// window.ZFModels / window.ZFThemes.
(function () {
  'use strict';

  var store = window.ZF_STORE;

  var ZF_READER_METHODS = {
    next: function () { if (this.currentIndex < this.total - 1) this.currentIndex++; },
    prev: function () { if (this.currentIndex > 0) this.currentIndex--; },
    printZine: function () { window.print(); },
    shareLink: function () {
      var self = this;
      try {
        var payload = { t: store.title, a: store.author, p: store.pages.map(function (p) { return { h: p.heading, b: p.body, i: p.image }; }) };
        var b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
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
        var base = zfElementStyle(img, m.page.width, m.page.height, store.marginIn, { block: true });
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
        return zfElementStyle(img, m.page.width, m.page.height, store.marginIn, {});
      },
      // Merge a decorative element's position style with its custom color
      // (hex from the color picker) so sticky notes and stickers recolor in
      // the reader view. Mirrors the editor and sheet components.
      stickyStyle: function (img, base) {
        var out = Object.assign({}, base || {});
        if (img && typeof img.color === 'string' && img.color.charAt(0) === '#') {
          out['--zf-sticky-bg'] = img.color;
        }
        return out;
      },
      stickerStyle: function (img, base) {
        var out = Object.assign({}, base || {});
        if (img && typeof img.color === 'string' && img.color.charAt(0) === '#') {
          out['--zf-sticker-bg'] = img.color;
        }
        return out;
      },
      readerTextBoxStyleFor: function (box) {
        if (!box) return {};
        var m = store.model();
        if (!m) return {};
        return zfTextBoxStyle(box, m.page.width, m.page.height, store.marginIn);
      },
      injectReaderFlow: function () {
        var self = this;
        this.$nextTick(function () {
          self._attemptReaderInject(0);
        });
      },
      _attemptReaderInject: function (attempt) {
        var self = this;
        if (attempt > 20) return;
        // Only retry while the reader view is actually active.
        if (store.view !== "reader") return;
        var el = self.$refs.bodyReader;
        if (!el) { self._schedReaderRetry(attempt); return; }
        var page = self.page;
        if (!page) { self._schedReaderRetry(attempt); return; }
        var rect = el.getBoundingClientRect();
        // If the reader isn't visible yet, wait and retry.
        if (rect.width < 20 || rect.height < 20) {
          self._schedReaderRetry(attempt);
          return;
        }
        var stale = el.querySelectorAll("[data-zf-spacer=\"1\"], [data-zf-flow-img=\"1\"]");
        for (var i = 0; i < stale.length; i++) stale[i].remove();
        // Support both the current multi-image model (page.images[] entries
        // with wrap === 'flow') and the legacy single-image fields
        // (page.image + page.imageWrap). The editor writes flow state to
        // page.images[].wrap, so keying only off the legacy fields meant
        // flow-wrap never fired in the reader for new-style pages.
        var flowImgs = [];
        if (Array.isArray(page.images) && page.images.length) {
          for (var fi = 0; fi < page.images.length; fi++) {
            if (page.images[fi].wrap === 'flow') flowImgs.push(page.images[fi]);
          }
        } else if (page.image && page.imageWrap === 'flow') {
          flowImgs.push({ src: page.image, x: page.imageX || 0, y: page.imageY || 0, w: page.imageW || 1.5, rot: page.imageRot || 0 });
        }
        if (!flowImgs.length) return;
        var m = store.model();
        if (!m) return;
        var longSide = Math.max(m.page.width, m.page.height);
        var pxPerIn = 560 / longSide;
        var bodyWIn = rect.width / pxPerIn;
        var bodyHIn = rect.height / pxPerIn;
        zfLog("reader inject: firing for page " + (self.currentIndex + 1) + " w=" + Math.round(rect.width) + " h=" + Math.round(rect.height));
        window.zfInjectMergedFlow(el, flowImgs, pxPerIn, bodyWIn, bodyHIn, { draggable: false });
      },
      _schedReaderRetry: function (attempt) {
        var self = this;
        setTimeout(function () { self._attemptReaderInject(attempt + 1); }, 80);
      }
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
      bodyHtml: function () {
        if (!this.page) return "";
        return this.page.body || "";
      },
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
          "--zf-page-margin": store.marginIn + "in"
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