// zf-editor-layers.js -- the layer-list and z-order subsystem.
// Extracted from zf-editor-component.js during the editor split.
// Methods here are plain Vue method bodies (no closures over locals,
// no `this` assumptions beyond the shared Vue instance). They are
// merged back into the component's methods table by zf-editor-component.js
// via Object.assign, so `this` resolves identically to before.
(function () {
  'use strict';

  var methods = {
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
    pageElements: function (page) {
      if (!page) return [];
      return (page.images || []).concat(page.textBoxes || []);
    },
    selectLayer: function (layer, evt) {
      var page = this.active;
      if (!page || !layer) return;
      var kind = (layer.kind === 'textBox') ? 'textBox' : 'image';
      if (evt && evt.shiftKey) {
        this._selSetToggle(kind, layer.el.id);
      } else {
        this._selSetOnly(kind, layer.el.id);
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
    _selectedEls: function () {
      var page = this.active;
      if (!page) return [];
      var out = [];
      (this.selSet || []).forEach(function (s) {
        var el = null;
        if (s.kind === 'textBox') {
          (page.textBoxes || []).forEach(function (tb) { if (tb.id === s.id) el = tb; });
        } else {
          (page.images || []).forEach(function (im) { if (im.id === s.id) el = im; });
        }
        if (el) out.push(el);
      });
      return out;
    },
    _blockZOrder: function (dir) {
      var page = this.active;
      if (!page) return;
      var block = this._selectedEls();
      if (!block.length) return;
      var all = (page.images || []).concat(page.textBoxes || []);
      var inBlock = {};
      block.forEach(function (e) { inBlock[e.id] = true; });
      var zOf = function (e) { return (typeof e.z === 'number') ? e.z : 0; };
      // Order the block members by their current relative z, so we can
      // reassign them CONTIGUOUS slots preserving their internal order.
      var ordered = block.slice().sort(function (a, b) { return zOf(a) - zOf(b); });
      var n = ordered.length;
      // The z-values of everything NOT in the block, sorted.
      var others = all.filter(function (e) { return !inBlock[e.id]; }).map(zOf).sort(function (a, b) { return a - b; });

      // Compact the block into a contiguous band (no strangers between
      // members), then place that band at the target end / step.
      function assignBand(base) {
        // base = lowest z for the band; members ascend by 1 from there.
        ordered.forEach(function (e, i) { e.z = Math.round((base + i) * 100) / 100; });
      }

      if (dir === 'front') {
        // Place the band above everything: lowest member = maxOther + 1.
        var maxOther = others.length ? others[others.length - 1] : 0;
        assignBand(maxOther + 1);
      } else if (dir === 'back') {
        var minOther = others.length ? others[0] : 1;
        assignBand(minOther - n); // band ends just below the lowest other
      } else if (dir === 'forward') {
        // Move the band so it sits just ABOVE the next element above it.
        var curMax = Math.max.apply(null, block.map(zOf));
        var nextAbove = null;
        for (var a = 0; a < others.length; a++) { if (others[a] > curMax) { nextAbove = others[a]; break; } }
        if (nextAbove === null) return; // already on top
        // Re-stack everything: elements above nextAbove stay above the band.
        assignBand(nextAbove + 1);
        // Push any other that collided above nextAbove by n.
        // (Simplest stable approach: bump others that are >= the new band.)
        var newBandMin = nextAbove + 1;
        var newBandMax = nextAbove + n;
        all.forEach(function (e) {
          if (inBlock[e.id]) return;
          var z = zOf(e);
          if (z >= newBandMin && z <= newBandMax) e.z = Math.round((z + n) * 100) / 100;
        });
      } else if (dir === 'backward') {
        var curMin = Math.min.apply(null, block.map(zOf));
        var nextBelow = null;
        for (var b = others.length - 1; b >= 0; b--) { if (others[b] < curMin) { nextBelow = others[b]; break; } }
        if (nextBelow === null) return; // already on bottom
        assignBand(nextBelow - n);
        var newBackMax = nextBelow - 1;
        var newBackMin = nextBelow - n;
        all.forEach(function (e) {
          if (inBlock[e.id]) return;
          var z = zOf(e);
          if (z >= newBackMin && z <= newBackMax) e.z = Math.round((z - n) * 100) / 100;
        });
      }
    },
    bringToFront: function () {
      if (this.selSet && this.selSet.length > 1) { this._blockZOrder('front'); return; }
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
      if (this.selSet && this.selSet.length > 1) { this._blockZOrder('back'); return; }
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
      if (this.selSet && this.selSet.length > 1) { this._blockZOrder('forward'); return; }
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
    }
  };

  window.ZFEditorLayers = { methods: methods };
})();