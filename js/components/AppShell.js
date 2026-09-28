// Zine Forge - app shell: header + view switching
import { store } from '../store.js';

export const AppShell = {
  name: 'AppShell',
  data: function () {
    return { store: store };
  },
  methods: {
    goEditor: function () { store.setView('editor'); },
    goReader: function () { store.setView('reader'); },
    onNew: function () {
      if (confirm('Start a new zine? Unsaved changes will be lost.')) {
        store.newZine();
      }
    }
  },
  template:
    '<div>' +
      '<header class="zf-header">' +
        '<h1>Zine Forge <span class="zf-sub">make + share zines</span></h1>' +
        '<div class="zf-header-actions">' +
          '<button class="zf-btn zf-btn-secondary" @click="goEditor">Editor</button>' +
          '<button class="zf-btn zf-btn-secondary" @click="goReader">Read</button>' +
          '<button class="zf-btn zf-btn-secondary" @click="onNew">New</button>' +
        '</div>' +
      '</header>' +
      '<main class="zf-main">' +
        '<div v-if="store.status" class="zf-muted" role="status" aria-live="polite">{{ store.status }}</div>' +
        '<section v-show="store.view === \'editor\'"><zine-editor></zine-editor></section>' +
        '<section v-show="store.view === \'reader\'"><zine-reader></zine-reader></section>' +
      '</main>' +
    '</div>'
};