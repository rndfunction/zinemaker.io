// Zine Forge - reader view: paged reading, print, share
import { store } from '../store.js';

export const ZineReader = {
  name: 'ZineReader',
  data: function () {
    return { store: store, currentIndex: 0, shareStatus: '' };
  },
  computed: {
    total: function () { return store.pages.length; },
    page: function () { return store.pages[this.currentIndex] || store.pages[0]; }
  },
  watch: {
    total: function (n) {
      if (this.currentIndex >= n) this.currentIndex = n - 1;
    }
  },
  methods: {
    next: function () {
      if (this.currentIndex < this.total - 1) this.currentIndex++;
    },
    prev: function () {
      if (this.currentIndex > 0) this.currentIndex--;
    },
    printZine: function () {
      window.print();
    },
    shareLink: function () {
      var self = this;
      try {
        var payload = {
          t: store.title,
          a: store.author,
          p: store.pages.map(function (p) {
            return { h: p.heading, b: p.body, i: p.image };
          })
        };
        var json = JSON.stringify(payload);
        var b64 = btoa(unescape(encodeURIComponent(json)));
        var url = location.origin + location.pathname + '#z=' + b64;
        var done = function (msg) {
          self.shareStatus = msg;
          setTimeout(function () { self.shareStatus = ''; }, 4000);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(
            function () { done('Share link copied to clipboard.'); },
            function () { done('Copy this link: ' + url); }
          );
        } else {
          done('Copy this link: ' + url);
        }
      } catch (e) {
        this.shareStatus = 'Could not build share link.';
      }
    }
  },
  template:
    '<div class="zf-reader">' +
      '<div class="zf-no-print" style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap;margin-bottom:1rem;">' +
        '<div>' +
          '<h2 style="margin:0;font-family:var(--zf-serif);">{{ store.title || \'Untitled Zine\' }}</h2>' +
          '<div class="zf-muted" v-if="store.author">by {{ store.author }}</div>' +
        '</div>' +
        '<div class="zf-header-actions" style="gap:0.5rem;">' +
          '<button class="zf-btn zf-btn-primary" @click="shareLink">Share link</button>' +
          '<button class="zf-btn" style="border-color:var(--zf-border);" @click="printZine">Print / PDF</button>' +
        '</div>' +
      '</div>' +
      '<div v-if="shareStatus" class="zf-muted" role="status" aria-live="polite" style="margin-bottom:0.75rem;">{{ shareStatus }}</div>' +
      '<article class="zf-reader-page" v-if="page">' +
        '<h2 v-if="page.heading">{{ page.heading }}</h2>' +
        '<img v-if="page.image" :src="page.image" alt="Page illustration" />' +
        '<div class="zf-reader-body">{{ page.body }}</div>' +
      '</article>' +
      '<div class="zf-pager zf-no-print">' +
        '<button class="zf-btn" style="border-color:var(--zf-border);" :disabled="currentIndex === 0" @click="prev">&larr; Previous</button>' +
        '<span class="zf-muted">Page {{ currentIndex + 1 }} of {{ total }}</span>' +
        '<button class="zf-btn" style="border-color:var(--zf-border);" :disabled="currentIndex >= total - 1" @click="next">Next &rarr;</button>' +
      '</div>' +
    '</div>'
};