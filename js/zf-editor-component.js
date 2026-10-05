// zf-editor-component.js -- the ZineEditor Vue component and its large
// methods table. Extracted from the inline <script> in index.html.
// Classic script; reads the shared store from window.ZF_STORE (set by
// zf-store.js, which must load first). Uses helpers from zf-editor.js
// (zfInjectMergedFlow, zfCompressAndPlace) and from util.js.
(function () {
  'use strict';

  var store = window.ZF_STORE;

  // Force reference to avoid unused warnings in some linters.
  var _zfStore = store;

  var ZF_EDITOR_METHODS = {
    selectPage: function (id) { store.activePageId = id; },
    onClearAllEditor: function () { if (window.ZFClearAll) window.ZFClearAll(); },
    pageLabel: function (page, i) {
      var h = (page.heading || "").trim();
      return h ? h : "Page " + (i + 1);
    },
    onModelChange: function (evt) { store.setModel(evt.target.value); },
    onThemeChange: function (evt) { store.setTheme(evt.target.value); },
    imageStyle: function (img) {
      if (!img) return {};
      var m = this.activeModel;
      if (!m) return {};
      // Delegate to the shared style function. Positions are % of the
      // mini-page so this works identically in every view.
      var base = zfElementStyle(img, m.page.width, m.page.height, store.marginIn, {});
      base.cursor = "grab";
      return base;
    },
    imageBlockStyle: function (img) {
      if (!img) return {};
      var m = this.activeModel;
      if (!m) return {};
      var base = zfElementStyle(img, m.page.width, m.page.height, store.marginIn, { block: true });
      base.borderRadius = "calc(0.02in * var(--zf-page-scale, 1))";
      base.marginBottom = "0.5rem";
      return base;
    },
    // -------- Z-order helpers --------
    // Clear any placed-element selection when the user starts working with
    // the page body text, so element handles don't linger while typing.
    clearElementSelection: function () {
      var page = this.active;
      if (!page) return;
      page.activeImageId = null;
      page.activeTextBoxId = null;
    },
    // -------- Layers (drag to reorder) --------
    layerDragClass: function (i) {
      if (this.layerDropIndex !== i || this.layerDragIndex < 0) return '';
      return this.layerDragIndex < i ? 'zf-drop-below' : 'zf-drop-above';
    },
    onLayerDragStart: function (evt, i) {
      this.layerDragIndex = i;
      try { evt.dataTransfer.effectAllowed = 'move'; evt.dataTransfer.setData('text/plain', String(i)); } catch (e) {}
    },
    onLayerDragOver: function (evt, i) {
      if (this.layerDragIndex < 0) return;
      evt.preventDefault();
      this.layerDropIndex = i;
    },
    onLayerDragLeave: function (evt, i) {
      if (this.layerDropIndex === i) this.layerDropIndex = -1;
    },
    onLayerDrop: function (evt, i) {
      evt.preventDefault();
      var from = this.layerDragIndex;
      var to = i;
      this.layerDragIndex = -1;
      this.layerDropIndex = -1;
      if (from < 0 || from === to) return;
      // Rebuild the layer order, then reassign z top-to-bottom so the
      // list (front at top) matches stacking order with no gaps.
      var order = this.layers.slice();
      var moved = order.splice(from, 1)[0];
      order.splice(to, 0, moved);
      var total = order.length;
      for (var k = 0; k < total; k++) {
        order[k].el.z = (total - k) * 10;
      }
    },
    onLayerDragEnd: function () {
      this.layerDragIndex = -1;
      this.layerDropIndex = -1;
    },
    // -------- Layers --------
    // Every object on the current page (images, icons, text boxes) as a
    // single list sorted front-to-back (highest z first).
    pageElements: function (page) {
      if (!page) return [];
      return (page.images || []).concat(page.textBoxes || []);
    },
    selectLayer: function (layer) {
      var page = this.active;
      if (!page || !layer) return;
      if (layer.kind === 'textBox') {
        page.activeTextBoxId = layer.el.id;
        page.activeImageId = null;
      } else {
        page.activeImageId = layer.el.id;
        page.activeTextBoxId = null;
      }
    },
    layerLabel: function (layer) {
      var el = layer.el;
      if (layer.kind === 'textBox') {
        if (el.kind === 'stamp') {
          var st = (el.html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
          return 'Stamp: ' + (st || 'stamp');
        }
        var t = (el.html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        return t ? (t.length > 24 ? t.slice(0, 24) + '...' : t) : 'Text box';
      }
      if (el.kind === 'icon') return 'Icon: ' + (el.src || '').replace('ph:', '');
      if (el.kind === 'tape') return 'Tape';
      if (el.kind === 'scrap') return 'Paper scrap';
      if (el.kind === 'sticky') return 'Sticky note';
      if (el.kind === 'sticker') return 'Sticker';
      return 'Image';
    },
    // Swap a specific element's z with the next higher/lower element.
    swapLayerZ: function (el, dir) {
      var page = this.active;
      if (!page || !el) return;
      var all = this.pageElements(page);
      var myZ = (typeof el.z === 'number') ? el.z : 0;
      var target = null;
      for (var i = 0; i < all.length; i++) {
        if (all[i] === el) continue;
        var iz = (typeof all[i].z === 'number') ? all[i].z : 0;
        if (dir > 0 && iz > myZ && (target === null || iz < target)) target = iz;
        if (dir < 0 && iz < myZ && (target === null || iz > target)) target = iz;
      }
      if (target === null) return;
      for (var j = 0; j < all.length; j++) {
        if (all[j] === el) continue;
        var jz = (typeof all[j].z === 'number') ? all[j].z : 0;
        if (jz === target) all[j].z = myZ;
      }
      el.z = target;
    },
    moveLayer: function (layer, dir) { this.swapLayerZ(layer.el, dir); },
    addTape: function () {
      var page = this.active;
      if (!page) return;
      if (!Array.isArray(page.images)) page.images = [];
      var tape = {
        id: zfNewImageId(),
        kind: 'tape',
        src: '',
        x: 0.5,
        y: 0.5,
        w: 0.9,
        h: 0.34,
        rot: -4,
        wrap: 'free',
        // Place new tape on top of everything already on the page so it
        // is immediately visible and grabbable, matching bringToFront's
        // convention of max z + 1 across images and text boxes combined.
        z: (function () {
          var maxZ = 0;
          var all = (page.images || []).concat(page.textBoxes || []);
          for (var zi = 0; zi < all.length; zi++) {
            if (typeof all[zi].z === 'number' && all[zi].z > maxZ) maxZ = all[zi].z;
          }
          return maxZ + 1;
        })(),
        color: 'beige'
      };
      page.images.push(tape);
      page.activeImageId = tape.id;
      page.activeTextBoxId = null;
    },
    addSticker: function () {
      var page = this.active;
      if (!page) return;
      if (!Array.isArray(page.images)) page.images = [];
      var sticker = {
        id: zfNewImageId(),
        kind: 'sticker',
        src: '',
        shape: 'circle',
        x: 0.6,
        y: 0.6,
        w: 0.9,
        h: 0.9,
        rot: 0,
        wrap: 'free',
        color: '#e94f4f'
      };
      page.images.push(sticker);
      page.activeImageId = sticker.id;
      page.activeTextBoxId = null;
    },
    addStamp: function () {
      var page = this.active;
      if (!page) return;
      if (!Array.isArray(page.textBoxes)) page.textBoxes = [];
      var stamp = {
        id: zfNewTextBoxId(),
        kind: 'stamp',
        html: 'APPROVED',
        x: 0.4,
        y: 1.0,
        w: 1.6,
        rot: -8,
        fontSize: 1.0,
        // Same convention as addTape: new stamp sits on top of the page's
        // existing elements so it is visible and selectable immediately.
        // (The old value keyed off textBoxes.length, which made a stamp's
        // stacking depend only on how many boxes happened to exist.)
        z: (function () {
          var maxZ = 0;
          var all = (page.images || []).concat(page.textBoxes || []);
          for (var zi = 0; zi < all.length; zi++) {
            if (typeof all[zi].z === 'number' && all[zi].z > maxZ) maxZ = all[zi].z;
          }
          return maxZ + 1;
        })(),
        color: '#c8102e'
      };
      page.textBoxes.push(stamp);
      page.activeTextBoxId = stamp.id;
      page.activeImageId = null;
      var self = this;
      this.$nextTick(function () { self.syncTextBoxDom(); });
    },
    addSticky: function () {
      var page = this.active;
      if (!page) return;
      if (!Array.isArray(page.images)) page.images = [];
      var note = {
        id: zfNewImageId(),
        kind: 'sticky',
        src: '',
        x: 0.6,
        y: 0.6,
        w: 1.1,
        h: 1.1,
        rot: -3,
        wrap: 'free',
        color: 'yellow'
      };
      page.images.push(note);
      page.activeImageId = note.id;
      page.activeTextBoxId = null;
    },
    addScrap: function () {
      var page = this.active;
      if (!page) return;
      if (!Array.isArray(page.images)) page.images = [];
      var scrap = {
        id: zfNewImageId(),
        kind: 'scrap',
        src: '',
        x: 0.4,
        y: 0.6,
        w: 1.4,
        h: 1.0,
        rot: 5,
        wrap: 'free',
        color: 'kraft'
      };
      page.images.push(scrap);
      page.activeImageId = scrap.id;
      page.activeTextBoxId = null;
    },
    // Merge a sticky note's positioning style with a custom background
    // color when its `color` is a hex value (set by the color picker).
    // Named variants still work via the zf-sticky-<name> class.
    // Set a sticker's fill color (hex from the color picker) via a CSS var.
    setStickerShape: function (shape) {
      var img = this.activeImage;
      if (!img || img.kind !== 'sticker') return;
      img.shape = shape;
    },
    shapeBtnStyle: function (shape) {
      var on = this.activeImage && this.activeImage.shape === shape;
      return {
        borderColor: 'var(--zf-border)',
        fontSize: '0.8rem',
        background: on ? 'var(--zf-blue)' : '#ffffff',
        color: on ? '#ffffff' : 'var(--zf-blue-dark)'
      };
    },
    stickerStyle: function (img, base) {
      var out = Object.assign({}, base || {});
      if (img && typeof img.color === 'string' && img.color.charAt(0) === '#') {
        out['--zf-sticker-bg'] = img.color;
      }
      return out;
    },
    stickyStyle: function (img, base) {
      var out = Object.assign({}, base || {});
      if (img && typeof img.color === 'string' && img.color.charAt(0) === '#') {
        out['--zf-sticky-bg'] = img.color;
      }
      return out;
    },
    toggleLayerHidden: function (layer) {
      if (!layer || !layer.el) return;
      layer.el.hidden = !layer.el.hidden;
    },
    removeLayer: function (layer) {
      var page = this.active;
      if (!page || !layer) return;
      var el = layer.el;
      if (layer.kind === 'textBox' && Array.isArray(page.textBoxes)) {
        var ti = page.textBoxes.indexOf(el);
        if (ti >= 0) page.textBoxes.splice(ti, 1);
        if (page.activeTextBoxId === el.id) page.activeTextBoxId = null;
      } else if (Array.isArray(page.images)) {
        var ii = page.images.indexOf(el);
        if (ii >= 0) page.images.splice(ii, 1);
        if (page.activeImageId === el.id) page.activeImageId = null;
      }
    },
    bringToFront: function () {
      var el = this.activeImage || this.activeTextBox;
      if (!el) return;
      var page = this.active;
      if (!page) return;
      var maxZ = 0;
      var all = (page.images || []).concat(page.textBoxes || []);
      for (var i = 0; i < all.length; i++) {
        if (typeof all[i].z === "number" && all[i].z > maxZ) maxZ = all[i].z;
      }
      el.z = maxZ + 1;
    },
    sendToBack: function () {
      var el = this.activeImage || this.activeTextBox;
      if (!el) return;
      var page = this.active;
      if (!page) return;
      var minZ = 0;
      var all = (page.images || []).concat(page.textBoxes || []);
      for (var i = 0; i < all.length; i++) {
        if (typeof all[i].z === "number" && all[i].z < minZ) minZ = all[i].z;
      }
      el.z = minZ - 1;
    },
    bringForward: function () {
      var el = this.activeImage || this.activeTextBox;
      if (!el) return;
      var page = this.active;
      if (!page) return;
      var all = (page.images || []).concat(page.textBoxes || []);
      var myZ = (typeof el.z === "number") ? el.z : 0;
      // Find the smallest z greater than mine and swap with it.
      var nextZ = null;
      for (var i = 0; i < all.length; i++) {
        if (all[i] === el) continue;
        var iz = (typeof all[i].z === "number") ? all[i].z : 0;
        if (iz > myZ && (nextZ === null || iz < nextZ)) nextZ = iz;
      }
      if (nextZ === null) return;
      // Swap z values.
      for (var j = 0; j < all.length; j++) {
        var jz = (typeof all[j].z === "number") ? all[j].z : 0;
        if (all[j] !== el && jz === nextZ) all[j].z = myZ;
      }
      el.z = nextZ;
    },
    sendBackward: function () {
      var el = this.activeImage || this.activeTextBox;
      if (!el) return;
      var page = this.active;
      if (!page) return;
      var all = (page.images || []).concat(page.textBoxes || []);
      var myZ = (typeof el.z === "number") ? el.z : 0;
      var prevZ = null;
      for (var i = 0; i < all.length; i++) {
        if (all[i] === el) continue;
        var iz = (typeof all[i].z === "number") ? all[i].z : 0;
        if (iz < myZ && (prevZ === null || iz > prevZ)) prevZ = iz;
      }
      if (prevZ === null) return;
      for (var j = 0; j < all.length; j++) {
        var jz = (typeof all[j].z === "number") ? all[j].z : 0;
        if (all[j] !== el && jz === prevZ) all[j].z = myZ;
      }
      el.z = prevZ;
    },
    // -------- Element deletion and duplication --------
    deleteSelectedElement: function () {
      var page = this.active;
      if (!page) return;
      if (page.activeTextBoxId && Array.isArray(page.textBoxes)) {
        var tIdx = -1;
        for (var i = 0; i < page.textBoxes.length; i++) {
          if (page.textBoxes[i].id === page.activeTextBoxId) { tIdx = i; break; }
        }
        if (tIdx >= 0) { page.textBoxes.splice(tIdx, 1); page.activeTextBoxId = null; return; }
      }
      if (page.activeImageId && Array.isArray(page.images)) {
        var iIdx = -1;
        for (var j = 0; j < page.images.length; j++) {
          if (page.images[j].id === page.activeImageId) { iIdx = j; break; }
        }
        if (iIdx >= 0) { page.images.splice(iIdx, 1); page.activeImageId = null; return; }
      }
    },
    // Keydown on a text box wrapper. Delete/Backspace removes the whole box
    // ONLY when the wrapper itself is focused (the element is "selected").
    // When the inner contenteditable is focused (you are typing), the event
    // is left alone so the browser edits text normally.
    onTextBoxKeydown: function (evt, box) {
      if (evt.key !== 'Delete' && evt.key !== 'Backspace') return;
      var t = evt.target;
      // If the event originated inside the editable content, let it be.
      if (t && t.classList && t.classList.contains('zf-textbox-content')) return;
      evt.preventDefault();
      this.deleteSelectedElement();
    },
    // Copy the selected element (image, icon, or text box) into a shared
    // in-memory buffer. The buffer persists across page changes so you can
    // copy on one page and paste on another.
    copySelected: function () {
      var page = this.active;
      if (!page) return;
      if (page.activeTextBoxId && Array.isArray(page.textBoxes)) {
        for (var i = 0; i < page.textBoxes.length; i++) {
          if (page.textBoxes[i].id === page.activeTextBoxId) {
            window.zfClipboard = { type: 'textBox', data: JSON.parse(JSON.stringify(page.textBoxes[i])) };
            store.status = 'Copied text box.';
            setTimeout(function () { if (store.status === 'Copied text box.') store.status = ''; }, 1500);
            return;
          }
        }
      }
      if (page.activeImageId && Array.isArray(page.images)) {
        for (var j = 0; j < page.images.length; j++) {
          if (page.images[j].id === page.activeImageId) {
            window.zfClipboard = { type: 'image', data: JSON.parse(JSON.stringify(page.images[j])) };
            store.status = 'Copied element.';
            setTimeout(function () { if (store.status === 'Copied element.') store.status = ''; }, 1500);
            return;
          }
        }
      }
    },
    // Paste the clipboard buffer onto the current page, offset slightly and
    // selected so it can be moved or restyled immediately.
    pasteElement: function () {
      var clip = window.zfClipboard;
      if (!clip || !clip.data) return;
      var page = this.active;
      if (!page) return;
      var d = clip.data;
      if (clip.type === 'textBox') {
        if (!Array.isArray(page.textBoxes)) page.textBoxes = [];
        var box = JSON.parse(JSON.stringify(d));
        box.id = zfNewTextBoxId();
        box.x = (typeof d.x === 'number' ? d.x : 0) + 0.15;
        box.y = (typeof d.y === 'number' ? d.y : 0) + 0.15;
        box.z = (typeof d.z === 'number' ? d.z : 0) + 1;
        page.textBoxes.push(box);
        page.activeTextBoxId = box.id;
        page.activeImageId = null;
        // Push the pasted box's HTML into its contenteditable (the DOM is
        // not v-html-bound, so new boxes start empty without this).
        var selfSync = this;
        this.$nextTick(function () { selfSync.syncTextBoxDom(); });
      } else {
        if (!Array.isArray(page.images)) page.images = [];
        var img = JSON.parse(JSON.stringify(d));
        img.id = zfNewImageId();
        img.x = (typeof d.x === 'number' ? d.x : 0) + 0.15;
        img.y = (typeof d.y === 'number' ? d.y : 0) + 0.15;
        img.z = (typeof d.z === 'number' ? d.z : 0) + 1;
        page.images.push(img);
        page.activeImageId = img.id;
        page.activeTextBoxId = null;
        var self = this;
        this.$nextTick(function () { self.injectShapeSpacer(); });
      }
      store.status = 'Pasted.';
      setTimeout(function () { if (store.status === 'Pasted.') store.status = ''; }, 1500);
    },
    duplicateSelectedElement: function () {
      var page = this.active;
      if (!page) return;
      // Text box duplication.
      if (page.activeTextBoxId && Array.isArray(page.textBoxes)) {
        for (var i = 0; i < page.textBoxes.length; i++) {
          if (page.textBoxes[i].id === page.activeTextBoxId) {
            var src = page.textBoxes[i];
            // Deep-copy the whole element so kind/color/fontFamily/etc survive.
            var copy = JSON.parse(JSON.stringify(src));
            copy.id = zfNewTextBoxId();
            copy.x = (src.x || 0) + 0.15;
            copy.y = (src.y || 0) + 0.15;
            copy.z = (typeof src.z === "number" ? src.z : 0) + 1;
            page.textBoxes.push(copy);
            page.activeTextBoxId = copy.id;
            var selfTb = this;
            this.$nextTick(function () { selfTb.syncTextBoxDom(); });
            return;
          }
        }
      }
      // Image duplication.
      if (page.activeImageId && Array.isArray(page.images)) {
        for (var j = 0; j < page.images.length; j++) {
          if (page.images[j].id === page.activeImageId) {
            var srcImg = page.images[j];
            // Deep-copy the whole element so kind/shape/color/h/hidden all
            // survive. Cherry-picking fields previously dropped `kind`, which
            // made duplicated icons/decorations render as broken images.
            var copyImg = JSON.parse(JSON.stringify(srcImg));
            copyImg.id = zfNewImageId();
            copyImg.x = (srcImg.x || 0) + 0.15;
            copyImg.y = (srcImg.y || 0) + 0.15;
            copyImg.z = (typeof srcImg.z === "number" ? srcImg.z : 0) + 1;
            page.images.push(copyImg);
            page.activeImageId = copyImg.id;
            var self = this;
            this.$nextTick(function () { self.injectShapeSpacer(); });
            return;
          }
        }
      }
    },
    goToPageId: function (id) {
      if (id) store.activePageId = id;
    },
    ghostSnippet: function (page) {
      if (!page) return '';
      var t = '';
      if (page.body) {
        t = String(page.body).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      }
      if (!t && page.heading) t = page.heading;
      if (!t) {
        // No heading or body text. A page can still have content as
        // images and/or placed text boxes, so don't call it blank.
        var hasImages = Array.isArray(page.images) && page.images.length > 0;
        var hasBoxes = Array.isArray(page.textBoxes) && page.textBoxes.length > 0;
        if (hasImages && hasBoxes) return '(images and elements)';
        if (hasImages) return '(images)';
        if (hasBoxes) return '(elements)';
        return '(blank page)';
      }
      return t.length > 80 ? t.slice(0, 80) + '...' : t;
    },
    isEmptyPage: function (page) {
      if (!page) return true;
      var hasHeading = !!(page.heading && String(page.heading).trim());
      var hasBody = !!(page.body && String(page.body).trim());
      var hasImages = Array.isArray(page.images) && page.images.length > 0;
      var hasTextBoxes = Array.isArray(page.textBoxes) && page.textBoxes.length > 0;
      return !(hasHeading || hasBody || hasImages || hasTextBoxes);
    },
    // Add a photo sized to cover the whole page (full bleed). The image is
    // enlarged until it fills both page dimensions, then centered with a
    // slight overhang so the printer trims the excess. Reuses the same file
    // pipeline and compression as onImageChange.
    onImageChangeFullBleed: function (evt) {
      var file = evt.target.files && evt.target.files[0];
      if (!file) return;
      if (!/^image\//.test(file.type)) { store.status = "Please pick an image file."; return; }
      if (file.size > 8 * 1024 * 1024) { store.status = "Image is over 8 MB."; return; }
      var fr = new FileReader();
      var self = this;
      fr.onload = function () {
        // Re-fetch the active page at push time (below), not here, so a
        // page switch during image decode does not drop the photo onto the
        // page that was active when the file was chosen.
        var page = store.activePage();
        if (page && !Array.isArray(page.images)) page.images = [];
        var m = self.activeModel;
        var pw = (m && m.page && m.page.width) ? m.page.width : 2.75;
        var ph = (m && m.page && m.page.height) ? m.page.height : 4.25;
        var bleed = 0.25;
        var coverW = pw + bleed * 2;
        var coverH = ph + bleed * 2;
        var img = {
          id: zfNewImageId(),
          src: fr.result,
          kind: 'photo',
          x: -bleed,
          y: -bleed,
          w: coverW,
          rot: 0,
          wrap: 'free',
          z: 0
        };
        // Enlarge so the image covers BOTH page dimensions regardless of
        // aspect (like background-size: cover). The wider/taller overflow is
        // centered and trimmed by the printer. Works for wide photos too:
        // pick the larger of the width-to-cover and height-to-cover scales.
        zfGetImageSize(fr.result, function (size) {
          if (size && size.w > 0 && size.h > 0) {
            var aspect = size.w / size.h;
            var wForWidth = coverW;               // width if fit to width
            var wForHeight = coverH * aspect;     // width if fit to height
            var w = Math.max(wForWidth, wForHeight);
            var h = w / aspect;
            img.w = w;
            img.x = -bleed - (w - coverW) / 2;    // center horizontally
            img.y = -bleed - (h - coverH) / 2;    // center vertically
          }
          zfCompressAndPlace(fr.result, 1600, 0.82, function (out) {
            img.src = out;
          });
          // Push to whatever page is active NOW, not the one captured when
          // the file dialog opened.
          var livePage = store.activePage();
          if (!Array.isArray(livePage.images)) livePage.images = [];
          livePage.images.push(img);
          livePage.activeImageId = img.id;
          self.fileInputKey++;
        });
      };
      fr.readAsDataURL(file);
    },
    onImageChange: function (evt) {
      var file = evt.target.files && evt.target.files[0];
      if (!file) return;
      if (!/^image\//.test(file.type)) { store.status = "Please pick an image file."; return; }
      if (file.size > 8 * 1024 * 1024) { store.status = "Image is over 8 MB."; return; }
      var fr = new FileReader();
      var self = this;
      fr.onload = function () {
        var page = store.activePage();
        if (!Array.isArray(page.images)) page.images = [];
        var img = {
          id: zfNewImageId(),
          src: fr.result,
          kind: 'photo',
          x: 0,
          y: 0,
          w: 1.5,
          rot: 0,
          wrap: "free"
        };
        zfCompressAndPlace(fr.result, 800, 0.8, function (out) {
          img.src = out;
        });
        // Push to the currently active page, not the one captured at file
        // selection, so a page switch mid-decode does not misplace the image.
        var livePage2 = store.activePage();
        if (!Array.isArray(livePage2.images)) livePage2.images = [];
        livePage2.images.push(img);
        livePage2.activeImageId = img.id;
        self.fileInputKey++;
      };
      fr.readAsDataURL(file);
    },
    clearImage: function () {
      var page = store.activePage();
      var img = this.activeImage;
      if (img && Array.isArray(page.images)) {
        var idx = page.images.indexOf(img);
        if (idx >= 0) page.images.splice(idx, 1);
      }
      page.activeImageId = null;
      this.fileInputKey++;
    },
    onImageMouseDown: function (evt) {
      // Legacy entry point used before the multi-image refactor. Kept for
      // safety; the new template calls onImageMouseDownItem.
      var img = this.activeImage;
      if (!img) return;
      this.onImageMouseDownItem(evt, img);
    },
      onImageMouseDownItem: function (evt, img) {
        if (!img) return;
        evt.preventDefault();
        // Placeholder slots (from templates): clicking one asks for a
        // replacement photo instead of starting a drag. The new image
        // inherits the slot's geometry; only src changes.
        if (img.placeholder) {
          this._replaceTargetId = img.id;
          var ri = this.$refs.replaceInput;
          if (ri) ri.click();
          return;
        }
        if (this.active) this.active.activeImageId = img.id;
        // Focus the wrapper so Delete/Backspace reach the element handler
        // instead of being swallowed by a contenteditable elsewhere.
        try { if (evt.currentTarget && evt.currentTarget.focus) evt.currentTarget.focus({ preventScroll: true }); } catch (e) {}
        // Re-inject flow spacers so the selection outline moves.
        var self = this;
        this.$nextTick(function () { self.injectShapeSpacer(); });
      this.imageDrag = {
        imgId: img.id,
        mode: "move",
        startX: evt.clientX,
        startY: evt.clientY,
        baseX: (typeof img.x === "number") ? img.x : 0,
        baseY: (typeof img.y === "number") ? img.y : 0
      };
    },
    onResizeStart: function (evt, img) {
      if (!img) return;
      evt.stopPropagation();
      evt.preventDefault();
      var px = 96 * this.imageScale;
      var m = this.activeModel;
      if (!m) return;
      var pageEl = this.$refs.miniPage;
      if (!pageEl) return;
      var pr = pageEl.getBoundingClientRect();
      var margin = store.marginIn;
      var cxIn = (typeof img.x === "number" ? img.x : 0) + margin + (img.w / 2);
      var cyIn = (typeof img.y === "number" ? img.y : 0) + margin + (img.w * 0.75 / 2);
      var cx = pr.left + cxIn * px;
      var cy = pr.top + cyIn * px;
      var dx = evt.clientX - cx;
      var dy = evt.clientY - cy;
      var startDist = Math.sqrt(dx * dx + dy * dy) || 1;
      // Elements with an explicit height (tape, scraps, sticky notes) resize
      // freely in both axes; photos/icons keep the locked-ratio resize.
      var freeAxis = (typeof img.h === "number");
      this.imageDrag = {
        imgId: img.id,
        mode: freeAxis ? "resize-free" : "resize",
        startDist: startDist,
        baseW: (typeof img.w === "number") ? img.w : 1.5,
        baseH: (typeof img.h === "number") ? img.h : 1,
        startX: evt.clientX,
        startY: evt.clientY,
        cx: cx,
        cy: cy
      };
      if (this.active) this.active.activeImageId = img.id;
    },
    onTextBoxResizeStartScaled: function (evt, box) {
      // Resize both the box AND its font size proportionally so dragging
      // the corner makes the text bigger, like images.
      if (!box) return;
      evt.stopPropagation();
      evt.preventDefault();
      var px = 96 * this.imageScale;
      var pageEl = this.$refs.miniPage;
      if (!pageEl) return;
      var pr = pageEl.getBoundingClientRect();
      var margin = store.marginIn;
      var w = (typeof box.w === 'number') ? box.w : 1.8;
      var cxIn = (typeof box.x === 'number' ? box.x : 0) + margin + w / 2;
      var cyIn = (typeof box.y === 'number' ? box.y : 0) + margin + 0.4;
      var cx = pr.left + cxIn * px;
      var cy = pr.top + cyIn * px;
      var dx = evt.clientX - cx;
      var dy = evt.clientY - cy;
      var startDist = Math.sqrt(dx * dx + dy * dy) || 1;
      this.imageDrag = {
        imgId: box.id,
        mode: "resize-scaled",
        isText: true,
        startDist: startDist,
        baseW: w,
        baseFontSize: (typeof box.fontSize === 'number') ? box.fontSize : 1.0,
        cx: cx,
        cy: cy
      };
      this.selectTextBox(box);
    },
    onRotateStart: function (evt, img) {
      if (!img) return;
      evt.stopPropagation();
      evt.preventDefault();
      var px = 96 * this.imageScale;
      var m = this.activeModel;
      if (!m) return;
      var pageEl = this.$refs.miniPage;
      if (!pageEl) return;
      var pr = pageEl.getBoundingClientRect();
      var margin = store.marginIn;
      var cxIn = (typeof img.x === "number" ? img.x : 0) + margin + (img.w / 2);
      var cyIn = (typeof img.y === "number" ? img.y : 0) + margin + (img.w * 0.75 / 2);
      var cx = pr.left + cxIn * px;
      var cy = pr.top + cyIn * px;
      var dx = evt.clientX - cx;
      var dy = evt.clientY - cy;
      var startAngle = Math.atan2(dy, dx) * 180 / Math.PI;
      this.imageDrag = {
        imgId: img.id,
        mode: "rotate",
        startAngle: startAngle,
        baseRot: (typeof img.rot === "number") ? img.rot : 0,
        cx: cx,
        cy: cy
      };
      if (this.active) this.active.activeImageId = img.id;
    },
    onImageMouseMove: function (evt) {
      if (!this.imageDrag) return;
      var page = this.active;
      var m = this.activeModel;
      if (!page || !m) return;
      var img = null;
      if (this.imageDrag.isText && Array.isArray(page.textBoxes)) {
        for (var ti = 0; ti < page.textBoxes.length; ti++) {
          if (page.textBoxes[ti].id === this.imageDrag.imgId) { img = page.textBoxes[ti]; break; }
        }
      } else if (Array.isArray(page.images)) {
        for (var i = 0; i < page.images.length; i++) {
          if (page.images[i].id === this.imageDrag.imgId) { img = page.images[i]; break; }
        }
      }
      if (!img) return;
      var pxPerInch = 96 * this.imageScale;
      var mode = this.imageDrag.mode || "move";
      if (mode === "move") {
        var dxIn = (evt.clientX - this.imageDrag.startX) / pxPerInch;
        var dyIn = (evt.clientY - this.imageDrag.startY) / pxPerInch;
        img.x = Math.round((this.imageDrag.baseX + dxIn) * 100) / 100;
        img.y = Math.round((this.imageDrag.baseY + dyIn) * 100) / 100;
      } else if (mode === "resize-free") {
        // Independent width and height: horizontal drag changes w, vertical
        // drag changes h. Uses a projection so the element grows with the
        // cursor rather than as a distance ratio.
        var px = 96 * this.imageScale;
        var fdx = (evt.clientX - this.imageDrag.startX) / px;
        var fdy = (evt.clientY - this.imageDrag.startY) / px;
        var fw = this.imageDrag.baseW + fdx;
        var fh = this.imageDrag.baseH + fdy;
        if (fw < 0.15) fw = 0.15;
        if (fw > 24) fw = 24;
        if (fh < 0.1) fh = 0.1;
        if (fh > 24) fh = 24;
        img.w = Math.round(fw * 100) / 100;
        img.h = Math.round(fh * 100) / 100;
      } else if (mode === "resize") {
        var dx = evt.clientX - this.imageDrag.cx;
        var dy = evt.clientY - this.imageDrag.cy;
        var dist = Math.sqrt(dx * dx + dy * dy) || 1;
        var ratio = dist / this.imageDrag.startDist;
        var newW = this.imageDrag.baseW * ratio;
        if (newW < 0.25) newW = 0.25;
        // Generous upper bound so tape (and images) can span past the page
        // edge, the way real zine tape runs off the paper. The mini-page's
        // overflow:hidden trims anything outside the page for print.
        if (newW > 24) newW = 24;
        img.w = Math.round(newW * 100) / 100;
      } else if (mode === "resize-scaled") {
        // Text box: scale width and font size together.
        var sdx = evt.clientX - this.imageDrag.cx;
        var sdy = evt.clientY - this.imageDrag.cy;
        var sdist = Math.sqrt(sdx * sdx + sdy * sdy) || 1;
        var sratio = sdist / this.imageDrag.startDist;
        var nw = this.imageDrag.baseW * sratio;
        var nf = this.imageDrag.baseFontSize * sratio;
        if (nw < 0.4) nw = 0.4;
        if (nw > 8) nw = 8;
        if (nf < 0.3) nf = 0.3;
        if (nf > 4) nf = 4;
        img.w = Math.round(nw * 100) / 100;
        img.fontSize = Math.round(nf * 100) / 100;
      } else if (mode === "rotate") {
        var rdx = evt.clientX - this.imageDrag.cx;
        var rdy = evt.clientY - this.imageDrag.cy;
        var angle = Math.atan2(rdy, rdx) * 180 / Math.PI;
        var delta = angle - this.imageDrag.startAngle;
        var newRot = this.imageDrag.baseRot + delta;
        // Snap near multiples of 15 degrees when close.
        var snapped = Math.round(newRot / 15) * 15;
        if (Math.abs(newRot - snapped) < 3) newRot = snapped;
        // Wrap to -180..180.
        while (newRot > 180) newRot -= 360;
        while (newRot < -180) newRot += 360;
        img.rot = Math.round(newRot);
      }
      if (!this.imageDrag.isText && img.wrap === "flow") {
        var self = this;
        if (!this._spacerScheduled) {
          this._spacerScheduled = true;
          requestAnimationFrame(function () {
            self._spacerScheduled = false;
            self.injectShapeSpacer();
          });
        }
      }
    },
    onImageMouseUp: function () {
      var wasDragging = !!this.imageDrag;
      var wasText = this.imageDrag && this.imageDrag.isText;
      this.imageDrag = null;
      if (wasDragging && !wasText) {
        var self = this;
        this.$nextTick(function () { self.injectShapeSpacer(); });
      }
    },
    setImageW: function (v) {
      var img = this.activeImage;
      if (!img) return;
      img.w = Math.max(0.25, Math.min(8, Number(v)));
    },
    setIconColor: function (c) {
      var img = this.activeImage;
      if (!img) return;
      img.color = c;
    },
    setImageRot: function (v) {
      var img = this.activeImage;
      if (!img) return;
      img.rot = Math.round(Number(v));
    },
    setImageWrap: function (mode) {
      var img = this.activeImage;
      if (!img) return;
      // Flow mode is limited to one image per side (left / right) because
      // CSS shape-outside only supports one merged polygon per float and
      // same-side notches stack unpredictably. If switching this image to
      // flow would put two flow images on the same side, auto-switch the
      // conflicting one to "free".
      // Whenever we leave flow mode, clear any leftover flow elements.
      var self0 = this;
      if (mode !== "flow") {
        this.$nextTick(function () {
          var el = self0.$refs.bodyEditor;
          if (!el) return;
          var stale = el.querySelectorAll('[data-zf-spacer="1"][data-zf-img-id="' + img.id + '"], [data-zf-flow-img="1"][data-zf-img-id="' + img.id + '"], [data-zf-flow-wrap="1"][data-zf-img-id="' + img.id + '"]');
          for (var i = 0; i < stale.length; i++) stale[i].remove();
        });
      }
      if (mode === "flow") {
        var page = this.active;
        var m = this.activeModel;
        if (page && m && Array.isArray(page.images)) {
          var margin = store.marginIn;
          var bodyW = m.page.width - margin * 2;
          // Which side is this image on?
          var cx = (typeof img.x === "number" ? img.x : 0) + (typeof img.w === "number" ? img.w : 1.5) / 2;
          var mySide = (cx < bodyW / 2) ? "left" : "right";
          for (var i = 0; i < page.images.length; i++) {
            var other = page.images[i];
            if (other === img) continue;
            if (other.wrap !== "flow") continue;
            var ocx = (typeof other.x === "number" ? other.x : 0) + (typeof other.w === "number" ? other.w : 1.5) / 2;
            var otherSide = (ocx < bodyW / 2) ? "left" : "right";
            if (otherSide === mySide) {
              other.wrap = "free";
              store.status = "Only one flow image per side - switched the other to text-behind.";
              setTimeout(function () {
                if (store.status.indexOf("Only one flow image per side") === 0) store.status = "";
              }, 3000);
            }
          }
        }
      }
      img.wrap = mode;
      var self = this;
      this.$nextTick(function () { self.injectShapeSpacer(); });
    },
    resetImage: function () {
      var img = this.activeImage;
      if (!img) return;
      img.x = 0;
      img.y = 0;
      img.w = 1.5;
      img.rot = 0;
      img.wrap = "free";
      var self = this;
      this.$nextTick(function () { self.injectShapeSpacer(); });
    },
    fitImage: function () {
      var img = this.activeImage;
      var m = this.activeModel;
      if (!img || !m) return;
      var w = m.page.width;
      var margin = store.marginIn;
      img.x = 0;
      img.y = 0;
      img.w = Math.max(0.5, w - margin * 2);
      img.rot = 0;
      var self = this;
      this.$nextTick(function () { self.injectShapeSpacer(); });
    },
    selectImage: function (img) {
      var page = this.active;
      if (!page || !img) return;
      page.activeImageId = img.id;
      page.activeTextBoxId = null;
    },
    // Replace the image inside a placeholder slot in place: keep the
    // element's position/size/rotation/etc., swap only src, and drop the
    // placeholder flag so the "Replace image" affordance disappears.
    onReplaceImageChange: function (evt) {
      var file = evt.target.files && evt.target.files[0];
      var self = this;
      var targetId = this._replaceTargetId;
      this._replaceTargetId = null;
      if (evt.target) evt.target.value = '';
      if (!file || !targetId) return;
      if (!/^image\//.test(file.type)) { store.status = 'Please pick an image file.'; return; }
      if (file.size > 8 * 1024 * 1024) { store.status = 'Image is over 8 MB.'; return; }
      var page = this.active;
      if (!page || !Array.isArray(page.images)) return;
      var target = null;
      for (var i = 0; i < page.images.length; i++) {
        if (page.images[i].id === targetId) { target = page.images[i]; break; }
      }
      if (!target) return;
      var fr = new FileReader();
      fr.onload = function () {
        var dataUrl = fr.result;
        // If this slot is a full-bleed slot (it overflows the page), re-fit
        // the new photo to cover the page so a different aspect ratio still
        // fills edge to edge. Ordinary slots keep their geometry untouched,
        // so a small multi-photo slot stays a small slot.
        var m = self.activeModel;
        var pw = (m && m.page && m.page.width) ? m.page.width : 2.75;
        var ph = (m && m.page && m.page.height) ? m.page.height : 4.25;
        var isBleed = (typeof target.x === 'number' && target.x < 0) ||
                      (typeof target.w === 'number' && target.w > pw);
        zfGetImageSize(dataUrl, function (size) {
          if (isBleed && size && size.w > 0 && size.h > 0) {
            var bleed = 0.25;
            var coverW = pw + bleed * 2;
            var coverH = ph + bleed * 2;
            var aspect = size.w / size.h;
            var w = Math.max(coverW, coverH * aspect);
            var h = w / aspect;
            target.w = w;
            target.x = -bleed - (w - coverW) / 2;
            target.y = -bleed - (h - coverH) / 2;
            target.rot = 0;
          }
          zfCompressAndPlace(dataUrl, 1600, 0.82, function (out) {
            target.src = out;
            target.placeholder = false;
            page.activeImageId = target.id;
            self.fileInputKey++;
          });
        });
      };
      fr.readAsDataURL(file);
    },
    // -------- Icon picker --------
    openIconPicker: function () {
      this.iconPickerOpen = true;
      this.iconPickerQuery = '';
    },
    closeIconPicker: function () {
      this.iconPickerOpen = false;
    },
    addIcon: function (iconName) {
      var page = this.active;
      if (!page || !iconName) return;
      if (!Array.isArray(page.images)) page.images = [];
      var el = {
        id: zfNewImageId(),
        kind: 'icon',
        src: iconName,
        x: 0.3,
        y: 0.3,
        w: 0.6,
        rot: 0,
        wrap: 'free',
        z: 0
      };
      page.images.push(el);
      page.activeImageId = el.id;
      page.activeTextBoxId = null;
      this.iconPickerOpen = false;
      var self = this;
      this.$nextTick(function () { self.injectShapeSpacer(); });
    },
    // -------- QR codes --------
    openQrModal: function () {
      this.qrUrl = '';
      this.qrModalOpen = true;
      var self = this;
      this.$nextTick(function () {
        var el = document.getElementById('zf-qr-url');
        if (el) el.focus();
      });
    },
    closeQrModal: function () {
      this.qrModalOpen = false;
    },
    generateQr: function () {
      var url = (this.qrUrl || '').trim();
      if (!url) { store.status = 'Enter a link first.'; return; }
      if (!window.qrcode) { store.status = 'QR library failed to load.'; return; }
      var page = this.active;
      if (!page) return;
      if (!Array.isArray(page.images)) page.images = [];
      try {
        var qr = window.qrcode(0, 'M');
        qr.addData(url);
        qr.make();
        var count = qr.getModuleCount();
        var scale = 8;
        var pad = 2;
        var size = (count + pad * 2) * scale;
        var canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = '#000000';
        for (var r = 0; r < count; r++) {
          for (var c = 0; c < count; c++) {
            if (qr.isDark(r, c)) {
              ctx.fillRect((c + pad) * scale, (r + pad) * scale, scale, scale);
            }
          }
        }
        var dataUrl = canvas.toDataURL('image/png');
        var img = {
          id: zfNewImageId(),
          src: dataUrl,
          kind: 'photo',
          x: 0.3,
          y: 0.3,
          w: 0.9,
          rot: 0,
          wrap: 'free',
          z: 0
        };
        page.images.push(img);
        page.activeImageId = img.id;
        page.activeTextBoxId = null;
        this.qrModalOpen = false;
        store.status = 'QR code added.';
        var self = this;
        setTimeout(function () { if (store.status === 'QR code added.') store.status = ''; }, 2000);
        this.$nextTick(function () { self.injectShapeSpacer(); });
      } catch (e) {
        store.status = 'Could not make QR code: ' + (e && e.message ? e.message : e);
      }
    },
    addTextBox: function () {
      var page = this.active;
      if (!page) return;
      if (!Array.isArray(page.textBoxes)) page.textBoxes = [];
      var box = {
        id: zfNewTextBoxId(),
        html: 'New text',
        x: 0.3,
        y: 0.3,
        w: 1.8,
        rot: 0,
        fontSize: 1.0  // multiplier on base body font size
      };
      page.textBoxes.push(box);
      page.activeTextBoxId = box.id;
      page.activeImageId = null;
        var self = this;
        this.$nextTick(function () {
          // Sync the DOM (so the contenteditable shows box.html) and focus
          // the new box so the user can type immediately.
          self.syncTextBoxDom();
          var contentEl = document.querySelector('[data-zf-text-content-id="' + box.id + '"]');
          if (contentEl) contentEl.focus();
        });
    },
    selectTextBox: function (box) {
      var page = this.active;
      if (!page || !box) return;
      page.activeTextBoxId = box.id;
      page.activeImageId = null;
    },
    setTextBoxW: function (v) {
      var box = this.activeTextBox;
      if (!box) return;
      box.w = Math.max(0.4, Math.min(8, Number(v)));
    },
    setTextBoxRot: function (v) {
      var box = this.activeTextBox;
      if (!box) return;
      box.rot = Math.round(Number(v));
    },
    setTextBoxFontSize: function (v) {
      var box = this.activeTextBox;
      if (!box) return;
      box.fontSize = Math.max(0.5, Math.min(3, Number(v)));
    },
    resetTextBox: function () {
      var box = this.activeTextBox;
      if (!box) return;
      box.x = 0.3;
      box.y = 0.3;
      box.w = 1.8;
      box.rot = 0;
      box.fontSize = 1.0;
    },
    textStyle: function (box) {
      if (!box) return {};
      var m = this.activeModel;
      if (!m) return {};
      var base = zfTextBoxStyle(box, m.page.width, m.page.height, store.marginIn);
      base.minHeight = "1em";
      base.cursor = "move";
      return base;
    },
    setTextBoxAlign: function (align) {
      var box = this.activeTextBox;
      if (!box) return;
      box.align = align;
    },
    setTextBoxLineHeight: function (v) {
      var box = this.activeTextBox;
      if (!box) return;
      box.lineHeight = Math.max(0.8, Math.min(3, Number(v)));
    },
    setTextBoxColor: function (c) {
      var box = this.activeTextBox;
      if (!box) return;
      box.color = c;
    },
    setTextBoxFontFamily: function (fam) {
      var box = this.activeTextBox;
      if (!box) return;
      box.fontFamily = fam;
    },
    applyFont: function (fam) {
      if (!fam) return;
      // Apply to the selected text box (whole-box font). This mirrors the
      // inspector's font control but keeps the action one click away.
      if (this.activeTextBox) { this.activeTextBox.fontFamily = fam; return; }
      var page = this.active;
      if (page && page.activeTextBoxId && Array.isArray(page.textBoxes)) {
        for (var i = 0; i < page.textBoxes.length; i++) {
          if (page.textBoxes[i].id === page.activeTextBoxId) { page.textBoxes[i].fontFamily = fam; return; }
        }
      }
    },
    captureTextSelection: function () {
      // Save the current document selection before the color picker steals
      // focus (its mousedown is prevented, but the picker UI can still
      // collapse it).
      var sel = window.getSelection ? window.getSelection() : null;
      if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
        this._savedTextSel = sel.getRangeAt(0).cloneRange ? sel : null;
        try {
          var r = sel.getRangeAt(0);
          var clone = document.createRange();
          clone.setStart(r.startContainer, r.startOffset);
          clone.setEnd(r.endContainer, r.endOffset);
          var savedSel = window.getSelection();
          // Store as a lightweight holder we can re-apply.
          this._savedRange = clone;
        } catch (e) { this._savedRange = null; }
      }
    },
    applyColor: function (c) {
      if (!c) return;
      var el = document.activeElement;
      var inTextBox = el && el.classList && el.classList.contains('zf-textbox-content');
      var sel = window.getSelection ? window.getSelection() : null;
      var hasTextSel = sel && sel.rangeCount > 0 && !sel.isCollapsed;
      // If the live selection is empty, fall back to the selection saved on
      // color-input mousedown (clicking the input can collapse it).
      if (!hasTextSel && this._savedTextSel && this._savedTextSel.rangeCount > 0 && !this._savedTextSel.isCollapsed) {
        try { sel.removeAllRanges(); sel.addRange(this._savedTextSel.getRangeAt(0)); hasTextSel = true; } catch (e) {}
      }
      var page0 = this.active;
      // Priority is based on what is focused RIGHT NOW, not a stale element
      // id. A live text selection (body or text box) wins; only when there
      // is no text selection do we color a selected element.
      //
      // 1) Text within a text box (editing)
      if (inTextBox) {
        try { document.execCommand('foreColor', false, c); } catch (e) {}
        var page = this.active;
        if (page && Array.isArray(page.textBoxes)) {
          var tid = el.getAttribute('data-zf-text-content-id');
          for (var i = 0; i < page.textBoxes.length; i++) {
            if (page.textBoxes[i].id === tid) { page.textBoxes[i].html = zfSanitizeHtml(el.innerHTML); break; }
          }
        }
        return;
      }
      // 2) Live text selection in the page body (or anywhere contenteditable)
      if (hasTextSel) {
        try { document.execCommand('foreColor', false, c); } catch (e) {}
        var bodyEl = this.$refs.bodyEditor;
        if (bodyEl && (document.activeElement === bodyEl || bodyEl.contains(sel.anchorNode))) {
          store.activePage().body = zfSanitizeHtml(zfStripSpacers(bodyEl.innerHTML));
          if (page0) { page0.activeImageId = null; page0.activeTextBoxId = null; }
        }
        return;
      }
      // 3) No text selection: color the selected element by its explicit id.
      if (page0 && page0.activeTextBoxId && Array.isArray(page0.textBoxes)) {
        for (var b0 = 0; b0 < page0.textBoxes.length; b0++) {
          if (page0.textBoxes[b0].id === page0.activeTextBoxId) { page0.textBoxes[b0].color = c; return; }
        }
      }
      if (page0 && page0.activeImageId && Array.isArray(page0.images)) {
        for (var i0 = 0; i0 < page0.images.length; i0++) {
          if (page0.images[i0].id === page0.activeImageId) { page0.images[i0].color = c; return; }
        }
      }
      if (this.activeTextBox) { this.setTextBoxColor(c); return; }
      if (this.activeImage) { this.setIconColor(c); return; }
    },
    resetColor: function () {
      if (this.activeTextBox) { this.setTextBoxColor(''); return; }
      if (this.activeImage) { this.setIconColor(''); return; }
      try { document.execCommand('foreColor', false, ''); } catch (e) {}
    },
    execCmdOnActive: function (cmd) {
      try {
        document.execCommand(cmd, false, null);
      } catch (e) {
        console.warn('execCommand failed', e);
      }
      var el = document.activeElement;
      if (el && el.classList && el.classList.contains('zf-textbox-content')) {
        var page = this.active;
        if (page && Array.isArray(page.textBoxes)) {
          var tid = el.getAttribute('data-zf-text-content-id');
          for (var i = 0; i < page.textBoxes.length; i++) {
            if (page.textBoxes[i].id === tid) {
              page.textBoxes[i].html = zfSanitizeHtml(el.innerHTML);
              break;
            }
          }
        }
      } else {
        var bEl = this.$refs.bodyEditor;
        if (bEl && this.active) this.active.body = zfSanitizeHtml(zfStripSpacers(bEl.innerHTML));
      }
    },
    onTextBoxInput: function (evt, box) {
      // Read innerHTML only. Do NOT write it back via Vue's v-html (that
      // would move the caret to position 0 on every keystroke). See
      // syncTextBoxDom for the one-time DOM sync.
      box.html = zfSanitizeHtml(evt.target.innerHTML);
    },
    syncTextBoxDom: function () {
      // Set the contenteditable innerHTML from the store once, only if it
      // has drifted (e.g. on page change or first render). Skipped for
      // the element currently focused to avoid disrupting the caret.
      // Also syncs the main body editor the same way (see below).
      var self = this;
      this.$nextTick(function () {
        var page = self.active;
        if (!page) return;
        // 1) Main body contenteditable.
        var bodyEl = self.$refs.bodyEditor;
        if (bodyEl) {
          var desiredBody = page.body || '';
          if (document.activeElement !== bodyEl && bodyEl.innerHTML !== desiredBody) {
            bodyEl.innerHTML = desiredBody;
          }
        }
        // 2) Placed text boxes.
        if (!Array.isArray(page.textBoxes)) return;
        for (var i = 0; i < page.textBoxes.length; i++) {
          var box = page.textBoxes[i];
          var el = document.querySelector('[data-zf-text-content-id="' + box.id + '"]');
          if (!el) continue;
          if (document.activeElement === el) continue;
          var desired = box.html || '';
          if (el.innerHTML !== desired) el.innerHTML = desired;
        }
      });
    },
    onTextBoxMouseDown: function (evt, box) {
      if (!box) return;
      var page = this.active;
      var alreadyActive = page && page.activeTextBoxId === box.id;
      if (evt.target && evt.target.isContentEditable) {
        // Two-state interaction: the first click selects the box (so it can
        // be moved or deleted); a second click enters text editing.
        if (!alreadyActive) {
          evt.preventDefault();
          this.selectTextBox(box);
          var wrap = evt.currentTarget;
          if (wrap && wrap.focus) { try { wrap.focus(); } catch (e) {} }
          return;
        }
        // Already active: let the user type normally.
        this.selectTextBox(box);
        return;
      }
      evt.preventDefault();
      this.selectTextBox(box);
      var self = this;
      if (evt.currentTarget && evt.currentTarget.focus) {
        try { evt.currentTarget.focus({ preventScroll: true }); } catch (e) {}
      }
      this.imageDrag = {
        imgId: box.id,
        mode: 'move',
        isText: true,
        startX: evt.clientX,
        startY: evt.clientY,
        baseX: (typeof box.x === 'number') ? box.x : 0,
        baseY: (typeof box.y === 'number') ? box.y : 0
      };
    },
    onTextBoxResizeStart: function (evt, box) {
      if (!box) return;
      evt.stopPropagation();
      evt.preventDefault();
      var px = 96 * this.imageScale;
      var m = this.activeModel;
      if (!m) return;
      var pageEl = this.$refs.miniPage;
      if (!pageEl) return;
      var pr = pageEl.getBoundingClientRect();
      var margin = store.marginIn;
      var w = (typeof box.w === 'number') ? box.w : 1.8;
      var cxIn = (typeof box.x === 'number' ? box.x : 0) + margin + w / 2;
      var cyIn = (typeof box.y === 'number' ? box.y : 0) + margin + 0.4;
      var cx = pr.left + cxIn * px;
      var cy = pr.top + cyIn * px;
      var dx = evt.clientX - cx;
      var dy = evt.clientY - cy;
      var startDist = Math.sqrt(dx * dx + dy * dy) || 1;
      this.imageDrag = {
        imgId: box.id,
        mode: 'resize',
        isText: true,
        startDist: startDist,
        baseW: w,
        cx: cx,
        cy: cy
      };
      this.selectTextBox(box);
    },
    onTextBoxRotateStart: function (evt, box) {
      if (!box) return;
      evt.stopPropagation();
      evt.preventDefault();
      var px = 96 * this.imageScale;
      var pageEl = this.$refs.miniPage;
      if (!pageEl) return;
      var pr = pageEl.getBoundingClientRect();
      var margin = store.marginIn;
      var w = (typeof box.w === 'number') ? box.w : 1.8;
      var cxIn = (typeof box.x === 'number' ? box.x : 0) + margin + w / 2;
      var cyIn = (typeof box.y === 'number' ? box.y : 0) + margin + 0.4;
      var cx = pr.left + cxIn * px;
      var cy = pr.top + cyIn * px;
      var dx = evt.clientX - cx;
      var dy = evt.clientY - cy;
      var startAngle = Math.atan2(dy, dx) * 180 / Math.PI;
      this.imageDrag = {
        imgId: box.id,
        mode: 'rotate',
        isText: true,
        startAngle: startAngle,
        baseRot: (typeof box.rot === 'number') ? box.rot : 0,
        cx: cx,
        cy: cy
      };
      this.selectTextBox(box);
    },
    onTextBoxDelete: function (box) {
      var page = this.active;
      if (!page || !box) return;
      var idx = page.textBoxes.indexOf(box);
      if (idx >= 0) page.textBoxes.splice(idx, 1);
      page.activeTextBoxId = null;
    },
    injectShapeSpacer: function () {
      var self = this;
      this.$nextTick(function () {
        var el = self.$refs.bodyEditor;
        if (!el) return;
        var page = self.active;
        if (!page || !Array.isArray(page.images)) return;
        // If this page has no flow-wrapped images there is nothing to inject.
        // Bail BEFORE stripping anything: stripping and re-adding spacers on
        // every re-render (e.g. selecting an element) momentarily changed the
        // body's DOM height, which shifted the centered page - a visible
        // "jump" when the user merely clicked something.
        var hasFlow = false;
        for (var fi = 0; fi < page.images.length; fi++) {
          if (page.images[fi] && page.images[fi].wrap === "flow") { hasFlow = true; break; }
        }
        if (!hasFlow) return;
        // Strip every flow injection (spacer, image, wrapper) so removed or
        // wrapped-away images can't leave orphan wrappers behind.
        var stale = el.querySelectorAll("[data-zf-spacer=\"1\"], [data-zf-flow-img=\"1\"], [data-zf-flow-wrap=\"1\"]");
        for (var i = 0; i < stale.length; i++) stale[i].remove();
        // Also drop any stray handle elements that got orphaned.
        var orphanHandles = el.querySelectorAll(".zf-img-handle");
        for (var j = 0; j < orphanHandles.length; j++) {
          if (!orphanHandles[j].closest("[data-zf-flow-wrap]")) orphanHandles[j].remove();
        }
        var m = self.activeModel;
        if (!m) return;
        var px = 96 * self.imageScale;
        var rect = el.getBoundingClientRect();
        if (rect.width < 20 || rect.height < 20) return;
        var bodyWIn = rect.width / px;
        var bodyHIn = rect.height / px;
        var flowImgs = [];
        for (var k = 0; k < page.images.length; k++) {
          var img = page.images[k];
          if (img.wrap === "flow") flowImgs.push(img);
        }
        if (!flowImgs.length) return;
        var scheduleReinject = function () {
          if (!self._spacerScheduled) {
            self._spacerScheduled = true;
            requestAnimationFrame(function () {
              self._spacerScheduled = false;
              self.injectShapeSpacer();
            });
          }
        };
        zfInjectMergedFlow(el, flowImgs, px, bodyWIn, bodyHIn, {
          draggable: true,
          selectedId: page.activeImageId,
          onDrag: scheduleReinject,
          onDragStart: function (evt, targetImg) {
            self.onImageMouseDownItem(evt, targetImg);
          },
          onSelect: function (selectedImg) {
            var pg = self.active;
            if (pg) pg.activeImageId = selectedImg.id;
            self.injectShapeSpacer();
          },
          onResize: function (evt, targetImg) {
            self.onResizeStart(evt, targetImg);
          },
          onRotate: function (evt, targetImg) {
            self.onRotateStart(evt, targetImg);
          }
        });
      });
    },
    onBodyInput: function (evt) {
      // Read innerHTML only. Writing it back via Vue v-html would reset
      // the caret to position 0 on every keystroke (typed chars would
      // appear in reverse order). syncTextBoxDom handles the one-time
      // DOM sync when the page changes or when undo/redo replaces state.
      var html = evt.target.innerHTML;
      var stripped = zfStripSpacers(html);
      var safe = zfSanitizeHtml(stripped);
      store.activePage().body = safe;
    },
    onBodyPaste: function (evt) {
      evt.preventDefault();
      var text = (evt.clipboardData || window.clipboardData).getData("text/plain");
      if (document.execCommand) document.execCommand("insertText", false, text);
    },
    execCmd: function (cmd) {
      try {
        document.execCommand(cmd, false, null);
        var el = this.$refs.bodyEditor;
        if (el) store.activePage().body = zfSanitizeHtml(zfStripSpacers(el.innerHTML));
      } catch (e) { console.warn("execCommand failed", e); }
    },
    clearFormat: function () {
      try {
        document.execCommand("removeFormat", false, null);
        var el = this.$refs.bodyEditor;
        if (el) store.activePage().body = zfSanitizeHtml(zfStripSpacers(el.innerHTML));
      } catch (e) {}
    },
    onDragStart: function (evt, i) {
      this.dragIndex = i;
      try { evt.dataTransfer.effectAllowed = "move"; } catch (e) {}
      try { evt.dataTransfer.setData("text/plain", String(i)); } catch (e) {}
    },
    onDragOver: function (evt, i) {
      if (this.dragIndex < 0 || i === this.dragIndex) { this.dropIndex = -1; this.dropSide = null; return; }
      evt.preventDefault();
      try { evt.dataTransfer.dropEffect = "move"; } catch (e) {}
      var rect = evt.currentTarget.getBoundingClientRect();
      var midY = rect.top + rect.height / 2;
      this.dropIndex = i;
      this.dropSide = (evt.clientY < midY) ? "above" : "below";
    },
    onDragLeave: function (evt, i) {
      if (this.dropIndex === i) { this.dropIndex = -1; this.dropSide = null; }
    },
    onDrop: function (evt, i) {
      evt.preventDefault();
      if (this.dragIndex < 0 || this.dragIndex === i) { this.resetDrag(); return; }
      var rect = evt.currentTarget.getBoundingClientRect();
      var midY = rect.top + rect.height / 2;
      var side = (evt.clientY < midY) ? "above" : "below";
      var from = this.dragIndex;
      var to = i;
      if (side === "below") to = to + 1;
      if (from < to) to = to - 1;
      if (from !== to) { var item = store.pages.splice(from, 1)[0]; store.pages.splice(to, 0, item); }
      this.resetDrag();
    },
    onDragEnd: function () { this.resetDrag(); },
    resetDrag: function () { this.dragIndex = -1; this.dropIndex = -1; this.dropSide = null; },
    dragClass: function (i) {
      var c = [];
      if (i === this.dragIndex) c.push("zf-dragging");
      if (i === this.dropIndex && this.dropSide === "above") c.push("zf-drop-above");
      if (i === this.dropIndex && this.dropSide === "below") c.push("zf-drop-below");
      return c.join(" ");
    },
    fillWithLorem: function () {
      var b = this.budget;
      if (!b) return;
      var text = zfLorem({ words: b.words, chars: b.chars });
      store.activePage().body = text;
      if (!store.activePage().heading) {
        store.activePage().heading = "Sample page " + (store.pages.indexOf(store.activePage()) + 1);
      }
    },
    fillAllWithLorem: function () {
      var need = store.pagesNeeded();
      while (store.pages.length < need) { store.pages.push(zfEmptyPage()); }
      var b = this.budget;
      for (var i = 0; i < store.pages.length; i++) {
        var pg = store.pages[i];
        pg.heading = pg.heading || "Sample page " + (i + 1);
        if (!pg.body) pg.body = zfLorem({ words: b.words, chars: b.chars });
      }
      store.status = "Filled " + store.pages.length + " pages with sample text.";
      var self = store;
      setTimeout(function () { if (self.status.indexOf("Filled ") === 0) self.status = ""; }, 2500);
    },
    clearAllText: function () {
      if (!confirm("Clear all page content? This removes text, images, and text boxes from every page and cannot be undone.")) return;
      for (var i = 0; i < store.pages.length; i++) {
        var pg = store.pages[i];
        pg.body = "";
        pg.images = [];
        pg.textBoxes = [];
        pg.activeImageId = null;
        pg.activeTextBoxId = null;
      }
      store.status = "Cleared all page content.";
      var self = store;
      setTimeout(function () { if (self.status.indexOf("Cleared ") === 0) self.status = ""; }, 2500);
    },
    exportJson: function () {
      var payload = {
        specVersion: "1.0", app: "Zine Forge", exported: new Date().toISOString(),
        title: store.title, author: store.author, modelId: store.modelId,
        themeId: store.themeId, marginIn: store.marginIn,
        pages: store.pages.map(function (p) {
          return {
            heading: p.heading,
            body: p.body,
            images: (p.images || []).map(function (im) {
              return {
                id: im.id, src: im.src, kind: im.kind || 'photo',
                x: im.x, y: im.y, w: im.w, h: im.h, rot: im.rot, wrap: im.wrap,
                z: im.z, color: im.color, hidden: !!im.hidden
              };
            }),
            textBoxes: (p.textBoxes || []).map(function (tb) {
              return {
                id: tb.id, html: tb.html,
                x: tb.x, y: tb.y, w: tb.w, rot: tb.rot,
                fontSize: tb.fontSize,
                z: tb.z, color: tb.color, hidden: !!tb.hidden
              };
            }),
            icons: (p.images || []).filter(function (im) { return im.kind === 'icon'; }).map(function (im) {
              return { id: im.id, src: im.src, x: im.x, y: im.y, w: im.w, rot: im.rot, wrap: im.wrap, z: im.z, color: im.color, hidden: !!im.hidden };
            })
          };
        })
      };
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      var safe = (store.title || "zine").replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/^-|-$/g, "") || "zine";
      a.href = url;
      a.download = safe + ".zine.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    },
    onImportFile: function (evt) {
      var file = evt.target.files && evt.target.files[0];
      if (!file) return;
      this.importFromFile(file);
      this.fileInputKey++;
    },
    importFromFile: function (file) {
      if (!file) return;
      var fr = new FileReader();
      var self = this;
      fr.onload = function () {
        try {
          var parsed = JSON.parse(fr.result);
          if (!zfApplyZineData(parsed)) throw new Error("Not a zine file");
          store.status = "Imported " + file.name;
          setTimeout(function () { if (store.status.indexOf("Imported ") === 0) store.status = ""; }, 2500);
        } catch (e) { store.status = "Could not import: " + e.message; }
        self.fileInputKey++;
      };
      fr.readAsText(file);
    },
    // Load a bundled example zine by file name (relative to /zines/).
    loadExampleFromUrl: function (file) {
      var self = this;
      store.status = "Loading example...";
      fetch("zines/" + file)
        .then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.json();
        })
        .then(function (parsed) {
          if (!zfApplyZineData(parsed)) throw new Error("Bad zine file");
          store.view = "editor";
          store.status = "Loaded example: " + (parsed.title || file);
          setTimeout(function () {
            if (store.status.indexOf("Loaded example") === 0) store.status = "";
          }, 2500);
        })
        .catch(function (e) {
          store.status = "Could not load example: " + e.message;
        });
    },
    toggleDebugFlow: function () { this.debugFlow = !this.debugFlow; }
  };

  var ZineEditor = {
    data: function () {
      return {
        store: store,
        fileInputKey: 0,
        dragIndex: -1,
        dropIndex: -1,
        dropSide: null,
        imageDrag: null,
        debugFlow: false,
        iconPickerOpen: false,
        iconPickerQuery: '',
        qrModalOpen: false,
        qrUrl: '',
        inspectorOpen: false,
        layerDragIndex: -1,
        layerDropIndex: -1,
        layersOpen: true,
        decorMenuOpen: false
      };
    },
    computed: {
      active: function () { return store.activePage(); },
      activeIndex: function () {
        var id = store.activePageId;
        return store.pages.findIndex(function (p) { return p.id === id; });
      },
      prevPage: function () {
        var i = this.activeIndex;
        return (i > 0) ? store.pages[i - 1] : null;
      },
      nextPage: function () {
        var i = this.activeIndex;
        return (i >= 0 && i < store.pages.length - 1) ? store.pages[i + 1] : null;
      },
      layers: function () {
        var page = this.active;
        if (!page) return [];
        var out = [];
        (page.images || []).forEach(function (im) {
          out.push({ id: im.id, kind: im.kind === 'icon' ? 'icon' : 'image', el: im, z: (typeof im.z === 'number' ? im.z : 0) });
        });
        (page.textBoxes || []).forEach(function (tb) {
          out.push({ id: tb.id, kind: 'textBox', el: tb, z: (typeof tb.z === 'number' ? tb.z : 0) });
        });
        out.sort(function (a, b) { return b.z - a.z; });
        return out;
      },
      activeImage: function () {
        var p = this.active;
        if (!p || !Array.isArray(p.images) || !p.images.length) return null;
        if (p.activeImageId) {
          for (var i = 0; i < p.images.length; i++) {
            if (p.images[i].id === p.activeImageId) return p.images[i];
          }
        }
        return p.images[p.images.length - 1];
      },
      activeTextBox: function () {
        var p = this.active;
        if (!p || !Array.isArray(p.textBoxes) || !p.textBoxes.length) return null;
        if (p.activeTextBoxId) {
          for (var i = 0; i < p.textBoxes.length; i++) {
            if (p.textBoxes[i].id === p.activeTextBoxId) return p.textBoxes[i];
          }
        }
        return p.textBoxes[p.textBoxes.length - 1];
      },
      models: function () { return (window.ZFModels) ? window.ZFModels.listModels() : []; },
      activeModel: function () { return store.model(); },
      themes: function () { return (window.ZFThemes) ? window.ZFThemes.listThemes() : []; },
      activeTheme: function () { return store.theme(); },
      pageThemeStyle: function () {
        if (!window.ZFThemes || !this.activeTheme) return {};
        return window.ZFThemes.pageStyle(this.activeTheme);
      },
      budget: function () {
        if (!window.ZFModels) return null;
        return window.ZFModels.contentBudget(this.activeModel);
      },
      wordCount: function () {
        if (!window.ZFModels) return 0;
        return window.ZFModels.countWords(this.active ? zfHtmlToText(this.active.body) : "");
      },
      lineCount: function () {
        if (!window.ZFModels) return 0;
        return window.ZFModels.countLines(this.active ? zfHtmlToText(this.active.body) : "");
      },
      charCount: function () {
        return this.active && this.active.body ? zfHtmlToText(this.active.body).length : 0;
      },
      wordPctRaw: function () {
        if (!this.budget || !this.budget.words) return 0;
        return 100 * this.wordCount / this.budget.words;
      },
      linePctRaw: function () {
        if (!this.budget || !this.budget.lines) return 0;
        return 100 * this.lineCount / this.budget.lines;
      },
      charPctRaw: function () {
        if (!this.budget || !this.budget.chars) return 0;
        return 100 * this.charCount / this.budget.chars;
      },
      worstPct: function () {
        return Math.max(this.wordPctRaw, this.linePctRaw, this.charPctRaw);
      },
      budgetClass: function () {
        if (this.worstPct >= 100) return "over";
        if (this.worstPct >= 85) return "warn";
        return "";
      },
      barClass: function () {
        if (this.worstPct >= 100) return "over";
        if (this.worstPct >= 85) return "warn";
        return "";
      },
      barWidth: function () {
        return Math.min(100, Math.round(this.worstPct)) + "%";
      },
      needsToFill: function () {
        var need = store.pagesNeeded();
        return Math.max(0, need - store.pages.length);
      },
      safeGuides: function () {
        // Determine which MINI-PAGE-LOCAL edges need safety guides for the
        // current page. We compute which PAPER edges the slot touches from
        // the grid position, then translate those through the slot's
        // rotation so the guides appear on the correct sides of the mini-
        // page as rendered in the editor (which is NOT rotated).
        var m = this.activeModel;
        var page = this.active;
        if (!m || !m.slots || !page) return [];
        var pageIdx = store.pages.indexOf(page);
        if (pageIdx < 0) return [];
        var pageNum = pageIdx + 1;
        var slot = null;
        for (var i = 0; i < m.slots.length; i++) {
          if (m.slots[i].page === pageNum) { slot = m.slots[i]; break; }
        }
        if (!slot) return [];
        var grid = window.ZFModels && window.ZFModels.gridSize ? window.ZFModels.gridSize(m) : null;
        if (!grid) return [];

        // Paper edges this slot touches.
        var touchesPaperTop = (slot.row === 0);
        var touchesPaperBottom = (slot.row === grid.rows - 1);
        var touchesPaperLeft = (slot.col === 0);
        var touchesPaperRight = (slot.col === grid.cols - 1);

        // Translate to mini-page local edges through the rotation.
        var localTop = false, localRight = false, localBottom = false, localLeft = false;
        var rot = ((slot.rotation % 360) + 360) % 360;
        if (rot === 0) {
          localTop = touchesPaperTop;
          localRight = touchesPaperRight;
          localBottom = touchesPaperBottom;
          localLeft = touchesPaperLeft;
        } else if (rot === 180) {
          localTop = touchesPaperBottom;
          localRight = touchesPaperLeft;
          localBottom = touchesPaperTop;
          localLeft = touchesPaperRight;
        } else if (rot === 90) {
          localTop = touchesPaperLeft;
          localRight = touchesPaperTop;
          localBottom = touchesPaperRight;
          localLeft = touchesPaperBottom;
        } else if (rot === 270) {
          localTop = touchesPaperRight;
          localRight = touchesPaperBottom;
          localBottom = touchesPaperLeft;
          localLeft = touchesPaperTop;
        }

        var pxPerIn = 96 * this.imageScale;
        var safetyPx = store.printerSafetyIn * pxPerIn;
        if (safetyPx <= 0.5) return [];
        var out = [];
        var dashColor = 'rgba(181, 9, 9, 0.6)';
        if (localTop) {
          out.push({ key: 'top', style: {
            left: '0', right: '0', top: '0',
            height: safetyPx + 'px',
            borderBottom: '1px dashed ' + dashColor
          }});
        }
        if (localBottom) {
          out.push({ key: 'bottom', style: {
            left: '0', right: '0', bottom: '0',
            height: safetyPx + 'px',
            borderTop: '1px dashed ' + dashColor
          }});
        }
        if (localLeft) {
          out.push({ key: 'left', style: {
            top: '0', bottom: '0', left: '0',
            width: safetyPx + 'px',
            borderRight: '1px dashed ' + dashColor
          }});
        }
        if (localRight) {
          out.push({ key: 'right', style: {
            top: '0', bottom: '0', right: '0',
            width: safetyPx + 'px',
            borderLeft: '1px dashed ' + dashColor
          }});
        }
        return out;
      },
      pageStyle: function () {
        var m = this.activeModel;
        if (!m) return {};
        var w = m.page.width;
        var h = m.page.height;
        var longSide = Math.max(w, h);
        var onscreenLong = 640;
        var screenScale = onscreenLong / longSide;
        var renderedW = w * screenScale;
        var renderedH = h * screenScale;
        var unit = m.page.unit || "in";
        var physicalInches = unit === "mm" ? w / 25.4 : w;
        var physicalCssPx = physicalInches * 96;
        var pageScale = renderedW / physicalCssPx;
        return {
          width: Math.round(renderedW) + "px",
          height: Math.round(renderedH) + "px",
          "--zf-page-scale": pageScale,
          "--zf-page-margin": store.marginIn + "in"
        };
      },
      imageScale: function () {
        var m = this.activeModel;
        if (!m) return 1;
        var w = m.page.width;
        var h = m.page.height;
        var longSide = Math.max(w, h);
        var screenScale = 640 / longSide;
        var renderedW = w * screenScale;
        var unit = m.page.unit || "in";
        var physicalInches = unit === "mm" ? w / 25.4 : w;
        var physicalCssPx = physicalInches * 96;
        return renderedW / physicalCssPx;
      }
    },
    mounted: function () {
      var self = this;
      this._onMouseMove = function (evt) { self.onImageMouseMove(evt); };
      this._onMouseUp = function () { self.onImageMouseUp(); };
      window.addEventListener("mousemove", this._onMouseMove);
      window.addEventListener("mouseup", this._onMouseUp);
      this.injectShapeSpacer();
      this.syncTextBoxDom();
      // Expose editor actions for global keyboard shortcuts.
      window.ZFEditorActions = {
        delete: function () { self.deleteSelectedElement(); },
        duplicate: function () { self.duplicateSelectedElement(); },
        copy: function () { self.copySelected(); },
        paste: function () { self.pasteElement(); },
        hasSelection: function () {
          var p = self.active;
          if (!p) return false;
          return !!(p.activeImageId || p.activeTextBoxId);
        }
      };
      // Expose zine-level import/export so the masthead (AppShell) can call
      // them even though the logic lives on the editor component.
      window.ZFExportJson = function () { self.exportJson(); };
      window.ZFImportFromFile = function (file) { self.importFromFile(file); };
      window.ZFClearAll = function () { self.clearAllText(); };
      window.ZFNewZine = function () {
        store.pendingModelId = store.modelId;
        store.newZineOpen = true;
      };
    },
    watch: {
      // When the active page changes (or its body is replaced by undo),
      // re-sync the contenteditable so it shows the correct content.
      active: {
        handler: function () {
          this.syncTextBoxDom();
          this.injectShapeSpacer();
        },
        deep: false
      }
    },
    beforeUnmount: function () {
      window.removeEventListener("mousemove", this._onMouseMove);
      window.removeEventListener("mouseup", this._onMouseUp);
      window.ZFEditorActions = null;
    },
    updated: function () {
      this.injectShapeSpacer();
      this.syncTextBoxDom();
    },
    methods: Object.assign({}, ZF_EDITOR_METHODS, {
      // Wrapper so the template can call this via the component instance
      // (plain script functions like zfLoadTemplate are not reachable
      // from Vue templates).
      loadTemplate: function (file) { return window.zfLoadTemplate(file); }
    }),
    template: "#zine-editor-template"
  };

  window.ZineEditor = ZineEditor;
})();