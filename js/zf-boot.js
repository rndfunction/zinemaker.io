// zf-boot.js -- application bootstrap: example/template loaders, shared-link
// loader, undo/redo history, keyboard shortcuts, autosave loop, and the
// Vue createApp/mount sequence. Extracted from the inline <script> in
// index.html. Classic script; MUST be the last zf-*.js script to load,
// because it wires everything together and mounts the app.
//
// Requires (must load BEFORE this file):
//   zf-store.js, zf-app-shell.js, zf-editor-component.js,
//   zf-reader.js, zf-sheet.js, zf-library-view.js
(function () {
  'use strict';

  if (typeof zfAssertDeps === 'function') zfAssertDeps('zf-boot', ['ZF_STORE', 'ZF_STORAGE_KEY', 'Vue', 'ZfAppShell', 'ZineEditor', 'ZineReader', 'ZineSheet', 'ZineLibrary', 'ZineIconPicker', 'ZfErrorBoundary']);

  var store = window.ZF_STORE;
  var STORAGE_KEY = window.ZF_STORAGE_KEY;

  // -------- Example / template loaders --------
  // Fetch and load a bundled content template (file name relative to
  // /templates/). Mirrors zfLoadExample, but first saves the current zine
  // to the Library so the user's work is never lost when a template
  // replaces it. Global so any component can trigger it.
  function zfLoadTemplate(file) {
    if (store.currentZineId && typeof store.saveToLibrary === 'function') {
      try { store.saveToLibrary(); } catch (e) {}
    }
    // Remember the model the user chose in the New Zine dialog. Templates
    // carry their own modelId (e.g. photo-zine.json is built for mini-8),
    // and zfApplyZineData would otherwise overwrite the user's explicit
    // format choice. A template should fill CONTENT, not dictate FORMAT.
    var chosenModelId = store.modelId;
    store.status = 'Loading template...';
    return fetch('templates/' + file)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        // Read as text first so an HTML error/SPA-shell response fails
        // cleanly here instead of throwing out of the click handler
        // (which Vue would report and the error boundary would catch).
        return r.text();
      })
      .then(function (text) {
        var parsed = null;
        try { parsed = JSON.parse(text); } catch (e) { parsed = null; }
        if (!parsed || !Array.isArray(parsed.pages)) {
          throw new Error('template file was not valid JSON');
        }
        if (!window.zfApplyZineData(parsed)) throw new Error('bad template file');
        // Restore the user's chosen model over the template's own modelId.
        // A template fills CONTENT; the user's format choice wins.
        store.modelId = chosenModelId;
        // Refit the template's content from the page size it was authored at
        // to the chosen model's page size, then repeat the pages cyclically
        // to fill a full sheet for that model. This makes ONE template work
        // for every model: 8 photo pages refit and repeated to 16 for the
        // 16-page booklet, scaled to full page for single-page, etc.
        // Without the refit, positions tuned for mini-8 land wrong on other
        // page sizes; without the repeat, larger models got blank padding.
        if (window.ZFModels && window.ZFModels.getModel &&
            typeof window.zfRefitPagesToSize === 'function' &&
            typeof window.zfRepeatPagesToCount === 'function') {
          var tmplModel = parsed.modelId ? window.ZFModels.getModel(parsed.modelId) : null;
          var targetModel = window.ZFModels.getModel(chosenModelId);
          // Native page size the template content was authored at, and the
          // target model's page size. The refit is UNIT-AWARE: it converts
          // both sizes to inches before computing the scale, so an
          // inch-authored template refits correctly onto a metric (A4) model
          // instead of dumping its content in the corner.
          var fromW = (tmplModel && tmplModel.page) ? tmplModel.page.width : 2.75;
          var fromH = (tmplModel && tmplModel.page) ? tmplModel.page.height : 4.25;
          var toW = (targetModel && targetModel.page) ? targetModel.page.width : fromW;
          var toH = (targetModel && targetModel.page) ? targetModel.page.height : fromH;
          // The raw ratio toW/fromW handles both physical scale AND unit
          // conversion (target-units-per-source-unit), so no unit params.
          store.pages = window.zfRefitPagesToSize(store.pages, fromW, fromH, toW, toH);
          // Fill the model's full sheet capacity by repeating the pages.
          var need = 0;
          if (window.ZFModels.pagesPerSheet) {
            need = window.ZFModels.pagesPerSheet(targetModel);
          } else if (targetModel && targetModel.pagesPerSheet) {
            need = targetModel.pagesPerSheet;
          }
          if (need && store.pages.length < need) {
            store.pages = window.zfRepeatPagesToCount(store.pages, need);
          }
          if (store.pages.length) store.activePageId = store.pages[0].id;
        }
        if (window.ZFLibrary) store.currentZineId = window.ZFLibrary.newId();
        store.view = 'editor';
        store.status = 'Loaded template: ' + (parsed.title || file);
        setTimeout(function () {
          if (store.status.indexOf('Loaded template') === 0) store.status = '';
        }, 2500);
        return true;
      })
      .catch(function (e) {
        store.status = 'Could not load template: ' + (e && e.message ? e.message : e);
        return false;
      });
  }

  // Fetch and load a bundled example zine (file name relative to /zines/).
  // Global so any component (editor rail, library) can trigger it.
  function zfLoadExample(file) {
    store.status = 'Loading example...';
    return fetch('zines/' + file)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (parsed) {
        if (!window.zfApplyZineData(parsed)) throw new Error('Bad zine file');
        store.view = 'editor';
        store.status = 'Loaded example: ' + (parsed.title || file);
        setTimeout(function () {
          if (store.status.indexOf('Loaded example') === 0) store.status = '';
        }, 2500);
        return true;
      })
      .catch(function (e) {
        store.status = 'Could not load example: ' + e.message;
        return false;
      });
  }

  window.zfLoadTemplate = zfLoadTemplate;
  window.zfLoadExample = zfLoadExample;

  // -------- Imposition test sheet --------
  // Fills every page with a huge page number (and nothing else) so a single
  // print reveals where each page physically lands after folding. Used to
  // verify two-sided models whose back-side page mapping is a guess. The
  // user prints, folds, staples, reads the order off the paper, and reports
  // which numbers ended up where; only the model's slotsBack `page` values
  // change. Leaves the current draft untouched by saving it first.
  function zfImpositionTest() {
    var m = store.model && store.model();
    if (!m) return false;
    // Save the user's real work so the test fill never destroys it.
    try { store.saveToLibrary(); } catch (e) {}
    try { store.saveDraft(); } catch (e) {}
    var total = 0;
    if (window.ZFModels && window.ZFModels.pagesPerSheet) {
      total = window.ZFModels.pagesPerSheet(m);
    } else if (m.pagesPerSheet) {
      total = m.pagesPerSheet;
    }
    if (!total) total = (m.slots ? m.slots.length : 1) * (m.sides || 1);
    var pages = [];
    for (var i = 1; i <= total; i++) {
      // Big number as a centered text box so it survives the mini-page
      // renderer (which reads textBoxes, not just heading/body). A plain
      // heading would also work, but a text box is guaranteed to render on
      // every view (editor, reader, sheet) identically.
      var p = window.zfEmptyPage();
      // The imposition test used to fill heading+body; those inline fields
      // are retired, so the number lives ONLY in a centered text box.
      // Placed dead-center so it can't fall in the printer's unprintable
      // margin and is unmissable in every view.
      var tbW = Math.max(1.2, (m.page.width || 2.75) * 0.7);
      var tbH = Math.max(0.8, (m.page.height || 4.25) * 0.3);
      p.textBoxes = [{
        id: 'tb-test-' + i,
        kind: '',
        role: 'title',
        html: '<b>' + i + '</b>',
        x: ((m.page.width || 2.75) - tbW) / 2,
        y: ((m.page.height || 4.25) - tbH) / 2,
        w: tbW,
        h: tbH,
        rot: 0,
        fontSize: 3.0,
        align: 'center',
        z: 10,
        hidden: false
      }];
      pages.push(p);
    }
    store.pages = pages;
    store.activePageId = pages[0].id;
    store.modelId = m.id;
    if (typeof store.zfEnsureModelCapacity === 'function') store.zfEnsureModelCapacity();
    store.view = 'sheet';
    store.status = 'IMPOSITION TEST: ' + total + ' pages. Print double-sided, fold, staple, then read off the page order. Your real draft was saved to the library.';
    return true;
  }
  window.ZFImpositionTest = zfImpositionTest;

  // -------- Shared-link loader --------
  function loadSharedZineFromHash() {
    var hash = location.hash || '';
    var m = hash.match(/(?:^#|&)z=([^&]+)/);
    if (!m) return;
    try {
      var parsed = JSON.parse(zfB64DecodeUtf8(m[1]));
      if (!parsed || !Array.isArray(parsed.p)) return;
      // BUILD FIRST, ASSIGN SECOND. Previously we mutated store.title and
      // store.author before calling zfBuildPagesFromData; if that call
      // threw, we'd end up with the shared title on the user's old pages
      // (an inconsistent state). Build the pages first (may throw), then
      // save the draft (so mid-edit work is not lost), then commit.
      // Accept the rich share format ({tb, im}) used by current clients,
      // and keep the legacy compact format ({h,b,i}) working for links
      // shared before inline bodies were retired. The legacy fields are
      // passed through transiently so zfBuildPagesFromData migrates them
      // into text boxes / image elements, same as any old stored zine.
      var sharedPages = parsed.p.map(function (p) {
        if (p && (Array.isArray(p.tb) || Array.isArray(p.im))) {
          return {
            textBoxes: Array.isArray(p.tb) ? p.tb : [],
            images: Array.isArray(p.im) ? p.im : []
          };
        }
        return { heading: p.h || '', body: p.b || '', image: p.i || '' };
      });
      var built = window.zfBuildPagesFromData(sharedPages);
      if (!Array.isArray(built) || !built.length) return;
      // Save the current work before a shared link replaces it. Without
      // this, clicking a #z= link mid-edit could discard up to one autosave
      // interval (1.5s) of changes. saveDraft is cheap and idempotent.
      try { store.saveDraft(); } catch (eSave) {}
      store.title = parsed.t || 'Untitled Zine';
      store.author = parsed.a || '';
      store.pages = built;
      store.activePageId = built[0].id;
      store.view = 'reader';
    } catch (e) { zfLog('bad share link: ' + e.message); }
  }

  // -------- Undo / redo --------
  // Snapshot-based history: keeps the last N "meaningful" states of the
  // zine. A state is captured on a debounce whenever the content changes
  // (same signal the autosave loop uses). This is simple and covers every
  // kind of edit (text, images, text boxes, page ops, model/theme changes).
  var ZF_HISTORY_MAX = 40;
  var zfHistory = [];       // past states, oldest first
  var zfRedo = [];          // future states (after undo)
  var zfLastSnapStr = '';   // last captured state, to detect changes
  var zfSnapTimer = null;
  var zfApplying = false;   // set during undo/redo to suppress snapshots

  function zfCaptureState() {
    return {
      title: store.title,
      author: store.author,
      modelId: store.modelId,
      themeId: store.themeId,
      marginIn: store.marginIn,
      // Include the remaining page-setup fields so undo covers the whole
      // "settings" surface, not just margin. Previously margin was undoable
      // while printer-safety and the fold/cut toggles were not, which was
      // surprising given they live in the same panel.
      printerSafetyIn: store.printerSafetyIn,
      safeEdgeIn: store.safeEdgeIn,
      showFoldLines: store.showFoldLines,
      showCutLines: store.showCutLines,
      pages: JSON.parse(JSON.stringify(store.pages))
    };
  }

  function zfApplyState(snap) {
    zfApplying = true;
    store.title = snap.title;
    store.author = snap.author;
    store.modelId = snap.modelId;
    store.themeId = snap.themeId;
    store.marginIn = snap.marginIn;
    if (typeof snap.printerSafetyIn === 'number') store.printerSafetyIn = snap.printerSafetyIn;
    if (typeof snap.safeEdgeIn === 'number') store.safeEdgeIn = snap.safeEdgeIn;
    if (typeof snap.showFoldLines === 'boolean') store.showFoldLines = snap.showFoldLines;
    if (typeof snap.showCutLines === 'boolean') store.showCutLines = snap.showCutLines;
    store.pages = snap.pages.map(function (p) {
      // Ensure optional arrays exist.
      if (!Array.isArray(p.images)) p.images = [];
      if (!Array.isArray(p.textBoxes)) p.textBoxes = [];
      return p;
    });
    if (!store.pages.length) store.pages = [window.zfEmptyPage()];
    if (!store.pages.find(function (p) { return p.id === store.activePageId; })) {
      store.activePageId = store.pages[0].id;
    }
    zfApplying = false;
    zfLastSnapStr = JSON.stringify(zfCaptureState());
  }

  function zfCommitHistory() {
    // Called from the autosave loop when content has changed. Snapshots the
    // PREVIOUS state (zfLastSnapStr) into history, then updates lastSnap.
    if (zfApplying) return;
    var current = zfCaptureState();
    var currentStr = JSON.stringify(current);
    if (currentStr === zfLastSnapStr) return;
    if (zfLastSnapStr) {
      try {
        zfHistory.push(JSON.parse(zfLastSnapStr));
        if (zfHistory.length > ZF_HISTORY_MAX) zfHistory.shift();
        zfRedo.length = 0;
      } catch (e) { /* ignore */ }
    }
    zfLastSnapStr = currentStr;
  }

  function zfUndo() {
    if (!zfHistory.length) { store.status = 'Nothing to undo.'; return; }
    var current = zfCaptureState();
    var prev = zfHistory.pop();
    zfRedo.push(current);
    zfApplyState(prev);
    store.status = 'Undo.';
    setTimeout(function () { if (store.status === 'Undo.') store.status = ''; }, 1200);
  }

  function zfRedoAction() {
    if (!zfRedo.length) { store.status = 'Nothing to redo.'; return; }
    var next = zfRedo.pop();
    zfHistory.push(zfCaptureState());
    zfApplyState(next);
    store.status = 'Redo.';
    setTimeout(function () { if (store.status === 'Redo.') store.status = ''; }, 1200);
  }

  // -------- Boot --------
  function boot() {
    if (!window.Vue) {
      document.getElementById('app').innerHTML =
        '<div class="zf-empty" style="margin:2rem;">Vue failed to load from the CDN.</div>';
      zfLog('Vue missing - aborting boot');
      return;
    }
    zfLog('Vue found, loading templates, mounting...');

    // -------- UI template loading --------
    // The large <template id=...> blocks that used to live inline in
    // index.html are now separate partials under /templates-ui/. Fetch each
    // and inject it as a <template> element in <head> BEFORE Vue mounts,
    // because component templates are resolved at mount time.
    //
    // SKIP-IF-PRESENT: if a template with the same id already exists in the
    // DOM (e.g. an older index.html that still has it inline, or a second
    // call to boot()), do not inject a duplicate -- a duplicate id would
    // shadow the real template unpredictably.
    var UI_TEMPLATES = [
      { id: 'zine-app-shell-template', file: 'templates-ui/zine-app-shell.html' },
      { id: 'zine-reader-template',    file: 'templates-ui/zine-reader.html' },
      { id: 'zine-editor-template',    file: 'templates-ui/zine-editor.html' }
    ];
    function loadUiTemplates() {
      var jobs = UI_TEMPLATES.map(function (t) {
        return function () {
          if (document.getElementById(t.id)) return Promise.resolve(); // already inline
          return fetch(t.file).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + t.file);
            return r.text();
          }).then(function (html) {
            // The partial is a full <template id=...>...</template> block.
            // Validate it actually contains the expected id before injecting.
            if (html.indexOf('id="' + t.id + '"') === -1) {
              throw new Error('template partial ' + t.file + ' missing id ' + t.id);
            }
            // Parse and adopt the <template> node so it registers the same
            // way an inline <template> would.
            var wrap = document.createElement('div');
            wrap.innerHTML = html;
            var tpl = wrap.querySelector('template#' + t.id);
            if (!tpl) throw new Error('no <template id=' + t.id + '> in ' + t.file);
            document.head.appendChild(tpl);
          });
        };
      });
      // Sequential to keep boot deterministic and error attribution clear.
      return jobs.reduce(function (p, job) { return p.then(job); }, Promise.resolve());
    }

    function mountApp() {
      var app = Vue.createApp({
        data: function () { return { store: store }; },
        template: '<app-shell />'
      });
      app.component('app-shell', window.ZfAppShell);
      app.component('zine-editor', window.ZineEditor);
      app.component('zine-reader', window.ZineReader);
      app.component('zine-sheet', window.ZineSheet);
      app.component('zine-library', window.ZineLibrary);
      app.component('zine-icon-picker', window.ZineIconPicker);
      app.component('zf-error-boundary', window.ZfErrorBoundary);
      app.config.errorHandler = function (err, instance, info) {
        zfLog('VUE ERROR: ' + (err && err.message ? err.message : err) + ' | info: ' + info);
        if (err && err.stack) zfLog('VUE ERROR STACK: ' + err.stack);
      };
      app.config.warnHandler = function (msg, instance, trace) {
        zfLog('VUE WARN: ' + msg);
      };
      // Treat <iconify-icon> as a native custom element (web component)
      // everywhere Vue compiles templates.
      app.config.compilerOptions.isCustomElement = function (tag) {
        return tag === 'iconify-icon';
      };
      app.mount('#app');
      zfLog('mounted OK; view=' + store.view + '; pages=' + store.pages.length);
      // First visit only: no saved draft means the user has never worked
      // here, so preload the welcome example so they can jump right in.
      // If a draft exists we never touch it (their work always wins).
      if (!window.zfLoadDraft() && window.zfLoadExample) {
        window.zfLoadExample('welcome-to-zine-forge.json');
      }
    }

    // Drive boot: load the UI template partials (they must be in the DOM
    // before Vue resolves component templates), then mount. Any failure --
    // a partial 404s, an id is missing, or mount throws -- surfaces in the
    // same recovery panel the old try/catch used, rather than a blank page.
    function showBootError(e) {
      zfLog('BOOT ERROR: ' + (e && e.message ? e.message : String(e)));
      zfLog('STACK: ' + (e && e.stack ? e.stack : '(no stack)'));
      try {
        var appEl = document.getElementById('app');
        appEl.innerHTML = '';
        var box = document.createElement('div');
        box.className = 'zf-empty';
        box.style.margin = '2rem';
        box.textContent = 'Boot failed: ' + (e && e.message ? e.message : String(e));
        appEl.appendChild(box);
      } catch (e2) {}
    }
    loadUiTemplates().then(mountApp).catch(showBootError);
    loadSharedZineFromHash();
    window.addEventListener('hashchange', loadSharedZineFromHash);

    // Durability: flush a save before the tab goes away. Both of these
    // fire for different cases (visibilitychange for tab switch away,
    // pagehide for navigation / close), so we register both.
    function flushSave() {
      try {
        store.saveDraft();
        if (store.currentZineId) store.saveToLibrary();
      } catch (e) {
        zfLog('flushSave failed: ' + e.message);
      }
    }
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') flushSave();
    });
    window.addEventListener('pagehide', flushSave);
    window.addEventListener('beforeunload', flushSave);

    // Keyboard shortcuts for undo/redo. Skip when focus is inside an
    // input/textarea/contenteditable so users get normal browser undo
    // while typing (which is not what we want for structure changes but
    // is what they'd expect for text).
    window.addEventListener('keydown', function (evt) {
      var cmd = evt.ctrlKey || evt.metaKey;
      // Dev keyboard shortcuts were removed for shipping. The test-sheet
      // and model-cycle helpers are still available as console-only
      // functions: ZFImpositionTest() and (via setModel) the model pickers.
      var key = (evt.key || '').toLowerCase();
      // Skip our shortcuts when the user is typing inside an editable.
      // Let the browser handle native text editing (Backspace, Ctrl+Z, etc.)
      var active = document.activeElement;
      var inEditable = active && (
        active.isContentEditable ||
        active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA'
      );

      // Select All (Ctrl/Cmd+A) on the editor page. Skip only while editing
      // TEXT (an input/textarea or a text-box's contenteditable) so we do not
      // hijack "select all text" there. The page BODY is a contenteditable
      // too, but focusing it should still allow Select All of elements.
      var inTextBox = active && active.closest && active.closest('.zf-textbox');
      var inTextInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || inTextBox);
      if (cmd && !inTextInput && key === 'a' && !evt.shiftKey && !evt.altKey) {
        // Always prevent the browser's native select-all (which highlighted
        // the whole page when nothing specific was focused), and always run
        // our Select All on the editor page.
        evt.preventDefault();
        if (window.ZFEditorActions && window.ZFEditorActions.selectAll) {
          window.ZFEditorActions.selectAll();
        }
        return;
      }

      // Undo/redo
      if (cmd && !inEditable) {
        if (key === 'z' && !evt.shiftKey) {
          evt.preventDefault();
          // Drawing mode owns undo. Ctrl+Z must undo the last stroke, not
          // revert the whole page through the global history. Without this
          // check, undo while drawing silently restored an earlier page
          // snapshot and discarded unrelated edits.
          var acts = window.ZFEditorActions;
          if (acts && acts.isDrawing && acts.isDrawing() && acts.drawUndo) {
            acts.drawUndo();
          } else if (window.ZFUndo) {
            window.ZFUndo();
          }
          return;
        } else if ((key === 'z' && evt.shiftKey) || key === 'y') {
          evt.preventDefault();
          if (window.ZFRedo) window.ZFRedo();
          return;
        } else if (key === 'd') {
          // Ctrl+D / Cmd+D: duplicate selected element
          evt.preventDefault();
          if (window.ZFEditorActions && window.ZFEditorActions.duplicate) {
            window.ZFEditorActions.duplicate();
          }
          return;
        } else if (key === 'c') {
          // Ctrl+C / Cmd+C: copy the selected element. Only intercept when
          // an element is selected, so copying actual text still works.
          if (window.ZFEditorActions && window.ZFEditorActions.hasSelection && window.ZFEditorActions.hasSelection()) {
            evt.preventDefault();
            window.ZFEditorActions.copy();
          }
          return;
        } else if (key === 'v') {
          // Ctrl+V / Cmd+V: paste the buffered element.
          if (window.zfClipboard && window.ZFEditorActions && window.ZFEditorActions.paste) {
            evt.preventDefault();
            window.ZFEditorActions.paste();
          }
          return;
        }
      }

      // Delete / Backspace: remove selected element (only when not editing).
      if ((evt.key === 'Delete' || evt.key === 'Backspace') && !inEditable) {
        // Only act if something is selected (an image or text box).
        if (window.ZFEditorActions && window.ZFEditorActions.hasSelection && window.ZFEditorActions.hasSelection()) {
          evt.preventDefault();
          window.ZFEditorActions.delete();
        }
      }
    });

    // Seed the initial snapshot so we have a baseline.
    zfLastSnapStr = JSON.stringify(zfCaptureState());

    // Autosave loop: writes the current draft slot and, if the zine has an
    // id, mirrors it into the local library. Also drives the undo history.
    setInterval(function () {
      var snap = JSON.stringify({
        t: store.title, a: store.author, m: store.modelId, th: store.themeId,
        p: store.pages
      });
      if (snap !== store._zfLastAutoSave) {
        // Check whether it's actually different from the last snapshot.
        // zfCommitHistory handles this internally using its own tracker.
        zfCommitHistory();
        store._zfLastAutoSave = snap;
        store.saveDraft();
        // Mirror into the library only when the draft has real content. This
        // holds whether or not an id exists, so a freshly created blank zine
        // (which gets an id immediately) does not save an empty entry.
        if (typeof store.zfHasContent === 'function' && store.zfHasContent()) {
          store.saveToLibrary();
        }
      }
    }, 1500);

    // Expose for buttons and keyboard handlers.
    window.ZFUndo = zfUndo;
    window.ZFRedo = zfRedoAction;
    window.ZFCanUndo = function () { return zfHistory.length > 0; };
    window.ZFCanRedo = function () { return zfRedo.length > 0; };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();