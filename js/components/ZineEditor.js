// Zine Forge - editor view: page list + page canvas
import { store } from '../store.js';

export const ZineEditor = {
  name: 'ZineEditor',
  data: function () {
    return { store: store, fileInputKey: 0 };
  },
  computed: {
    active: function () { return store.activePage(); }
  },
  methods: {
    selectPage: function (id) { store.activePageId = id; },
    pageLabel: function (page, i) {
      var h = (page.heading || '').trim();
      return h ? h : 'Page ' + (i + 1);
    },
    onImageChange: function (evt) {
      var file = evt.target.files && evt.target.files[0];
      if (!file) return;
      if (!/^image\//.test(file.type)) {
        store.status = 'Please pick an image file.';
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        store.status = 'Image is over 2 MB; pick a smaller one.';
        return;
      }
      var fr = new FileReader();
      fr.onload = function () { store.activePage().image = fr.result; };
      fr.readAsDataURL(file);
    },
    clearImage: function () {
      store.activePage().image = '';
      this.fileInputKey++;
    }
  },
  template:
    '<div class="zf-editor">' +
      '<aside>' +
        '<div class="zf-field">' +
          '<label class="zf-label" for="zf-zine-title">Zine title</label>' +
          '<input id="zf-zine-title" class="zf-input" v-model="store.title" />' +
        '</div>' +
        '<div class="zf-field">' +
          '<label class="zf-label" for="zf-zine-author">Author</label>' +
          '<input id="zf-zine-author" class="zf-input" v-model="store.author" />' +
        '</div>' +
        '<div class="zf-label" style="margin-top:0.75rem;">Pages</div>' +
        '<ul class="zf-page-list">' +
          '<li v-for="(p, i) in store.pages" :key="p.id" :class="{ active: p.id === store.activePageId }" @click="selectPage(p.id)">' +
            '<span>{{ pageLabel(p, i) }}<span class="zf-mini" v-if="p.image"> (img)</span></span>' +
            '<span class="zf-page-tools">' +
              '<button class="zf-icon-btn" @click.stop="store.movePage(p.id, -1)">&uarr;</button>' +
              '<button class="zf-icon-btn" @click.stop="store.movePage(p.id, 1)">&darr;</button>' +
              '<button class="zf-icon-btn" @click.stop="store.duplicatePage(p.id)">+</button>' +
              '<button class="zf-icon-btn" @click.stop="store.deletePage(p.id)">&times;</button>' +
            '</span>' +
          '</li>' +
        '</ul>' +
        '<div style="margin-top:0.5rem;">' +
          '<button class="zf-btn zf-btn-primary" @click="store.addPage()">Add page</button>' +
        '</div>' +
      '</aside>' +
      '<div>' +
        '<div class="zf-canvas-wrap">' +
          '<div class="zf-page">' +
            '<input class="zf-page-heading" v-model="active.heading" placeholder="Page heading" maxlength="80" />' +
            '<textarea class="zf-page-body" v-model="active.body" placeholder="Write your zine page here..."></textarea>' +
            '<div v-if="active.image"><img class="zf-page-image" :src="active.image" alt="Page illustration" /></div>' +
          '</div>' +
        '</div>' +
        '<div class="zf-inline-tools" style="margin-top:0.75rem;">' +
          '<label class="zf-btn zf-btn-secondary" style="color:var(--zf-blue-dark);border-color:var(--zf-border);cursor:pointer;">' +
            'Add image' +
            '<input :key="fileInputKey" type="file" accept="image/*" style="display:none;" @change="onImageChange" />' +
          '</label>' +
          '<button class="zf-btn zf-btn-secondary" style="color:var(--zf-blue-dark);border-color:var(--zf-border);" v-if="active.image" @click="clearImage">Remove image</button>' +
        '</div>' +
      '</div>' +
    '</div>'
};