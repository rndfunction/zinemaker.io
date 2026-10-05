// zf-store.js -- shared reactive store and page-data helpers for Zine Forge.
// Extracted verbatim from the inline <script> in index.html so it can be
// cached and edited independently. Loads as a classic script (not an ES
// module) and publishes its symbols on window so the component files
// (zf-app-shell.js, zf-editor.js, etc.) can use them, matching the existing
// global style of zine-models.js / zine-themes.js / util.js.
//
// Requires (must load BEFORE this file):
//   zine-models.js, zine-themes.js, zine-library.js, util.js
// Exposes on window:
//   zfEmptyPage, zfBuildPagesFromData, zfApplyZineData, zfBlankPagesForModel,
//   ZF_STORAGE_KEY, ZF_STORE (the reactive store), zfLoadDraft
(function () {
  'use strict';

  var STORAGE_KEY = 'zine-forge-draft-v1';

  function zfEmptyPage() {
    return {
      id: 'p' + Math.random().toString(36).slice(2, 9),
      heading: '',
      body: '',
      images: [],
      textBoxes: []
    };
  }

  // Build store pages from a zine file's pages array. Accepts both the
  // rich export format (images[]/textBoxes[]) and the older single-image
  // format (image/imageX/imageY/...), normalizing to the rich shape.
  // Shared by file import, the shared-link loader, and the examples loader.
  function zfBuildPagesFromData(pages) {
    if (!Array.isArray(pages)) return [zfEmptyPage()];
    var built = pages.map(function (p, i) {
      var page = {
        id: 'p' + i + '-' + Math.random().toString(36).slice(2, 7),
        heading: p.heading || '',
        // Sanitize stored HTML on the way IN so no downstream view
        // (reader / sheet / library thumb) can render script, event
        // handlers, or other active content from an imported file,
        // shared link, template, or example. zfSanitizeHtml is an
        // allowlist walker defined in /js/util.js.
        body: zfSanitizeHtml(p.body || ''),
        image: p.image || '',
        imageX: typeof p.imageX === 'number' ? p.imageX : 0,
        imageY: typeof p.imageY === 'number' ? p.imageY : 0,
        imageW: typeof p.imageW === 'number' ? p.imageW : 1.5,
        imageRot: typeof p.imageRot === 'number' ? p.imageRot : 0,
        imageWrap: p.imageWrap || 'free'
      };
      var imgs = [];
      if (Array.isArray(p.images)) imgs = imgs.concat(p.images);
      if (Array.isArray(p.icons)) imgs = imgs.concat(p.icons);
      // Export writes icons in BOTH images[] (with kind) and a separate
      // icons[] array. Merge them but drop duplicates by id so each icon
      // appears once (preferring the images[] copy that carries kind).
      var seenIds = {};
      imgs = imgs.filter(function (im) {
        if (!im || !im.id) return true;
        if (seenIds[im.id]) return false;
        seenIds[im.id] = true;
        return true;
      });
      page.images = imgs.map(function (im) {
        return {
          id: im.id || ('i-' + Math.random().toString(36).slice(2, 8)),
          src: im.src,
          kind: im.kind || 'photo',
          x: typeof im.x === 'number' ? im.x : 0,
          y: typeof im.y === 'number' ? im.y : 0,
          w: typeof im.w === 'number' ? im.w : 1.5,
          h: (typeof im.h === 'number') ? im.h : undefined,
          rot: typeof im.rot === 'number' ? im.rot : 0,
          wrap: im.wrap || 'free',
          z: typeof im.z === 'number' ? im.z : 0,
          color: im.color || '',
          placeholder: !!im.placeholder,
          hidden: !!im.hidden
        };
      });
      page.textBoxes = Array.isArray(p.textBoxes) ? p.textBoxes.map(function (tb) {
        return {
          id: tb.id || ('t-' + Math.random().toString(36).slice(2, 8)),
          kind: tb.kind || '',
          role: tb.role || '',
          // Sanitize text-box HTML on ingress, same rationale as the
          // page body above. Prevents stored XSS from imported files,
          // shared links, templates, and examples.
          html: zfSanitizeHtml(tb.html || ''),
          x: typeof tb.x === 'number' ? tb.x : 0,
          y: typeof tb.y === 'number' ? tb.y : 0,
          w: typeof tb.w === 'number' ? tb.w : 1.8,
          h: typeof tb.h === 'number' ? tb.h : undefined,
          rot: typeof tb.rot === 'number' ? tb.rot : 0,
          fontSize: typeof tb.fontSize === 'number' ? tb.fontSize : 1.0,
          lineHeight: typeof tb.lineHeight === 'number' ? tb.lineHeight : undefined,
          align: tb.align || '',
          z: typeof tb.z === 'number' ? tb.z : 0,
          color: tb.color || '',
          overlay: !!tb.overlay,
          hidden: !!tb.hidden
        };
      }) : [];
      if (window.zfMigratePage) window.zfMigratePage(page);
      return page;
    });
    return built.length ? built : [zfEmptyPage()];
  }

  // Apply a parsed zine object (from a file, URL, or share link) to the
  // store. Returns true on success. Shared by import and example loading.
  function zfApplyZineData(parsed) {
    if (!parsed || !Array.isArray(parsed.pages)) return false;
    store.title = parsed.title || 'Untitled Zine';
    store.author = parsed.author || '';
    if (parsed.modelId && window.ZFModels) store.modelId = parsed.modelId;
    if (parsed.themeId && window.ZFThemes) store.themeId = parsed.themeId;
    if (typeof parsed.marginIn === 'number') store.marginIn = parsed.marginIn;
    store.pages = zfBuildPagesFromData(parsed.pages);
    store.activePageId = store.pages[0].id;
    return true;
  }

  function zfLoadDraft() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.pages) && parsed.pages.length) return parsed;
    } catch (e) { zfLog('load failed: ' + e.message); }
    return null;
  }

  var zfSaved = zfLoadDraft();

  // A fresh zine starts with a full sheet's worth of blank pages for the
  // current model, so users don't have to click "Add page" repeatedly.
  function zfBlankPagesForModel(modelId) {
    var per = 8;
    var sides = 1;
    try {
      if (window.ZFModels) {
        var m = window.ZFModels.getModel(modelId || 'mini-8');
        if (m && m.pagesPerSheet) per = m.pagesPerSheet;
        if (m && typeof m.sides === 'number' && m.sides > 0) sides = m.sides;
      }
    } catch (e) {}
    // A two-sided model needs pagesPerSheet * sides pages to fill both
    // printed sides (e.g. the 4-page half-fold = 2 per side * 2 sides).
    var total = per * sides;
    var arr = [];
    for (var i = 0; i < total; i++) arr.push(zfEmptyPage());
    return arr;
  }

  var zfInitial = (zfSaved && zfSaved.pages && zfSaved.pages.length)
    ? zfMigrateAllPages(zfSaved.pages)
    : zfBlankPagesForModel(zfSaved && zfSaved.modelId);
  zfLog('initial pages=' + zfInitial.length);

  var store = Vue.reactive({
    title: zfSaved ? zfSaved.title : 'Untitled Zine',
    author: zfSaved ? zfSaved.author : '',
    pages: zfInitial,
    activePageId: zfInitial[0].id,
    view: 'editor',
    status: '',
    lastSavedAt: 0,
    settingsOpen: false,
    newZineOpen: false,
    pendingModelId: '',
    pendingTemplateId: 'standard',
    // Templates offered in the New Zine modal. "standard" is the default
    // (blank pages in the chosen format); others load a bundled template.
    // Only templates listed here are user-visible; adding one is a matter
    // of adding an entry (file is relative to /templates/).
    newZineTemplates: [
      { id: 'standard', label: 'Standard (blank)' },
      { id: 'photo-zine', label: 'Photo zine', file: 'photo-zine.json' }
    ],
    modelId: (zfSaved && zfSaved.modelId) ? zfSaved.modelId : 'mini-8',
    themeId: (zfSaved && zfSaved.themeId) ? zfSaved.themeId : 'classic',
    currentZineId: (zfSaved && zfSaved.currentZineId) ? zfSaved.currentZineId : null,
    library: (window.ZFLibrary) ? window.ZFLibrary.list() : [],
    marginIn: (zfSaved && typeof zfSaved.marginIn === "number") ? zfSaved.marginIn : 0.1,
    printerSafetyIn: (zfSaved && typeof zfSaved.printerSafetyIn === "number") ? zfSaved.printerSafetyIn : 0.2,
    safeEdgeIn: (zfSaved && typeof zfSaved.safeEdgeIn === "number") ? zfSaved.safeEdgeIn : 0.4,
    showFoldLines: (zfSaved && typeof zfSaved.showFoldLines === "boolean") ? zfSaved.showFoldLines : true,
    showCutLines: (zfSaved && typeof zfSaved.showCutLines === "boolean") ? zfSaved.showCutLines : false,

    activePage: function () {
      var id = this.activePageId;
      var found = this.pages.find(function (p) { return p.id === id; });
      return found || this.pages[0];
    },
    addPage: function () { var p = zfEmptyPage(); this.pages.push(p); this.activePageId = p.id; },
    // -------- Sheet-aware page capacity --------
    // The model defines pagesPerSheet. Pages fill sheets; you cannot add
    // beyond the current sheet's capacity without starting a new sheet.
    sheetCapacity: function () {
      var m = this.model();
      var per = (m && m.pagesPerSheet) ? m.pagesPerSheet : 1;
      var have = this.pages.length;
      var sheets = Math.max(1, Math.ceil(have / per));
      return sheets * per;
    },
    isCurrentSheetFull: function () {
      return this.pages.length >= this.sheetCapacity();
    },
    // Add one page if the current sheet has room; otherwise start a new
    // sheet by adding a full sheet's worth of blank pages. Never destroys.
    addPageOrSheet: function () {
      var m = this.model();
      var per = (m && m.pagesPerSheet) ? m.pagesPerSheet : 1;
      if (this.pages.length < this.sheetCapacity()) {
        this.addPage();
      } else {
        for (var i = 0; i < per; i++) {
          var p = zfEmptyPage();
          this.pages.push(p);
        }
        this.activePageId = this.pages[this.pages.length - per].id;
      }
    },
    duplicatePage: function (id) {
      var idx = this.pages.findIndex(function (p) { return p.id === id; });
      if (idx < 0) return;
      var s = this.pages[idx];
      // Deep-copy the whole page so the duplicate carries its decorations
      // (images, icons, tape, stickers, text boxes) instead of only the
      // legacy heading/body/image fields. Cherry-picking fields previously
      // dropped `kind` and every placed element, which made duplicated
      // decorated pages come out blank except for body text. Mirrors the
      // deep-copy approach used by duplicateSelectedElement.
      var c = JSON.parse(JSON.stringify(s));
      c.id = 'p' + Math.random().toString(36).slice(2, 9);
      // Give nested element ids fresh values so the copy cannot collide
      // with (or be selected as) the original's elements.
      if (Array.isArray(c.images)) {
        c.images = c.images.map(function (im) {
          im.id = zfNewImageId();
          return im;
        });
      }
      if (Array.isArray(c.textBoxes)) {
        c.textBoxes = c.textBoxes.map(function (tb) {
          tb.id = zfNewTextBoxId();
          return tb;
        });
      }
      c.activeImageId = null;
      c.activeTextBoxId = null;
      this.pages.splice(idx + 1, 0, c);
      this.activePageId = c.id;
    },
    deletePage: function (id) {
      if (this.pages.length <= 1) return;
      var idx = this.pages.findIndex(function (p) { return p.id === id; });
      if (idx < 0) return;
      this.pages.splice(idx, 1);
      this.activePageId = this.pages[Math.min(idx, this.pages.length - 1)].id;
    },
    movePage: function (id, dir) {
      var idx = this.pages.findIndex(function (p) { return p.id === id; });
      if (idx < 0) return;
      var t = idx + dir;
      if (t < 0 || t >= this.pages.length) return;
      var it = this.pages.splice(idx, 1)[0];
      this.pages.splice(t, 0, it);
    },
    newZine: function () {
      if (this.currentZineId && this.saveToLibrary) this.saveToLibrary();
      this.currentZineId = window.ZFLibrary ? window.ZFLibrary.newId() : null;
      this.title = 'Untitled Zine'; this.author = ''; this.pages = zfBlankPagesForModel(this.modelId);
      this.activePageId = this.pages[0].id; this.view = 'editor';
      if (window.ZFLibrary) this.library = window.ZFLibrary.list();
    },
    // Start a new zine in a chosen model (seeds the right number of pages).
    newZineInModel: function (modelId) {
      if (modelId && modelId !== this.modelId) this.modelId = modelId;
      this.newZine();
    },
    setView: function (v) { this.view = v; },

    saveDraft: function () {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          title: this.title,
          author: this.author,
          pages: this.pages,
          modelId: this.modelId,
          themeId: this.themeId,
          currentZineId: this.currentZineId,
          marginIn: this.marginIn,
          printerSafetyIn: this.printerSafetyIn,
          safeEdgeIn: this.safeEdgeIn,
          showFoldLines: this.showFoldLines,
          showCutLines: this.showCutLines
        }));
        this.lastSavedAt = Date.now();
      } catch (e) {
        console.warn("saveDraft failed", e);
      }
    },

    setMargin: function (v) {
      var n = Number(v);
      if (isNaN(n)) return;
      if (n < 0.04) n = 0.04;
      if (n > 0.35) n = 0.35;
      this.marginIn = Math.round(n * 100) / 100;
    },

    setPrinterSafety: function (v) {
      var n = Number(v);
      if (isNaN(n)) return;
      if (n < 0) n = 0;
      if (n > 0.5) n = 0.5;
      this.printerSafetyIn = Math.round(n * 100) / 100;
    },

    setSafeEdge: function (v) {
      var n = Number(v);
      if (isNaN(n)) return;
      if (n < 0) n = 0;
      if (n > 0.75) n = 0.75;
      this.safeEdgeIn = Math.round(n * 100) / 100;
    },

    // True when the current draft has meaningful content worth saving to
    // the library: a real title, or any page with heading/body/images/boxes.
    zfHasContent: function () {
      var t = (this.title || '').trim();
      if (t && t !== 'Untitled Zine') return true;
      var pages = this.pages || [];
      for (var i = 0; i < pages.length; i++) {
        var p = pages[i];
        if (!p) continue;
        if (p.heading && String(p.heading).trim()) return true;
        if (p.body && String(p.body).trim()) return true;
        if (Array.isArray(p.images) && p.images.length) return true;
        if (Array.isArray(p.textBoxes) && p.textBoxes.length) return true;
      }
      return false;
    },
    saveToLibrary: function () {
      if (!window.ZFLibrary) return false;
      if (!this.currentZineId) this.currentZineId = window.ZFLibrary.newId();
      var ok = window.ZFLibrary.upsert({
        id: this.currentZineId,
        title: this.title,
        author: this.author,
        themeId: this.themeId,
        modelId: this.modelId,
        marginIn: this.marginIn,
        pages: this.pages,
        updatedAt: Date.now()
      });
      if (ok) {
        this.library = window.ZFLibrary.list();
        this._zfLastSaveFailed = false;
      } else {
        // Storage failed (usually quota exceeded). Surface this once so the
        // user knows to export and free space. Don't spam if it keeps failing.
        if (!this._zfLastSaveFailed) {
          this._zfLastSaveFailed = true;
          this.status = 'Could not save to library (storage full?). Export this zine to a .json file to protect it.';
          var self = this;
          setTimeout(function () {
            if (self.status.indexOf('Could not save to library') === 0) self.status = '';
          }, 8000);
        }
      }
      return ok;
    },

    loadFromLibrary: function (id) {
      if (!window.ZFLibrary) return;
      var rec = window.ZFLibrary.get(id);
      if (!rec) return;
      this.currentZineId = rec.id;
      this.title = rec.title;
      this.author = rec.author;
      this.themeId = rec.themeId || 'classic';
      this.modelId = rec.modelId || 'mini-8';
      this.marginIn = (typeof rec.marginIn === 'number') ? rec.marginIn : 0.1;
      this.pages = (rec.pages || []).map(function (p, i) {
        // Preserve the full stored page (images, textBoxes, icons, ...) so
        // decorated content survives a save/load round trip. Only the page
        // id is regenerated to avoid id collisions across zines. Legacy
        // pages that only have a single `image` field are migrated below
        // by zfMigrateAllPages.
        return Object.assign({}, p, {
          id: 'p' + i + '-' + Math.random().toString(36).slice(2, 7),
          heading: p.heading || '',
          body: p.body || '',
          images: Array.isArray(p.images) ? p.images : [],
          textBoxes: Array.isArray(p.textBoxes) ? p.textBoxes : []
        });
      });
      if (window.zfMigrateAllPages) this.pages = window.zfMigrateAllPages(this.pages);
      if (!this.pages.length) this.pages = [zfEmptyPage()];
      this.activePageId = this.pages[0].id;
      this.view = 'editor';
      this.status = 'Opened: ' + rec.title;
      var self = this;
      setTimeout(function () {
        if (self.status.indexOf('Opened: ') === 0) self.status = '';
      }, 2000);
    },

    duplicateInLibrary: function (id) {
      if (!window.ZFLibrary) return;
      var copy = window.ZFLibrary.duplicate(id);
      if (copy) {
        this.library = window.ZFLibrary.list();
        this.status = 'Duplicated.';
        var self = this;
        setTimeout(function () {
          if (self.status === 'Duplicated.') self.status = '';
        }, 2000);
      }
    },

    deleteFromLibrary: function (id) {
      if (!window.ZFLibrary) return;
      var rec = window.ZFLibrary.get(id);
      if (!rec) return;
      if (!confirm('Delete "' + rec.title + '" from your library? This cannot be undone.')) return;
      window.ZFLibrary.remove(id);
      this.library = window.ZFLibrary.list();
      if (this.currentZineId === id) this.currentZineId = null;
    },

    model: function () {
      if (!window.ZFModels) return null;
      return window.ZFModels.getModel(this.modelId);
    },

    theme: function () {
      if (!window.ZFThemes) return null;
      return window.ZFThemes.getTheme(this.themeId);
    },

    setTheme: function (id) {
      if (!window.ZFThemes) return;
      this.themeId = id;
      var t = window.ZFThemes.getTheme(id);
      this.status = 'Theme set to: ' + t.label;
      var self = this;
      setTimeout(function () {
        if (self.status.indexOf('Theme set to:') === 0) self.status = '';
      }, 2500);
    },

    setModel: function (id) {
      if (!window.ZFModels) return;
      if (id === this.modelId) return;
      // If the zine already has content, warn: switching changes the page
      // size but does NOT resize existing content.
      var hasContent = (this.pages || []).some(function (p) {
        return (p.heading && p.heading.trim()) ||
               (p.body && p.body.trim()) ||
               (p.images && p.images.length) ||
               (p.textBoxes && p.textBoxes.length) ||
               (p.image);
      });
      if (hasContent) {
        var ok = confirm(
          'Switch zine format to "' + window.ZFModels.getModel(id).label + '"?\n\n' +
          'Your pages are kept, but the page size changes. Existing content is ' +
          'NOT resized, so it may need adjusting for the new format.'
        );
        if (!ok) return;
      }
      this.modelId = id;
      this.status = 'Zine model set to: ' + window.ZFModels.getModel(id).label;
      var self = this;
      setTimeout(function () {
        if (self.status.indexOf('Zine model set to:') === 0) self.status = '';
      }, 2500);
    },

    minimumPages: function () {
      var m = this.model();
      return m ? m.pagesPerSheet : 1;
    },

    pagesNeeded: function () {
      var m = this.model();
      if (!m) return 0;
      var have = this.pages.length;
      var need = m.pagesPerSheet;
      var sheets = Math.max(1, Math.ceil(have / need));
      return sheets * need;
    }
  });

  // Publish on window so the component files that load after this one can
  // reach the same shared store and helpers.
  window.ZF_STORAGE_KEY = STORAGE_KEY;
  window.zfEmptyPage = zfEmptyPage;
  window.zfBuildPagesFromData = zfBuildPagesFromData;
  window.zfApplyZineData = zfApplyZineData;
  window.zfLoadDraft = zfLoadDraft;
  window.zfBlankPagesForModel = zfBlankPagesForModel;
  window.ZF_STORE = store;
})();