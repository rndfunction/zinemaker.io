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
    // The last generated share URL. Shown in the share dialog so users can
    // select-and-copy it manually when the browser's clipboard write fails
    // (permissions, secure-context, iframe restrictions) -- which it did,
    // silently, in earlier testing.
    shareUrl: '',
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
    closeShare: function () { this.shareOpen = false; this.shareUrl = ''; },
    // Copy the current share URL to the clipboard. Two paths: the modern
    // async clipboard API, and a fallback to the classic execCommand('copy')
    // which works in contexts where navigator.clipboard is blocked (older
    // browsers, sandboxed iframes, Brave with shields). Both paths report
    // success or failure in store.status so the user knows what happened.
    // Manual selection always works as the last resort.
    copyShareUrl: function () {
      var self = this;
      var url = this.shareUrl;
      if (!url) return;
      function success() { self.store.status = 'Share link copied.'; self._clearStatusLater(); }
      function failure() { self.store.status = 'Copy failed -- select the link and press Ctrl+C.'; self._clearStatusLater(); }
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(success).catch(function () {
            // Fallback: classic execCommand('copy')
            try { self._execCommandCopy(url) ? success() : failure(); } catch (e) { failure(); }
          });
          return;
        }
      } catch (e) {}
      // No clipboard API: try execCommand.
      try { this._execCommandCopy(url) ? success() : failure(); } catch (e) { failure(); }
    },
    // Classic copy path: create a temporary textarea, select it, and use
    // execCommand('copy'). Works in contexts where navigator.clipboard is
    // blocked. Returns true on success, false on failure.
    _execCommandCopy: function (text) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-9999px';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      return ok;
    },
    // Helper: clear the status message after a short delay, so it doesn't
    // linger forever. Only clears if the message hasn't been overwritten.
    _clearStatusLater: function () {
      var self = this;
      var currentStatus = this.store.status;
      setTimeout(function () {
        if (self.store.status === currentStatus) self.store.status = '';
      }, 3000);
    },
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
        // LZ-string compresses zine JSON (highly repetitive: keys, structure,
        // default values) by ~60-80% on text-heavy zines, ~20-40% on
        // image-heavy ones. compressToEncodedURIComponent produces
        // URL-safe output directly -- no separate base64 or URI-encode step,
        // which keeps the payload smaller AND the code simpler.
        var compressed;
        if (window.LZString) {
          compressed = 'z2:' + window.LZString.compressToEncodedURIComponent(json);
        } else {
          // Fallback to the old base64 path if LZ-string failed to load.
          // Links produced this way are still readable by the reader's
          // legacy branch.
          var b64 = window.zfB64EncodeUtf8 ? window.zfB64EncodeUtf8(json) : btoa(unescape(encodeURIComponent(json)));
          compressed = encodeURIComponent(b64);
        }
        // Build the base URL. In the FORGE preview, this app is served from
        // a srcdoc iframe whose origin is "null" (per the browser spec); the
        // naive origin + pathname concatenation produces "nullsrcdoc" --
        // not a valid URL, and pasting it in a new tab fails immediately.
        // Detect that case and fall back to the canonical deployed URL, so
        // links generated in the preview still work when shared.
        var base;
        var o = location.origin;
        if (!o || o === 'null' || o === 'undefined' || !/^https?:/.test(o)) {
          base = 'https://rndfunction.github.io/zinemaker.io/';
        } else {
          base = o + location.pathname;
        }
        return { url: base + '#z=' + compressed, size: compressed.length };
      } catch (e) {
        return { url: '', size: 0, error: String(e) };
      }
    },

    shareAsLink: function () {
      var r = this._buildShareUrl();
      if (!r.url) { this.store.status = 'Could not build a share link.'; return; }
      // With LZ-string compression, most zines fit comfortably under 8000
      // characters. 8000 is still conservative vs browser limits (~65k for
      // Firefox, higher for Chrome), because intermediate services (chat
      // apps, email clients) truncate much lower. Leave the dialog open on
      // rejection so the user can choose another door without reopening the
      // menu.
      if (r.size > 8000) {
        this.store.status = 'This zine is too large to share as a link. Try the PDF or source file instead.';
        return;
      }
      // Do NOT close the dialog. Show the URL inline so the user can copy it
      // manually even if the browser's clipboard write is blocked. Clipboard
      // is attempted as a convenience; it is not the primary delivery
      // mechanism anymore.
      this.shareUrl = r.url;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(r.url).then(function () {
            this.store.status = 'Share link copied to clipboard.';
          }.bind(this)).catch(function () {
            this.store.status = 'Copy failed -- select and copy the link below.';
          }.bind(this));
        } else {
          this.store.status = 'Clipboard not available -- select and copy the link below.';
        }
      } catch (e) {
        this.store.status = 'Copy failed -- select and copy the link below.';
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