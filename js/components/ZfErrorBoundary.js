// Zine Forge - error boundary component
// Catches errors thrown during render of a child view and shows a calm
// recovery panel instead of a blank screen. Exposes window.ZfErrorBoundary
// for zf-boot.js to register globally as <zf-error-boundary>.
//
// NOTE: this file was accidentally deleted in an earlier step that also
// patched it (patch + delete on the same path). It has been restored with
// the recover() fix that the patch intended to apply.
window.ZfErrorBoundary = {
  name: 'ZfErrorBoundary',
  data: function () { return { hasError: false }; },
  errorCaptured: function (err) {
    this.hasError = true;
    try { zfLog('View error captured: ' + (err && err.message ? err.message : err)); } catch (e) {}
    return false;
  },
  methods: {
    recover: function () {
      this.hasError = false;
      // store is NOT a global; it lives on window.ZF_STORE (published by
      // zf-store.js). Referencing bare `store` here threw a ReferenceError
      // that the old try/catch swallowed, so recovery silently did nothing.
      try {
        if (window.ZF_STORE) window.ZF_STORE.setView('editor');
      } catch (e) {}
    }
  },
  template:
    '<div>' +
      '<div v-if="hasError" class="zf-error-boundary" role="alert">' +
        '<h2>That page did not want to load.</h2>' +
        '<p>Your work is safe - it saves automatically as you go.</p>' +
        '<button class="zf-btn zf-btn-primary" @click="recover">Back to editor</button>' +
      '</div>' +
      '<slot v-else></slot>' +
    '</div>'
};