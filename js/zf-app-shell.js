// zf-app-shell.js -- top-level app shell: masthead, view tabs, New Zine
// modal, and the slide-in settings panel. Extracted from the inline
// <script> in index.html. Classic script; reads the shared store from
// window.ZF_STORE (set by zf-store.js, which must load first).
(function () {
  'use strict';

  if (typeof zfAssertDeps === 'function') zfAssertDeps('zf-app-shell', ['ZF_STORE', 'ZFModels', 'ZFThemes']);

  var store = window.ZF_STORE;

  var AppShell = {
    // `nowTick` bumps every second so the savedLabel computed re-evaluates.
    // Date.now() is not reactive on its own, so without this the "Saved Ns
    // ago" label froze at whatever value it had when lastSavedAt changed.
    data: function () {
      return {
        store: store,
        tick: 0,
        nowTick: 0,
        // Share dialog visibility. Belongs in `data`, not `methods`: Vue
        // treats a non-function entry in `methods` as a mistake ("Method
        // 'shareOpen' has type boolean") and then cannot find the property
        // during render. This is the ONLY state the dialog needs up front;
        // link availability is checked on click (see shareAsLink), not
        // precomputed, because serializing the zine to open a menu is too
        // slow on image-heavy drafts.
    shareOpen: false,
    // True while a PDF is being generated. Drives a full-screen "Preparing
    // your PDF…" modal that covers the sheet view (which is visible during
    // the html2canvas raster). Without this the sheet view flashed on screen
    // for 1-2 seconds, which felt like a bug rather than a progress state.
    pdfExporting: false,
      };
    },
    mounted: function () {
      var self = this;
      this._savedLabelTimer = setInterval(function () { self.nowTick++; }, 1000);
    },
    beforeUnmount: function () {
      if (this._savedLabelTimer) clearInterval(this._savedLabelTimer);
    },
    computed: {
      canUndo: function () {
        // Tie to the reactive tick so this recomputes when history changes.
        var _ = this.tick;
        return window.ZFCanUndo ? window.ZFCanUndo() : false;
      },
      canRedo: function () {
        var _ = this.tick;
        return window.ZFCanRedo ? window.ZFCanRedo() : false;
      },

      savedLabel: function () {
        // Read nowTick so this recomputes once per second (see data/mounted).
        var _ = this.nowTick;
        var t = store.lastSavedAt;
        if (!t) return '';
        var secs = Math.floor((Date.now() - t) / 1000);
        if (secs < 5) return 'Saved';
        if (secs < 60) return 'Saved ' + secs + 's ago';
        var mins = Math.floor(secs / 60);
        if (mins < 60) return 'Saved ' + mins + 'm ago';
        return 'Saved';
      },
      // Model list for the pickers. Experimental models are excluded so a
      // user cannot select an unverified imposition by accident; any zine
      // already using one still resolves via getModel().
      models: function () {
        if (!window.ZFModels) return [];
        return window.ZFModels.listSelectableModels
          ? window.ZFModels.listSelectableModels()
          : window.ZFModels.listModels();
      },
      themes: function () { return (window.ZFThemes) ? window.ZFThemes.listThemes() : []; }
    },
    methods: {
      onExport: function () { if (window.ZFExportJson) window.ZFExportJson(); },
    // Share dialog state. There is no precomputed link-availability field
    // Share dialog. Three doors to the same zine: a PDF (the modern
    // photocopy), the source file (for remixing), and a link (for small
    // zines). All three reuse machinery that already exists -- PDF is the
    // print view, source is the export path, link is the #z= encoder.
    openShare: function () {
      // No serialization here. Opening a menu must feel instant; the size
      // check for the link door happens on click (see shareAsLink), which is
      // where a user expects a moment of work.
      this.shareOpen = true;
    },
    closeShare: function () { this.shareOpen = false; },
    shareAsPdf: function () {
      this.shareOpen = false;
      // Stage 3a: WYSIWYG raster. The exporter needs the sheet view rendered
      // in the DOM to photograph it. So we switch views for the duration,
      // show a "Preparing your PDF" modal (which covers the flash), then
      // restore the previous view. If anything fails, we fall back to the
      // print view so the user is never stuck.
      var self = this;
      var exporter = window.ZFExportPdf;
      if (typeof exporter !== 'function') { this.goSheet(); return; }

      var prevView = this.store.view;
      this.store.status = 'Preparing your PDF\u2026';
      this.pdfExporting = true;
      this.store.view = 'sheet';

      // Yield once so the sheet renders into the DOM before we try to
      // photograph it. The exporter also waits internally, but doing it here
      // ensures the modal-over-sheet is painted in the same frame.
      this.$nextTick().then(function () {
        return exporter();
      }).then(function (blob) {
        self.store.view = prevView;
        self.store.status = '';
        self.pdfExporting = false;
        try {
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url; a.download = ((self.store.title || 'zine') + '.pdf');
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
          self.store.status = 'PDF ready.';
          setTimeout(function () { if (self.store.status === 'PDF ready.') self.store.status = ''; }, 2000);
        } catch (e) {
          self.store.status = 'Could not save PDF.';
        }
      }).catch(function (err) {
        self.store.view = prevView;
        self.store.status = '';
        self.pdfExporting = false;
        try { if (typeof zfLog === 'function') zfLog('PDF export failed: ' + (err && err.message ? err.message : String(err))); } catch (e) {}
        // Fall back to the print view so the user can still get a PDF.
        self.goSheet();
      });
    },
    shareAsSource: function () {
      this.shareOpen = false;
      this.onExport();
    },
    // Build the #z= link payload from the current store. The format the reader
    // (loadSharedZineFromHash in zf-boot.js) accepts is { t, a, p: [{tb,im}] }.
    // We emit the rich format so all element detail survives; text boxes and
    // images are passed as-is (zfBuildPagesFromData handles migration/fields).
    _buildShareUrl: function () {
      try {
        var pages = (this.store.pages || []).map(function (p) {
          return {
            tb: Array.isArray(p.textBoxes) ? p.textBoxes : [],
            im: Array.isArray(p.images) ? p.images : []
          };
        });
        var payload = { t: this.store.title || '', a: this.store.author || '', p: pages };
        var json = JSON.stringify(payload);
        var b64 = window.zfB64EncodeUtf8 ? window.zfB64EncodeUtf8(json) : btoa(unescape(encodeURIComponent(json)));
        var encoded = encodeURIComponent(b64);
        var base = location.origin + location.pathname;
        return { url: base + '#z=' + encoded, size: encoded.length };
      } catch (e) {
        return { url: '', size: 0, error: String(e) };
      }
    },

    shareAsLink: function () {
      var r = this._buildShareUrl();
      if (!r.url) { this.store.status = 'Could not build a share link.'; return; }
      // 1800 is a conservative ceiling: browsers vary, but ~2KB is the common
      // practical limit for copy-pasteable URLs. Over this, base64 inflation
      // will likely break the link in someone's chat app. Leave the dialog
      // open on rejection so the user can choose another door without
      // reopening the menu.
      if (r.size > 1800) {
        this.store.status = 'This zine is too large to share as a link. Try the PDF or source file instead.';
        return;
      }
      this.shareOpen = false;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(r.url).then(function () {
            this.store.status = 'Share link copied to clipboard.';
          }.bind(this)).catch(function () {
            this.store.status = 'Could not copy to clipboard.';
          }.bind(this));
        } else {
          this.store.status = 'Clipboard not available.';
        }
      } catch (e) {
        this.store.status = 'Could not copy to clipboard.';
      }
    },
      onSaveToLibrary: function () {
        var ok = store.saveToLibrary();
        if (ok) {
          store.status = 'Saved to your library.';
          setTimeout(function () { if (store.status === 'Saved to your library.') store.status = ''; }, 2000);
        }
      },
      onClearAll: function () { if (window.ZFClearAll) window.ZFClearAll(); },
      onImport: function (evt) {
        var f = evt.target.files && evt.target.files[0];
        if (f && window.ZFImportFromFile) window.ZFImportFromFile(f);
        evt.target.value = '';
      },
      goEditor: function () { store.setView('editor'); },
      goReader: function () { store.setView("reader"); },
      goSheet: function () { store.setView("sheet"); },
      goLibrary: function () { store.setView("library"); },
      onNew: function () {
        store.pendingModelId = store.modelId;
        store.newZineOpen = true;
      },
      confirmNewZine: function () {
        store.newZineOpen = false;
        store.newZineInModel(store.pendingModelId);
        // If a template other than "standard" was chosen, load it. Loading
        // saves the just-created blank zine to the library first and then
        // fills it from the template file (see zfLoadTemplate).
        var chosen = null;
        var list = store.newZineTemplates || [];
        for (var i = 0; i < list.length; i++) {
          if (list[i].id === store.pendingTemplateId) { chosen = list[i]; break; }
        }
        if (chosen && chosen.file && window.zfLoadTemplate) {
          window.zfLoadTemplate(chosen.file);
        }
      },
      cancelNewZine: function () {
        store.newZineOpen = false;
      },
      onUndo: function () {
        if (window.ZFUndo) window.ZFUndo();
        this.tick++;
      },
      onRedo: function () {
        if (window.ZFRedo) window.ZFRedo();
        this.tick++;
      }
    },
    template: "#zine-app-shell-template"
  };

  window.ZfAppShell = AppShell;
})();