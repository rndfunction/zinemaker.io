// Zine Forge - entry point
import { AppShell } from './components/AppShell.js';
import { ZineEditor } from './components/ZineEditor.js';
import { ZineReader } from './components/ZineReader.js';
import { store } from './store.js';

var createApp = Vue.createApp;

// ---- shared-link loader ----
// Format: #z=<base64(JSON({t,a,p:[{h,b,i}]}))>
function loadSharedZineFromHash() {
  var hash = location.hash || '';
  var m = hash.match(/(?:^#|&)z=([^&]+)/);
  if (!m) return;
  try {
    var json = decodeURIComponent(escape(atob(m[1])));
    var parsed = JSON.parse(json);
    if (!parsed || !Array.isArray(parsed.p)) return;
    store.title = parsed.t || 'Untitled Zine';
    store.author = parsed.a || '';
    store.pages = parsed.p.map(function (p, i) {
      return {
        id: 'p' + i + '-' + Math.random().toString(36).slice(2, 7),
        heading: p.h || '',
        body: p.b || '',
        image: p.i || ''
      };
    });
    if (!store.pages.length) {
      store.pages = [{ id: 'p0', heading: '', body: '', image: '' }];
    }
    store.activePageId = store.pages[0].id;
    store.view = 'reader';
    store.status = 'Loaded a shared zine.';
    setTimeout(function () {
      if (store.status === 'Loaded a shared zine.') store.status = '';
    }, 3000);
  } catch (e) {
    console.warn('Could not parse shared zine', e);
    store.status = 'That share link could not be read.';
  }
}

var app = createApp({
  components: { AppShell: AppShell, ZineEditor: ZineEditor, ZineReader: ZineReader },
  data: function () { return { store: store }; },
  template: '<app-shell />'
});

window.ZF = { store: store };

app.mount('#app');

loadSharedZineFromHash();
window.addEventListener('hashchange', loadSharedZineFromHash);