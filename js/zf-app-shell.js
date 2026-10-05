// zf-app-shell.js -- top-level app shell: masthead, view tabs, New Zine
// modal, and the slide-in settings panel. Extracted from the inline
// <script> in index.html. Classic script; reads the shared store from
// window.ZF_STORE (set by zf-store.js, which must load first).
(function () {
  'use strict';

  var store = window.ZF_STORE;

  var AppShell = {
    data: function () { return { store: store, tick: 0 }; },
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
        var t = store.lastSavedAt;
        if (!t) return '';
        var secs = Math.floor((Date.now() - t) / 1000);
        if (secs < 5) return 'Saved';
        if (secs < 60) return 'Saved ' + secs + 's ago';
        var mins = Math.floor(secs / 60);
        if (mins < 60) return 'Saved ' + mins + 'm ago';
        return 'Saved';
      },
      // Model + theme lists for the global settings panel.
      models: function () { return (window.ZFModels) ? window.ZFModels.listModels() : []; },
      themes: function () { return (window.ZFThemes) ? window.ZFThemes.listThemes() : []; }
    },
    methods: {
      onExport: function () { if (window.ZFExportJson) window.ZFExportJson(); },
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