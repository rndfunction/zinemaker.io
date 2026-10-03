// Zine Forge - error boundary component
// Catches errors thrown during render of a child view and shows a calm
// recovery panel instead of a blank screen. Exposes window.ZfErrorBoundary
// for the main app to register.

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
      try { store.setView('editor'); } catch (e) {}
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