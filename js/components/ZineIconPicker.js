// Zine Forge - icon picker modal
// Exposes window.ZineIconPicker for the main app to register.

window.ZineIconPicker = {
  name: 'ZineIconPicker',
  props: {
    open: { type: Boolean, default: false }
  },
  emits: ['select', 'close'],
  data: function () {
    return {
      query: '',
      results: [],
      loading: false,
      error: '',
      debounceTimer: null,
      // Monotonic token guarding against out-of-order search responses.
      // Must start at a real number so the first ++ yields a usable token.
      _searchToken: 0
    };
  },
  computed: {
    curated: function () {
      return [
        'ph:heart', 'ph:heart-fill', 'ph:star', 'ph:star-fill', 'ph:sparkle',
        'ph:flower', 'ph:flower-lotus', 'ph:sun', 'ph:moon-stars', 'ph:cloud',
        'ph:lightning', 'ph:eye', 'ph:eye-closed', 'ph:hand-heart', 'ph:smiley',
        'ph:smiley-wink', 'ph:cat', 'ph:bird', 'ph:butterfly', 'ph:tree',
        'ph:leaf', 'ph:fire', 'ph:drop', 'ph:snowflake', 'ph:rainbow',
        'ph:lightbulb', 'ph:book', 'ph:book-open', 'ph:pencil', 'ph:scissors',
        'ph:arrow-right', 'ph:arrow-left', 'ph:arrow-up', 'ph:arrow-down',
        'ph:asterisk', 'ph:phone', 'ph:envelope', 'ph:map-pin', 'ph:key',
        'ph:lock', 'ph:music-note', 'ph:headphones', 'ph:guitar', 'ph:camera',
        'ph:coffee', 'ph:pizza', 'ph:ice-cream', 'ph:airplane', 'ph:rocket',
        'ph:planet', 'ph:brain', 'ph:skull', 'ph:crown', 'ph:diamond',
        'ph:shield', 'ph:crosshair', 'ph:globe', 'ph:house', 'ph:anchor',
        'ph:signpost', 'ph:megaphone', 'ph:cloud-rain', 'ph:pepper'
      ];
    },
    displayList: function () {
      if (this.query.trim()) return this.results;
      return this.curated;
    }
  },
  watch: {
    query: function () {
      var self = this;
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      var q = this.query.trim();
      if (!q) {
        this.results = [];
        this.loading = false;
        return;
      }
      this.debounceTimer = setTimeout(function () {
        self.search(q);
      }, 300);
    }
  },
  methods: {
    search: function (q) {
      var self = this;
      this.loading = true;
      this.error = '';
      // Request token: if the user types again before this response lands,
      // _searchToken advances and this (stale) response is ignored. Prevents
      // a slow earlier query from overwriting a newer query's results.
      var token = ++this._searchToken;
      var url = 'https://api.iconify.design/search?query=' + encodeURIComponent(q) + '&limit=64';
      fetch(url).then(function (r) { return r.json(); }).then(function (data) {
        if (token !== self._searchToken) return;
        self.loading = false;
        if (data && Array.isArray(data.icons)) {
          self.results = data.icons;
        } else {
          self.results = [];
        }
      }).catch(function (err) {
        if (token !== self._searchToken) return;
        self.loading = false;
        self.error = 'Could not reach the icon search service.';
        console.warn('Iconify search failed', err);
      });
    },
    pick: function (name) {
      this.$emit('select', name);
    },
    onClose: function () {
      this.$emit('close');
    },
    onBackdrop: function (evt) {
      if (evt.target === evt.currentTarget) this.onClose();
    }
  },
  template:
    '<div v-if="open" class="zf-modal-backdrop" @click="onBackdrop">' +
      '<div class="zf-modal">' +
        '<div class="zf-modal-header">' +
          '<h2>Add an icon</h2>' +
          '<button class="zf-modal-close" @click="onClose" aria-label="Close">&times;</button>' +
        '</div>' +
        '<input class="zf-input" placeholder="Search icons (try: heart, star, flower, arrow)" v-model="query" style="margin-bottom:0.75rem;" />' +
        '<div v-if="error" class="zf-error" style="margin-bottom:0.5rem;">{{ error }}</div>' +
        '<div v-if="loading" class="zf-muted" style="margin-bottom:0.5rem;">Searching...</div>' +
        '<div v-else-if="!displayList.length" class="zf-muted" style="margin-bottom:0.5rem;">No icons found. Try another word.</div>' +
        '<div class="zf-icon-grid">' +
          '<button v-for="name in displayList" :key="name" class="zf-icon-tile" :title="name" @click="pick(name)">' +
            '<iconify-icon :icon="name"></iconify-icon>' +
          '</button>' +
        '</div>' +
        '<div class="zf-modal-footer zf-muted" style="font-size:0.75rem;">Icons from the Phosphor set via Iconify. Free to use in your zines.</div>' +
      '</div>' +
    '</div>'
};