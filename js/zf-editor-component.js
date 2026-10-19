// zf-editor-component.js -- the ZineEditor Vue component and its large
// methods table. Extracted from the inline <script> in index.html.
// Classic script; reads the shared store from window.ZF_STORE (set by
// zf-store.js, which must load first). Uses helpers from zf-editor.js
// (zfCompressAndPlace) and from util.js.
(function () {
  'use strict';

  if (typeof zfAssertDeps === 'function') zfAssertDeps('zf-editor-component', ['ZF_STORE', 'ZFModels', 'zfElementStyle', 'zfTextBoxStyle', 'zfSanitizeHtml', 'zfNewImageId', 'zfNewTextBoxId', 'zfCompressAndPlace']);

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
      var base = zfElementStyle(img, m.page.width, m.page.height, store.modelMarginIn(), {});
      base.cursor = "grab";
      // Layered z boost so a SELECTED element (and its handles) paints above
      // unselected neighbors, and the PRIMARY (handle-owner) paints above the
      // other selected -- otherwise a higher-z neighbor covers the handles
      // and they cannot be grabbed. Derived from selection, so it reverts
      // automatically on deselect (the stored z is never changed).
      var page = this.active;
      // Boost z ONLY while actively dragging so handles are grabbable. When
      // idle-selected, show the element at its TRUE z -- otherwise a "send to
      // back" looks like it did nothing (the selection boost kept it on top)
      // until deselect, which was confusing. Selection is still indicated by
      // the outline/handles.
      if (page && this.isSelected('image', img.id) && this.imageDrag) {
        base.zIndex = base.zIndex + (page.activeImageId === img.id ? 20000 : 10000);
      }
      return base;
    },
    // Icon on-screen font-size in px, unit-agnostic. img.w is in PAGE units
    // (in or mm); divide by page width (same units) for a fraction, then
    // multiply by the page's rendered px width. x0.85 keeps the glyph-padding
    // factor. Replaces the old (img.w*96*imageScale) which assumed inches and
    // blew up ~25x on A4 (mm).
    iconFontPx: function (img) {
      var m = this.activeModel;
      var pageEl = this.$refs.miniPage;
      if (!m || !m.page || !pageEl) return 16;
      var w = (img && typeof img.w === 'number') ? img.w : 0.6;
      var pw = m.page.width || 1;
      var renderedW = pageEl.getBoundingClientRect().width || (pw * 96);
      return (w / pw) * renderedW * 0.85;
    },
    imageBlockStyle: function (img) {
      if (!img) return {};
      var m = this.activeModel;
      if (!m) return {};
      var base = zfElementStyle(img, m.page.width, m.page.height, store.modelMarginIn(), { block: true });
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
      // Clear the multi-selection set too, or the selected class (and its
      // bounding box + handles) would linger after clicking empty space.
      this.selSet = [];
      this.hoveredEl = { kind: '', id: '' };
    },
    // Click on the gray desk AROUND the page deselects (natural 'click off
    // the page to stop interacting'). Only fires for the wrap background
    // itself (.self modifier), not the page, ghosts, or panels.
    onCanvasDeskMouseDown: function (evt) {
      if (evt && evt.button !== undefined && evt.button !== 0) return;
      this.clearElementSelection();
    },

    // Mousedown on the page body (empty space). Starts a potential marquee;
    // whether it becomes a marquee or a plain text-click is decided by
    // movement (see onImageMouseMove / onImageMouseUp).
    // Mousedown on the page (anywhere in the visible page, including its
    // margins/padding) starts a potential marquee. Ignore mousedowns that
    // land on an element or a handle -- those have their own handlers and
    // should select/move/transform rather than start a band.
    onBodyMouseDown: function (evt) {
      if (evt.button !== 0) return;
      var t = evt.target;
      if (t && t.closest && t.closest('.zf-img-wrap, .zf-textbox, .zf-img-handle, .zf-mini-safe-guide')) return;
      this.marquee = {
        active: true,
        startX: evt.clientX, startY: evt.clientY,
        x: evt.clientX, y: evt.clientY, w: 0, h: 0, moved: false
      };
    },

    // Is the marquee drag in progress and moved enough to count as a band?
    _marqueeMoving: function () {
      return this.marquee && this.marquee.active;
    },

    // Update the marquee rect from a pointer position.
    _marqueeUpdate: function (clientX, clientY) {
      var m = this.marquee;
      if (!m || !m.active) return;
      var dx = clientX - m.startX, dy = clientY - m.startY;
      if ((dx * dx + dy * dy) > 9) m.moved = true;
      m.x = Math.min(m.startX, clientX);
      m.y = Math.min(m.startY, clientY);
      m.w = Math.abs(dx);
      m.h = Math.abs(dy);
      this.marquee = Object.assign({}, m); // trigger reactivity
    },

    // Finish the marquee: select every element whose box intersects it.
    // Shift-held adds to the existing selection; otherwise it replaces.
    _marqueeFinish: function (additive) {
      var m = this.marquee;
      var page = this.active;
      if (!m || !page) { this.marquee = { active: false, startX: 0, startY: 0, x: 0, y: 0, w: 0, h: 0, moved: false }; return; }
      if (m.moved) {
        var rect = { left: m.x, top: m.y, right: m.x + m.w, bottom: m.y + m.h };
        var set = additive ? (this.selSet || []).slice() : [];
        var seen = {};
        set.forEach(function (s) { seen[s.kind + ':' + s.id] = true; });
        var self = this;
        function consider(kind, id, el) {
          var key = kind + ':' + id;
          if (seen[key]) return;
          var r = el.getBoundingClientRect();
          var intersects = !(r.right < rect.left || r.left > rect.right || r.bottom < rect.top || r.top > rect.bottom);
          if (intersects) { set.push({ kind: kind, id: id }); seen[key] = true; }
        }
        (page.images || []).forEach(function (im) {
          var d = self.$el ? self.$el.querySelector('[data-zf-img-id="' + im.id + '"]') : null;
          if (d) consider('image', im.id, d);
        });
        (page.textBoxes || []).forEach(function (tb) {
          var d = self.$el ? self.$el.querySelector('[data-zf-text-id="' + tb.id + '"]') : null;
          if (d) consider('textBox', tb.id, d);
        });
        this.selSet = set;
        this._syncPrimary();
      } else {
        // No movement: treat as a plain empty click -> clear selection.
        this.clearElementSelection();
      }
      this.marquee = { active: false, startX: 0, startY: 0, x: 0, y: 0, w: 0, h: 0, moved: false };
    },
    // -------- Layers (drag to reorder) --------






    // -------- Layers --------
    // Every object on the current page (images, icons, text boxes) as a
    // single list sorted front-to-back (highest z first).

    // Select a layer from the layers panel. Plain click replaces the
    // selection; Shift-click adds/removes (same semantics as the canvas), so
    // multiple elements can be selected from the list without touching the
    // canvas (useful when the page is crowded).


    // Swap a specific element's z with the next higher/lower element.


    addTape: function () {
      var page = this.active;
      if (!page) return;
      if (!Array.isArray(page.images)) page.images = [];
      var tape = {
        id: zfNewImageId(),
        kind: 'tape',
        src: '',
        x: 0.5 * this._unitScale(),
        y: 0.5 * this._unitScale(),
        w: 0.9 * this._unitScale(),
        h: 0.34 * this._unitScale(),
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
        x: 0.6 * this._unitScale(),
        y: 0.6 * this._unitScale(),
        w: 0.9 * this._unitScale(),
        h: 0.9 * this._unitScale(),
        rot: 0,
        wrap: 'free',
        color: '#e94f4f'
      };
      page.images.push(sticker);
      page.activeImageId = sticker.id;
      page.activeTextBoxId = null;
    },

    // -------- Drawing mode --------
    // Enter drawing mode: size a transparent canvas to the mini-page's pixel
    // box and clear the stroke stack. The canvas overlays the page content
    // and captures pointer events while active.
    // Convert a canvas-local point (CSS px within the page box) to page-inch
    // coordinates, which is the unit the stroke renderer and the element
    // geometry both use.


    // Append the current pointer point to the in-progress stroke (if any),
    // recording it in page-inch space. Near-duplicate points are skipped to
    // keep storage and render cost down.




    // Convert a pointer event to canvas-local coordinates.
    // Raw pointer position in canvas CSS px. The live draw uses this directly
    // so strokes land exactly under the cursor (the ctx is NOT rotated during
    // live drawing). Rotation is handled on the RECORD path (_drawToInches)
    // and when re-rendering existing strokes (_redrawCanvasFromStrokes).




    // Fill one calligraphy segment A->B as a quadrilateral whose width comes
    // from the nib angle: thick when the stroke runs perpendicular to the
    // nib edge, thin when it runs along it. Shares the previous segment's
    // end edge so the stroke is continuous.






    // Apply the current tool's stroke settings to the 2D context. `width`
    // lets the velocity option vary the width per segment; it defaults to
    // the base brush size.


    // Apply the current tool's color/composite to the context. `forStroke`
    // true sets strokeStyle; false sets fillStyle (used by the calligraphy
    // filled quads). The eraser always composites to transparent.


    // Convert a #rrggbb (or #rgb) color + alpha to an rgba() string.


    // Restore the canvas to the last snapshot (one stroke back).


    // Delete the stroke under a canvas point (page-inch hit test). Removes
    // the topmost stroke within tolerance and re-renders.


    // Min distance from a point (page inches) to a stroke's polyline.




    // Commit: turn the canvas into a PNG placed element on the page. The
    // drawing covers the whole page box, so it is added full-page (free
    // wrap) and then left selected so the user can move or resize it.
    // Commit the current drawing. Crops to the ink's bounding box (plus a
    // small grace margin) so the placed element is the size of the drawing,
    // not the whole page. If we are re-editing an existing drawing element,
    // replace its image in place; otherwise add a new element.


    // Remove a drawing element by id (used when a re-edit erases everything).


    // Double-click a committed drawing to re-open it for editing. Loads its
    // image back onto the canvas and commits back into the same element.


    // While re-editing a drawing, apply the current panel settings to every
    // stroke in the drawing and re-render the canvas. Size is converted from
    // the px slider to inches (as strokes are stored) using the canvas scale.
    // No-op for a fresh drawing (nothing to re-apply to).


    // Clear the drawing canvas and re-render the current stroke list.


    // Snapshot the current draw-panel settings so a committed drawing can
    // restore them when re-opened for editing.


    // Discard the current stroke session without committing.


    // Document-level pointerdown while drawing: if the user clicks anywhere
    // that is NOT the canvas and NOT the draw panel, auto-commit (so leaving
    // the drawing never loses work). Clicking the panel or canvas keeps the
    // session open.


    addStamp: function () {
      var page = this.active;
      if (!page) return;
      if (!Array.isArray(page.textBoxes)) page.textBoxes = [];
      var stamp = {
        id: zfNewTextBoxId(),
        kind: 'stamp',
        html: 'APPROVED',
        x: 0.4 * this._unitScale(),
        y: 1.0 * this._unitScale(),
        w: 1.6 * this._unitScale(),
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
        x: 0.6 * this._unitScale(),
        y: 0.6 * this._unitScale(),
        w: 1.1 * this._unitScale(),
        h: 1.1 * this._unitScale(),
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
        x: 0.4 * this._unitScale(),
        y: 0.6 * this._unitScale(),
        w: 1.4 * this._unitScale(),
        h: 1.0 * this._unitScale(),
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


    // -------- Block z-order (multi-selection / group) --------
    // Move every selected element as a BLOCK, preserving their relative
    // stacking, so a group keeps its internal order when raised/lowered.






    sendBackward: function () {
      if (this.selSet && this.selSet.length > 1) { this._blockZOrder('backward'); return; }
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
    // -------- Right-click context menu --------
    openContextMenu: function (evt, kind, id) {
      var page = this.active;
      if (!page) return;
      this._selectElementById(kind, id);
      this.ctxMenu = { open: true, x: evt.clientX, y: evt.clientY, kind: kind, id: id };
    },
    closeContextMenu: function () {
      if (this.ctxMenu.open) this.ctxMenu = { open: false, x: 0, y: 0, kind: '', id: '' };
    },
    _selectElementById: function (kind, id) {
      var page = this.active;
      if (!page) return;
      if (kind === 'textBox') { page.activeTextBoxId = id; page.activeImageId = null; }
      else { page.activeImageId = id; page.activeTextBoxId = null; }
    },
    ctxAction: function (action) {
      var m = this.ctxMenu;
      if (!m.open) return;
      // If a multi-selection is active, keep it (so block ops apply to ALL);
      // otherwise select just the clicked element.
      if (!(this.selSet && this.selSet.length > 1 && this.isSelected(m.kind, m.id))) {
        this._selectElementById(m.kind, m.id);
      }
      switch (action) {
        case 'front': this.bringToFront(); break;
        case 'forward': this.bringForward(); break;
        case 'backward': this.sendBackward(); break;
        case 'back': this.sendToBack(); break;
        case 'duplicate': this.duplicateSelectedElement(); break;
        case 'copy': this.copySelected(); break;
        case 'delete': this.deleteSelectedElement(); break;
        case 'group': this.groupSelection(); break;
        case 'ungroup': this.ungroupSelection(); break;
      }
      this.closeContextMenu();
    },

    deleteSelectedElement: function () {
      var page = this.active;
      if (!page) return;
      // Multi-delete: remove every element in the selection set.
      if (this.selSet && this.selSet.length > 1) {
        var self = this;
        var ids = {};
        this.selSet.forEach(function (s) { ids[s.kind + ':' + s.id] = true; });
        if (Array.isArray(page.images)) {
          page.images = page.images.filter(function (im) { return !ids['image:' + im.id]; });
        }
        if (Array.isArray(page.textBoxes)) {
          page.textBoxes = page.textBoxes.filter(function (tb) { return !ids['textBox:' + tb.id]; });
        }
        this._selSetClear();
        return;
      }
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
      try { zfLog('COPY selSet=' + (this.selSet || []).length + ' activeImg=' + page.activeImageId + ' activeTb=' + page.activeTextBoxId); } catch (e) {}
      // Multi-copy: buffer every selected element so a paste recreates them.
      if (this.selSet && this.selSet.length > 1) {
        var items = [];
        this.selSet.forEach(function (s) {
          var arr = (s.kind === 'textBox') ? page.textBoxes : page.images;
          if (!Array.isArray(arr)) return;
          for (var i = 0; i < arr.length; i++) {
            if (arr[i].id === s.id) { items.push({ kind: s.kind, data: JSON.parse(JSON.stringify(arr[i])) }); break; }
          }
        });
        if (items.length) {
          window.zfClipboard = { type: 'multi', items: items };
          store.status = 'Copied ' + items.length + ' elements.';
          setTimeout(function () { if (store.status.indexOf('Copied ') === 0) store.status = ''; }, 1500);
        }
        return;
      }
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
            // (multi handled above)
          }
        }
      }
    },
    // Paste the clipboard buffer onto the current page, offset slightly and
    // selected so it can be moved or restyled immediately.
    pasteElement: function () {
      var clip = window.zfClipboard;
      try { zfLog('PASTE clipType=' + (clip && clip.type) + ' items=' + (clip && clip.items ? clip.items.length : (clip && clip.data ? 1 : 0)) + ' page=' + (this.active && this.active.id)); } catch (e) {}
      if (!clip) return;
      var page = this.active;
      if (!page) return;
      // Multi-paste: recreate every buffered element (offset), select the
      // pasted set.
      if (clip.type === 'multi' && Array.isArray(clip.items)) {
        var selfP = this;
        var newSet = [];
        var zTop = 0;
        (page.images || []).concat(page.textBoxes || []).forEach(function (e) { zTop = Math.max(zTop, (typeof e.z === 'number' ? e.z : 0)); });
        clip.items.forEach(function (it) {
          var copy = JSON.parse(JSON.stringify(it.data));
          var isText = (it.kind === 'textBox');
          copy.id = isText ? zfNewTextBoxId() : zfNewImageId();
          copy.x = (typeof copy.x === 'number' ? copy.x : 0) + 0.15;
          copy.y = (typeof copy.y === 'number' ? copy.y : 0) + 0.15;
          copy.z = ++zTop;
          if (isText) { if (!Array.isArray(page.textBoxes)) page.textBoxes = []; page.textBoxes.push(copy); }
          else { if (!Array.isArray(page.images)) page.images = []; page.images.push(copy); }
          newSet.push({ kind: isText ? 'textBox' : 'image', id: copy.id });
        });
        if (newSet.length) {
          this.selSet = newSet;
          this._syncPrimary();
          this.$nextTick(function () { selfP.syncTextBoxDom(); });
        }
        store.status = 'Pasted ' + newSet.length + ' elements.';
        setTimeout(function () { if (store.status.indexOf('Pasted') === 0) store.status = ''; }, 1500);
        return;
      }
      if (!clip.data) return;
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
      }
      store.status = 'Pasted.';
      setTimeout(function () { if (store.status === 'Pasted.') store.status = ''; }, 1500);
    },
    duplicateSelectedElement: function () {
      var page = this.active;
      if (!page) return;
      // Multi-duplicate: duplicate every selected element (offset a little),
      // and re-select the copies. Groups keep their members together.
      if (this.selSet && this.selSet.length > 1) {
        var newSet = [];
        var selfD = this;
        this.selSet.forEach(function (s) {
          var el = null, arr = null;
          if (s.kind === 'textBox') { arr = page.textBoxes; }
          else { arr = page.images; }
          if (!Array.isArray(arr)) return;
          for (var i = 0; i < arr.length; i++) { if (arr[i].id === s.id) { el = arr[i]; break; } }
          if (!el) return;
          var copy = JSON.parse(JSON.stringify(el));
          copy.id = (s.kind === 'textBox') ? zfNewTextBoxId() : zfNewImageId();
          copy.x = (typeof el.x === 'number' ? el.x : 0) + 0.15;
          copy.y = (typeof el.y === 'number' ? el.y : 0) + 0.15;
          copy.z = (typeof el.z === 'number' ? el.z : 0) + 1;
          arr.push(copy);
          newSet.push({ kind: s.kind, id: copy.id });
        });
        if (newSet.length) {
          this.selSet = newSet;
          this._syncPrimary();
          this.$nextTick(function () { selfD.syncTextBoxDom(); });
        }
        return;
      }
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
            return;
          }
        }
      }
    },
    goToPageId: function (id) {
      if (id) store.activePageId = id;
    },
    // Style for the ghost's scaled mini-page: same theme + aspect as the
    // real page, small, with a tiny page scale so fonts/padding shrink.
    // The ghost is a TRUE thumbnail: render the mini-page at its real
    // design size (page inches * 96 px) with --zf-page-scale: 1, then
    // transform:scale() the whole thing down into the ~130px frame. This is
    // the only way text-box font sizes (absolute pt) shrink correctly --
    // percent positions and em icons would scale with a smaller base font,
    // but pt is absolute, so a shrunken container just overflowed and the
    // ghost looked like overlapping, mismatched text.
    // EXACT-FIDELITY ghost geometry: the ghost inner is a pixel-identical
    // clone of the REAL page (same renderedW/renderedH and --zf-page-scale
    // the live page computes in pageStyle), then uniformly transform:scale()d
    // down into the frame. Deriving from the live page's own formula (rather
    // than a hardcoded 96dpi design) is what keeps every ratio -- padding,
    // em icons, pt text, percent positions -- matching the real page.
    _ghostMetrics: function () {
      var m = this.activeModel;
      if (!m) return null;
      var w = m.page.width, h = m.page.height;
      var longSide = Math.max(w, h);
      var screenScale = 640 / longSide;   // same onscreen target as pageStyle
      var renderedW = w * screenScale;
      var renderedH = h * screenScale;
      var unit = m.page.unit || 'in';
      var physicalInches = unit === 'mm' ? w / 25.4 : w;
      var physicalCssPx = physicalInches * 96;
      var pageScale = renderedW / physicalCssPx;
      var frameW = 130;
      var outer = frameW / renderedW;
      return {
        renderedW: renderedW,
        renderedH: renderedH,
        pageScale: pageScale,
        frameW: frameW,
        frameH: renderedH * outer,
        outer: outer
      };
    },
    ghostPageStyle: function (page) {
      var met = this._ghostMetrics();
      if (!met) return {};
      var theme = (window.ZFThemes && store.theme()) ? window.ZFThemes.pageStyle(store.theme()) : {};
      return Object.assign({}, theme, {
        position: 'absolute',
        top: '0',
        left: '0',
        width: met.renderedW + 'px',
        height: met.renderedH + 'px',
        '--zf-page-scale': met.pageScale,
        '--zf-page-margin': store.modelMarginIn() + 'in',
        transform: 'scale(' + met.outer + ')',
        transformOrigin: 'top left'
      });
    },
    ghostFrameStyle: function (page) {
      var met = this._ghostMetrics();
      if (!met) return {};
      return {
        position: 'relative',
        width: met.frameW + 'px',
        height: met.frameH + 'px',
        overflow: 'hidden'
      };
    },
    ghostBlockStyle: function (img) {
      var m = this.activeModel;
      if (!m || !img || !img.src) return {};
      return zfElementStyle(img, m.page.width, m.page.height, store.modelMarginIn(), { block: true });
    },
    ghostFreeStyle: function (img) {
      var m = this.activeModel;
      if (!m || !img) return {};
      var decor = { tape: 1, scrap: 1, sticky: 1, sticker: 1 };
      if (!img.src && !decor[img.kind]) return {};
      return zfElementStyle(img, m.page.width, m.page.height, store.modelMarginIn(), {});
    },
    ghostTextBoxStyle: function (box) {
      var m = this.activeModel;
      if (!m || !box) return {};
      return zfTextBoxStyle(box, m.page.width, m.page.height, store.modelMarginIn());
    },

    ghostSnippet: function (page) {
      if (!page) return '';
      // Inline heading/body are retired. Derive a short snippet from the
      // first text box that has content, falling back to the element
      // summary below when there is none.
      var t = '';
      if (Array.isArray(page.textBoxes)) {
        for (var bi = 0; bi < page.textBoxes.length; bi++) {
          var raw = page.textBoxes[bi] && page.textBoxes[bi].html;
          if (raw) { t = String(raw).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); if (t) break; }
        }
      }
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
      var hasImages = Array.isArray(page.images) && page.images.length > 0;
      var hasTextBoxes = Array.isArray(page.textBoxes) && page.textBoxes.length > 0;
      return !(hasImages || hasTextBoxes);
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
        var bleed = 0.25 * self._unitScale();
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
          w: 1.5 * self._unitScale(),
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
      // Shift-click: toggle this element in the selection (add/remove) and
      // do NOT start a drag or apply selection priority.
      if (evt.shiftKey) {
        this._hideOverlapPicker();
        this._selSetToggle('image', img.id);
        var selfSh = this;
        return;
      }
      // Selection priority: if an element is ALREADY selected and the pointer
      // is inside that element's own box (+ small grace), drag THAT element --
      // do not let z-order re-pick a different one. Respects a deliberate
      // selection without the over-eager behavior of global stickiness (it
      // only applies within the selected element's box).
      var pri = this._selectedWinsAtPoint(evt);
      if (pri && !(pri.kind === 'image' && pri.id === img.id)) {
        this._startMoveDrag(pri.kind, pri.id, evt);
        return;
      }
      // Selecting an element hides the overlap picker.
      this._hideOverlapPicker();
      if (this.active) this.active.activeImageId = img.id;
      // Focus the wrapper so Delete/Backspace reach the element handler
        // instead of being swallowed by a contenteditable elsewhere.
        try { if (evt.currentTarget && evt.currentTarget.focus) evt.currentTarget.focus({ preventScroll: true }); } catch (e) {}
        // Re-inject flow spacers so the selection outline moves.
        var self = this;
      this.imageDrag = {
        imgId: img.id,
        mode: "move",
        startX: evt.clientX,
        startY: evt.clientY,
        baseX: (typeof img.x === "number") ? img.x : 0,
        baseY: (typeof img.y === "number") ? img.y : 0,
        bases: this._selectionBases()
      };
    },
    onResizeStart: function (evt, img) {
      if (!img) return;
      evt.stopPropagation();
      evt.preventDefault();
      var m = this.activeModel;
      if (!m) return;
      var pageEl = this.$refs.miniPage;
      if (!pageEl) return;
      var pr = pageEl.getBoundingClientRect();
      // px per PAGE-UNIT (in or mm) -- equals px-per-inch on inch models,
      // correct on mm models. Using 96*imageScale (px-per-inch) mis-placed the
      // pivot on A4 so resize scaled the wrong way.
      // Pivot = the element's ACTUAL rendered center (DOM rect), not a
      // w*0.75 height guess. Correct regardless of unit (in/mm), real height,
      // or rotation, and avoids the A4 mis-pivot that made resize feel
      // inverted / never-grow.
      var cx, cy;
      var _node = this.$el ? this.$el.querySelector('[data-zf-img-id="' + img.id + '"]') : null;
      if (_node) {
        var _nr = _node.getBoundingClientRect();
        cx = _nr.left + _nr.width / 2;
        cy = _nr.top + _nr.height / 2;
      } else {
        var px = pr.width / m.page.width;
        var margin = store.modelMarginIn() * this._unitScale();
        var cxIn = (typeof img.x === "number" ? img.x : 0) + margin + (img.w / 2);
        var cyIn = (typeof img.y === "number" ? img.y : 0) + margin + (img.w * 0.75 / 2);
        cx = pr.left + cxIn * px;
        cy = pr.top + cyIn * px;
      }
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
      // Group resize: if several are selected, snapshot them and use the
      // group pivot (the pointer distance is measured from the pivot).
      var gsnap = this._groupTransformSnapshot();
      if (gsnap) {
        var gpx = pr.left + gsnap.pivot.x * px;
        var gpy = pr.top + gsnap.pivot.y * px;
        var gdx0 = evt.clientX - gpx, gdy0 = evt.clientY - gpy;
        this.imageDrag.group = gsnap;
        this.imageDrag.gcx = gpx;
        this.imageDrag.gcy = gpy;
        this.imageDrag.startDist = Math.sqrt(gdx0 * gdx0 + gdy0 * gdy0) || 1;
      }
      if (this.active) this.active.activeImageId = img.id;
    },
    onTextBoxResizeStartScaled: function (evt, box) {
      // Resize both the box AND its font size proportionally so dragging
      // the corner makes the text bigger, like images.
      if (!box) return;
      evt.stopPropagation();
      evt.preventDefault();
      // Manual resize takes the box out of auto-width mode: from here it has
      // a fixed width and wraps within it.
      box.autoWidth = false;
      var pageEl = this.$refs.miniPage;
      if (!pageEl) return;
      var pr = pageEl.getBoundingClientRect();
      var _m = this.activeModel;
      var px = (_m && _m.page.width) ? pr.width / _m.page.width : 96 * this.imageScale;
      var margin = store.modelMarginIn() * this._unitScale();
      // Capture the box's CURRENT rendered width as the base for resizing, so
      // the first drag starts from where it visually is (not the stored w).
      var w = (typeof box.w === 'number') ? box.w : 1.8;
      var wrapEl = this.$el ? this.$el.querySelector('[data-zf-text-id="' + box.id + '"]') : null;
      if (wrapEl) {
        var wr = wrapEl.getBoundingClientRect();
        var m2 = this.activeModel;
        if (m2 && pr.width) w = (wr.width / pr.width) * m2.page.width;
      }
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
        startX: evt.clientX,
        startY: evt.clientY,
        startDist: startDist,
        baseW: w,
        // Base font in POINTS: explicit fontPt, else legacy multiplier x 10pt.
        baseFontPt: (typeof box.fontPt === 'number' && box.fontPt > 0)
          ? box.fontPt
          : ((typeof box.fontSize === 'number' ? box.fontSize : 1.0) * 10),
        cx: cx,
        cy: cy
      };
      // Do NOT collapse the selection: if several are selected, this handle
      // drag should transform the whole group (like an image handle). Make
      // the box primary without dropping others.
      if (this.isSelected('textBox', box.id)) this._syncPrimary('textBox', box.id);
      else this.selectTextBox(box);
      // Group resize: snapshot the selection and resize about its pivot.
      var gsnapT = this._groupTransformSnapshot();
      if (gsnapT) {
        var gpxT = pr.left + gsnapT.pivot.x * px;
        var gpyT = pr.top + gsnapT.pivot.y * px;
        var gdxT = evt.clientX - gpxT, gdyT = evt.clientY - gpyT;
        this.imageDrag.group = gsnapT;
        this.imageDrag.gcx = gpxT;
        this.imageDrag.gcy = gpyT;
        this.imageDrag.startDist = Math.sqrt(gdxT * gdxT + gdyT * gdyT) || 1;
      }
    },
    onRotateStart: function (evt, img) {
      if (!img) return;
      evt.stopPropagation();
      evt.preventDefault();
      var m = this.activeModel;
      if (!m) return;
      var pageEl = this.$refs.miniPage;
      if (!pageEl) return;
      var pr = pageEl.getBoundingClientRect();
      var px = pr.width / m.page.width; // px per page-unit (in or mm)
      // Pivot = element's real DOM center (see onResizeStart).
      var cx, cy;
      var _nodeR = this.$el ? this.$el.querySelector('[data-zf-img-id="' + img.id + '"]') : null;
      if (_nodeR) {
        var _nrR = _nodeR.getBoundingClientRect();
        cx = _nrR.left + _nrR.width / 2;
        cy = _nrR.top + _nrR.height / 2;
      } else {
        var margin = store.modelMarginIn() * this._unitScale();
        var cxIn = (typeof img.x === "number" ? img.x : 0) + margin + (img.w / 2);
        var cyIn = (typeof img.y === "number" ? img.y : 0) + margin + (img.w * 0.75 / 2);
        cx = pr.left + cxIn * px;
        cy = pr.top + cyIn * px;
      }
      var dx = evt.clientX - cx;
      var dy = evt.clientY - cy;
      var startAngle = Math.atan2(dy, dx) * 180 / Math.PI;
      this.imageDrag = {
        imgId: img.id,
        mode: "rotate",
        // startX/startY are REQUIRED by the general "moved" detection at the
        // top of onImageMouseMove; without them, a rotate drag never marked
        // moved, so the follow-up click was not suppressed and the group
        // selection collapsed after rotating. (Resize set these already, which
        // is why resize survived but rotate did not.)
        startX: evt.clientX,
        startY: evt.clientY,
        startAngle: startAngle,
        baseRot: (typeof img.rot === "number") ? img.rot : 0,
        cx: cx,
        cy: cy
      };
      // Group rotate: snapshot the selection and rotate about its pivot.
      var gsnapR = this._groupTransformSnapshot();
      if (gsnapR) {
        var gpxR = pr.left + gsnapR.pivot.x * px;
        var gpyR = pr.top + gsnapR.pivot.y * px;
        var gdxR = evt.clientX - gpxR, gdyR = evt.clientY - gpyR;
        this.imageDrag.group = gsnapR;
        this.imageDrag.gcx = gpxR;
        this.imageDrag.gcy = gpyR;
        this.imageDrag.startAngle = Math.atan2(gdyR, gdxR) * 180 / Math.PI;
      }
      if (this.active) this.active.activeImageId = img.id;
    },
    onImageMouseMove: function (evt) {
      // Rubber-band: if a body mousedown started a marquee, update it and
      // return (no element drag is active).
      if (this.marquee && this.marquee.active) {
        this._marqueeUpdate(evt.clientX, evt.clientY);
        return;
      }
      if (!this.imageDrag) return;
      // Mark ANY real drag (move / resize / rotate) as "moved" once the
      // pointer travels past a few px. onImageMouseUp uses this to suppress
      // the click that follows the drag, which would otherwise collapse a
      // multi-selection down to one element. Previously only the move branch
      // set this, so resize/rotate dropped the group selection.
      if (this.imageDrag.startX !== undefined) {
        var gmvx = evt.clientX - this.imageDrag.startX;
        var gmvy = evt.clientY - this.imageDrag.startY;
        if ((gmvx * gmvx + gmvy * gmvy) > 9) this.imageDrag.moved = true;
      }
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
      // A group-box drag has no imgId; do NOT bail on it -- fall through so
      // the early group branch (just below) can transform the whole selection.
      var isGroupBoxDrag = this.imageDrag && this.imageDrag.group && !this.imageDrag.imgId;
      if (!img && !isGroupBoxDrag) return;
      // Units-aware: pointer px -> PAGE UNITS (inches OR mm).
      // element x/y/w/h are in page units; on an A4 (mm) model a delta in
      // INCHES was ~25x too small, so dragging barely moved the element
      // ("sluggish / stuck"). Derive page-units-per-px from the rendered page
      // width so it is correct for both in and mm models.
      var _pgEl = this.$refs.miniPage;
      var _pgW = (_pgEl && m.page.width) ? m.page.width : 1;
      var _pgRenderedW = _pgEl ? _pgEl.getBoundingClientRect().width : (_pgW * 96);
      var pageUnitsPerPx = (_pgRenderedW > 0) ? (_pgW / _pgRenderedW) : 1;
      var pxPerInch = 96 * this.imageScale; // kept for inch-specific uses
      var mode = this.imageDrag.mode || "move";
      // GROUP-BOX drags have no imgId; handle resize/rotate straight from
      // the group pivot here, before the per-element `if (!img) return`.
      if (this.imageDrag.group && !this.imageDrag.imgId) {
        if (mode === "move") {
          var gmDx = (evt.clientX - this.imageDrag.startX) * pageUnitsPerPx;
          var gmDy = (evt.clientY - this.imageDrag.startY) * pageUnitsPerPx;
          var gmBases = this.imageDrag.bases || [];
          for (var gbi = 0; gbi < gmBases.length; gbi++) {
            var gb = gmBases[gbi];
            var gtarget = null;
            if (gb.kind === 'textBox') { var gtb = page.textBoxes || []; for (var gti = 0; gti < gtb.length; gti++) { if (gtb[gti].id === gb.id) { gtarget = gtb[gti]; break; } } }
            else { var gim = page.images || []; for (var gii = 0; gii < gim.length; gii++) { if (gim[gii].id === gb.id) { gtarget = gim[gii]; break; } } }
            if (gtarget) { gtarget.x = Math.round((gb.x + gmDx) * 100) / 100; gtarget.y = Math.round((gb.y + gmDy) * 100) / 100; }
          }
          this.updateGroupBox();
          return;
        }
        if (mode === "rotate") {
          var gbax = evt.clientX - this.imageDrag.gcx;
          var gbay = evt.clientY - this.imageDrag.gcy;
          var gbang = Math.atan2(gbay, gbax) * 180 / Math.PI;
          var gbdelta = gbang - this.imageDrag.startAngle;
          // Rotate the ELEMENTS...
          this._applyGroupTransform(this.imageDrag.group, 1, gbdelta);
          // ...and rotate the BOX rigidly about its center, so the frame and
          // its handles orbit with the content instead of the axis-aligned
          // bounds reshaping every step. Do NOT call updateGroupBox here.
          var gboxEl = this.$refs.groupBoxEl;
          if (gboxEl) {
            gboxEl.style.transformOrigin = "center center";
            gboxEl.style.transform = "rotate(" + gbdelta + "deg)";
          }
          return;
        }
        if (mode === "resize" || mode === "resize-scaled") {
          var gbdx = evt.clientX - this.imageDrag.gcx;
          var gbdy = evt.clientY - this.imageDrag.gcy;
          var gbdist = Math.sqrt(gbdx * gbdx + gbdy * gbdy) || 1;
          var gbs = gbdist / this.imageDrag.startDist;
          if (gbs < 0.1) gbs = 0.1;
          if (gbs > 12) gbs = 12;
          this._applyGroupTransform(this.imageDrag.group, gbs, 0);
          this.updateGroupBox();
          return;
        }
      }
      if (mode === "move") {
        // Mark that a real drag happened (moved beyond a few px), so the
        // click that follows mouseup does not collapse the selection.
        var mvx = evt.clientX - this.imageDrag.startX;
        var mvy = evt.clientY - this.imageDrag.startY;
        if ((mvx * mvx + mvy * mvy) > 9) this.imageDrag.moved = true;
        var dxIn = (evt.clientX - this.imageDrag.startX) * pageUnitsPerPx;
        var dyIn = (evt.clientY - this.imageDrag.startY) * pageUnitsPerPx;
        // Multi-move: if several elements are selected, move them all by the
        // same delta (their positions captured at drag start).
        if (this.selSet && this.selSet.length > 1 && this.imageDrag.bases) {
          for (var bi = 0; bi < this.imageDrag.bases.length; bi++) {
            var b = this.imageDrag.bases[bi];
            var target = null;
            if (b.kind === 'textBox') {
              var tboxes = page.textBoxes || [];
              for (var ti = 0; ti < tboxes.length; ti++) { if (tboxes[ti].id === b.id) { target = tboxes[ti]; break; } }
            } else {
              var timgs = page.images || [];
              for (var ii = 0; ii < timgs.length; ii++) { if (timgs[ii].id === b.id) { target = timgs[ii]; break; } }
            }
            if (target) {
              target.x = Math.round((b.x + dxIn) * 100) / 100;
              target.y = Math.round((b.y + dyIn) * 100) / 100;
            }
          }
        } else {
          img.x = Math.round((this.imageDrag.baseX + dxIn) * 100) / 100;
          img.y = Math.round((this.imageDrag.baseY + dyIn) * 100) / 100;
        }
      } else if (mode === "resize-free") {
        // Independent width and height: horizontal drag changes w, vertical
        // drag changes h. Uses a projection so the element grows with the
        // cursor rather than as a distance ratio.
        var px = 96 * this.imageScale;
        var fdx = (evt.clientX - this.imageDrag.startX) * pageUnitsPerPx;
        var fdy = (evt.clientY - this.imageDrag.startY) * pageUnitsPerPx;
        var fw = this.imageDrag.baseW + fdx;
        var fh = this.imageDrag.baseH + fdy;
        var _s = this._unitScale();
        if (fw < 0.15 * _s) fw = 0.15 * _s;
        if (fw > 24 * _s) fw = 24 * _s;
        if (fh < 0.1 * _s) fh = 0.1 * _s;
        if (fh > 24 * _s) fh = 24 * _s;
        img.w = Math.round(fw * 100) / 100;
        img.h = Math.round(fh * 100) / 100;
      } else if (mode === "resize") {
        // Group resize: scale ALL selected elements about the pivot.
        if (this.imageDrag.group) {
          var gdx = evt.clientX - this.imageDrag.gcx;
          var gdy = evt.clientY - this.imageDrag.gcy;
          var gdist = Math.sqrt(gdx * gdx + gdy * gdy) || 1;
          var gs = gdist / this.imageDrag.startDist;
          if (gs < 0.1) gs = 0.1;
          if (gs > 12) gs = 12;
          this._applyGroupTransform(this.imageDrag.group, gs, 0);
          return;
        }
        var dx = evt.clientX - this.imageDrag.cx;
        var dy = evt.clientY - this.imageDrag.cy;
        var dist = Math.sqrt(dx * dx + dy * dy) || 1;
        var ratio = dist / this.imageDrag.startDist;
        var _s2 = this._unitScale();
        var newW = this.imageDrag.baseW * ratio;
        if (newW < 0.25 * _s2) newW = 0.25 * _s2;
        // Generous upper bound so tape (and images) can span past the page
        // edge, the way real zine tape runs off the paper. The mini-page's
        // overflow:hidden trims anything outside the page for print.
        if (newW > 24 * _s2) newW = 24 * _s2;
        img.w = Math.round(newW * 100) / 100;
      } else if (mode === "resize-scaled") {
        // Group resize driven from a TEXT BOX handle: scale ALL selected
        // elements about the pivot (same as the image resize branch). Without
        // this, a text-box resize only scaled the text box and left the rest
        // of the selection untouched.
        if (this.imageDrag.group) {
          var gsdx = evt.clientX - this.imageDrag.gcx;
          var gsdy = evt.clientY - this.imageDrag.gcy;
          var gsdist = Math.sqrt(gsdx * gsdx + gsdy * gsdy) || 1;
          var gss = gsdist / this.imageDrag.startDist;
          if (gss < 0.1) gss = 0.1;
          if (gss > 12) gss = 12;
          this._applyGroupTransform(this.imageDrag.group, gss, 0);
          return;
        }
        // Text box: scale width and font size together.
        var sdx = evt.clientX - this.imageDrag.cx;
        var sdy = evt.clientY - this.imageDrag.cy;
        var sdist = Math.sqrt(sdx * sdx + sdy * sdy) || 1;
        var sratio = sdist / this.imageDrag.startDist;
        var _s3 = this._unitScale();
        var nw = this.imageDrag.baseW * sratio;
        var nfPt = (this.imageDrag.baseFontPt || 12) * sratio;
        if (nw < 0.4 * _s3) nw = 0.4 * _s3;
        if (nw > 8 * _s3) nw = 8 * _s3;
        if (nfPt < 4) nfPt = 4;
        if (nfPt > 200) nfPt = 200;
        img.w = Math.round(nw * 100) / 100;
        // Resizing the box scales the font and UPDATES the point number, so
        // the control reflects the new effective size.
        img.fontPt = Math.round(nfPt * 2) / 2; // round to 0.5pt
        delete img.fontSize; // migrate off the legacy multiplier
      } else if (mode === "rotate") {
        // Group rotate: rotate ALL selected elements about the pivot.
        if (this.imageDrag.group) {
          var gax = evt.clientX - this.imageDrag.gcx;
          var gay = evt.clientY - this.imageDrag.gcy;
          var gang = Math.atan2(gay, gax) * 180 / Math.PI;
          var gdelta = gang - this.imageDrag.startAngle;
          this._applyGroupTransform(this.imageDrag.group, 1, gdelta);
          return;
        }
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
          });
        }
      }
    },
    onImageMouseUp: function (evt) {
      // Rubber-band: finish if a marquee was in progress. Shift = add to the
      // existing selection; otherwise replace.
      if (this.marquee && this.marquee.active) {
        this._marqueeFinish(!!(evt && evt.shiftKey));
        return;
      }
      var wasDragging = !!this.imageDrag;
      var wasText = this.imageDrag && this.imageDrag.isText;
      var moved = !!(this.imageDrag && this.imageDrag.moved);
      this.imageDrag = null;
      if (wasDragging && !wasText) {
        var self = this;
      }
      // A real drag should NOT be followed by a click that re-selects (which
      // would collapse a multi-selection). Suppress the next click.
      // IMPORTANT: clear on a MACROTASK (setTimeout), not $nextTick -- the
      // browser's click event fires after mouseup but LATER than a microtask,
      // so a $nextTick clear ran too early and the click still collapsed the
      // selection.
      if (moved) {
        this._suppressClick = true;
        var self2 = this;
        setTimeout(function () { self2._suppressClick = false; }, 0);
      }
    },
    setImageW: function (v) {
      var img = this.activeImage;
      if (!img) return;
      var s = this._unitScale();
      img.w = Math.max(0.25 * s, Math.min(8 * s, Number(v)));
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
      // Flow-wrap is retired (the layout UI offers only free and block).
      // This just records the chosen wrap mode. Any legacy 'flow' value
      // on an old image is normalized to 'free' by zfMigratePage on load,
      // so the renderer only ever sees free or block here.
      img.wrap = mode;
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
    },
    fitImage: function () {
      var img = this.activeImage;
      var m = this.activeModel;
      if (!img || !m) return;
      var w = m.page.width;
      var margin = store.modelMarginIn();
      img.x = 0;
      img.y = 0;
      img.w = Math.max(0.5, w - margin * 2);
      img.rot = 0;
      var self = this;
    },
    // -------- Multi-selection helpers --------
    // The selection set is the source of truth for "what is selected"; the
    // single active ids mirror the primary (last-selected) member.
    // Page units per inch: 25.4 on a mm model, 1 on an inch model. Used to
    // scale inch-tuned defaults/clamps for image + text sizing so A4 (mm)
    // behaves like the inch models.
    _unitScale: function () {
      var m = this.activeModel;
      if (m && m.page && m.page.unit === 'mm') return 25.4;
      return 1;
    },
    // -------- Group scale / rotate (from the floating panel) --------
    // When a multi-selection is active, the Width/Rotation controls become
    // Scale (%) and Rotation (deg) that transform ALL selected elements.
    // We capture a base snapshot the first time the control is used after a
    // selection change, then apply ABSOLUTE-from-base each input (no
    // compounding). Reset on selection change.
    _ensureGroupScaleBase: function () {
      if (!this._groupScaleBase) {
        this._groupScaleBase = this._groupTransformSnapshot();
        this.groupScalePct = 100;
      }
      return this._groupScaleBase;
    },
    _ensureGroupRotateBase: function () {
      if (!this._groupRotateBase) {
        this._groupRotateBase = this._groupTransformSnapshot();
        this.groupRotateDeg = 0;
      }
      return this._groupRotateBase;
    },
    // Scale the whole selection to pct% of its size at base time.
    setGroupScale: function (pct) {
      var g = this._ensureGroupScaleBase();
      if (!g) return;
      var n = Number(pct);
      if (isNaN(n) || n <= 0) return;
      this.groupScalePct = n;
      this._applyGroupTransform(g, n / 100, 0);
      this.updateGroupBox();
    },
    // Rotate the whole selection by deg relative to its base orientation.
    setGroupRotation: function (deg) {
      var g = this._ensureGroupRotateBase();
      if (!g) return;
      var n = Number(deg);
      if (isNaN(n)) return;
      this.groupRotateDeg = n;
      this._applyGroupTransform(g, 1, n);
      var boxEl = this.$refs.groupBoxEl;
      if (boxEl) { boxEl.style.transformOrigin = 'center center'; boxEl.style.transform = 'rotate(' + n + 'deg)'; }
    },
    // Unit-aware range for the image-width slider + number input.
    imageWidthRange: function () {
      var s = this._unitScale();
      return { min: (0.5 * s).toFixed(2), max: (8 * s).toFixed(2), step: (0.05 * s).toFixed(2) };
    },
    textWidthRange: function () {
      var s = this._unitScale();
      return { min: (0.4 * s).toFixed(2), max: (8 * s).toFixed(2), step: (0.05 * s).toFixed(2) };
    },
    // The measurement unit label for display.
    pageUnitLabel: function () {
      var m = this.activeModel;
      return (m && m.page && m.page.unit === 'mm') ? 'mm' : 'in';
    },
    _selKey: function (kind, id) { return kind + ':' + id; },

    // Is this element in the selection set?
    isSelected: function (kind, id) {
      var s = this.selSet || [];
      for (var i = 0; i < s.length; i++) {
        if (s[i].kind === kind && s[i].id === id) return true;
      }
      return false;
    },

    // True when this element is the ONLY selection -- the case that shows
    // resize/rotate handles (handles are single-element only; multi-select
    // shows bounding boxes but no handles).
    isSingleSelected: function (kind, id) {
      var s = this.selSet || [];
      return s.length === 1 && s[0].kind === kind && s[0].id === id;
    },

    // Replace the selection with a single element (and set it primary).
    // -------- Groups (atomic selection) --------
    // Resolve an element id to its group (or null).
    _groupOf: function (id) {
      var page = this.active;
      if (!page || !Array.isArray(page.groups)) return null;
      for (var i = 0; i < page.groups.length; i++) {
        if ((page.groups[i].memberIds || []).indexOf(id) !== -1) return page.groups[i];
      }
      return null;
    },

    // Is this element id in any group?
    _isGrouped: function (id) { return !!this._groupOf(id); },

    // { kind, id } for every member of a group (kind resolved by lookup).
    _groupMemberRefs: function (group) {
      var page = this.active;
      var out = [];
      if (!page || !group) return out;
      (group.memberIds || []).forEach(function (mid) {
        var inImgs = (page.images || []).some(function (im) { return im.id === mid; });
        var inTbs = (page.textBoxes || []).some(function (tb) { return tb.id === mid; });
        if (inImgs) out.push({ kind: 'image', id: mid });
        else if (inTbs) out.push({ kind: 'textBox', id: mid });
      });
      return out;
    },

    // Expand a list of {kind,id} so any grouped member pulls in its whole
    // group (dedup). This is what makes groups "atomic" for selection.
    _expandToGroups: function(refs) {
      var page = this.active;
      var out = [];
      var seen = {};
      function push(r) {
        var k = r.kind + ':' + r.id;
        if (seen[k]) return;
        seen[k] = true;
        out.push(r);
      }
      (refs || []).forEach(function (r) {
        push(r);
        var g = null;
        if (page && Array.isArray(page.groups)) {
          for (var i = 0; i < page.groups.length; i++) {
            if ((page.groups[i].memberIds || []).indexOf(r.id) !== -1) { g = page.groups[i]; break; }
          }
        }
        if (g) {
          (g.memberIds || []).forEach(function (mid) {
            var inImgs = (page.images || []).some(function (im) { return im.id === mid; });
            push({ kind: inImgs ? 'image' : 'textBox', id: mid });
          });
        }
      });
      return out;
    },

    _selSetOnly: function (kind, id) {
      var page = this.active;
      if (!page) return;
      this.selSet = this._expandToGroups([{ kind: kind, id: id }]);
      this._syncPrimary();
    },

    // Add to the selection (primary becomes this). No-op if present.
    _selSetAdd: function (kind, id) {
      if (this.isSelected(kind, id)) { this._syncPrimary(kind, id); return; }
      this.selSet = (this.selSet || []).concat([{ kind: kind, id: id }]);
      this._syncPrimary(kind, id);
    },

    // Toggle membership (Shift-click). Returns true if now selected.
    _selSetToggle: function (kind, id) {
      if (this.isSelected(kind, id)) {
        // Remove the whole group the element belongs to (atomic).
        var grp = this._groupOf(id);
        var remove = grp ? (grp.memberIds || []) : [id];
        this.selSet = (this.selSet || []).filter(function (s) { return remove.indexOf(s.id) === -1; });
        this._syncPrimary();
        return false;
      }
      var add = this._expandToGroups([{ kind: kind, id: id }]);
      var cur = this.selSet || [];
      var seen = {};
      cur.forEach(function (s) { seen[s.kind + ':' + s.id] = true; });
      add.forEach(function (s) { if (!seen[s.kind + ':' + s.id]) cur = cur.concat([s]); });
      this.selSet = cur;
      this._syncPrimary(kind, id);
      return true;
    },

    _selSetClear: function () {
      this.selSet = [];
      var page = this.active;
      if (page) { page.activeImageId = null; page.activeTextBoxId = null; }
    },

    // Mirror the selection set into the single active ids. Without an explicit
    // primary, use the last member (or clear if the set is empty).
    _syncPrimary: function (preferKind, preferId) {
      var page = this.active;
      if (!page) return;
      var s = this.selSet || [];
      if (!s.length) { page.activeImageId = null; page.activeTextBoxId = null; return; }
      var pick = null;
      // If the caller named the element the user actively clicked, use it.
      if (preferKind && preferId) {
        for (var i = 0; i < s.length; i++) { if (s[i].kind === preferKind && s[i].id === preferId) { pick = s[i]; break; } }
      }
      // No preference (e.g. a marquee drag): choose a primary by KIND, not by
      // raw array order. Prefer an image if the set has any image, so
      // multi-selecting icons shows the Image panel instead of flipping to
      // Text just because text boxes were appended later in the loop.
      if (!pick) {
        var firstImage = null, firstText = null, anyImage = false;
        for (var j = 0; j < s.length; j++) {
          if (s[j].kind === 'image') { anyImage = true; if (!firstImage) firstImage = s[j]; }
          else if (!firstText) firstText = s[j];
        }
        pick = anyImage ? firstImage : (firstText || s[s.length - 1]);
      }
      if (pick.kind === 'textBox') { page.activeTextBoxId = pick.id; page.activeImageId = null; }
      else { page.activeImageId = pick.id; page.activeTextBoxId = null; }
    },

    // Is this element id in a group? (template helper)
    isGrouped: function (id) { return this._isGrouped(id); },

    // Layers-panel chain toggle: if the layer is grouped, unlink it (remove
    // from its group); otherwise link it with the current selection.
    toggleLayerGroup: function (layer) {
      var page = this.active;
      if (!page || !layer) return;
      var id = layer.el.id;
      if (this._isGrouped(id)) {
        // Unlink: remove this element from its group.
        if (Array.isArray(page.groups)) {
          page.groups.forEach(function (g) {
            var i = (g.memberIds || []).indexOf(id);
            if (i !== -1) g.memberIds.splice(i, 1);
          });
          page.groups = page.groups.filter(function (g) { return (g.memberIds || []).length > 1; });
        }
        return;
      }
      // Link with selection: if 1+ others are selected, group them together.
      var sel = (this.selSet || []).slice();
      var hasThis = sel.some(function (s) { return s.id === id; });
      if (!hasThis) sel.push({ kind: (layer.kind === 'textBox' ? 'textBox' : 'image'), id: id });
      if (sel.length < 2) return; // nothing to link to
      this.selSet = sel;
      this._syncPrimary();
      this.groupSelection();
    },

    // Can the current selection be grouped / ungrouped? (context menu gating)
    canGroupSelection: function () {
      var s = this.selSet || [];
      if (s.length < 2) return false;
      // Already exactly one group covering the selection? then no "group".
      return true;
    },
    canUngroupSelection: function () {
      var s = this.selSet || [];
      var self = this;
      return s.some(function (r) { return self._isGrouped(r.id); });
    },

    // Make a group from the current selection (2+ elements).
    groupSelection: function () {
      var page = this.active;
      var s = this.selSet || [];
      if (!page || s.length < 2) return;
      if (!Array.isArray(page.groups)) page.groups = [];
      // Drop any existing groups fully contained in the selection first.
      var selIds = {};
      s.forEach(function (r) { selIds[r.id] = true; });
      page.groups = page.groups.filter(function (g) {
        return !(g.memberIds || []).every(function (m) { return selIds[m]; });
      });
      var id = 'g-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
      page.groups.push({ id: id, memberIds: s.map(function (r) { return r.id; }) });
    },

    // Ungroup: remove every group that touches the current selection.
    ungroupSelection: function () {
      var page = this.active;
      if (!page || !Array.isArray(page.groups)) return;
      var selIds = {};
      (this.selSet || []).forEach(function (r) { selIds[r.id] = true; });
      page.groups = page.groups.filter(function (g) {
        return !(g.memberIds || []).some(function (m) { return selIds[m]; });
      });
    },

    // The member ids of the set matching a kind.
    _selIdsOfKind: function (kind) {
      return (this.selSet || []).filter(function (s) { return s.kind === kind; }).map(function (s) { return s.id; });
    },

    // Select every element on the current page (Ctrl/Cmd+A). Text boxes
    // first, then images, so the primary ends up being an image if present.
    selectAllOnPage: function () {
      var page = this.active;
      if (!page) return;
      var set = [];
      (page.images || []).forEach(function (im) { set.push({ kind: 'image', id: im.id }); });
      (page.textBoxes || []).forEach(function (tb) { set.push({ kind: 'textBox', id: tb.id }); });
      this.selSet = set;
      this._syncPrimary();
    },

    // Snapshot every selected element (center, size, rotation, font) plus the
    // group's pivot (bounding-box center, in page inches), so a resize/rotate
    // can be applied uniformly to all of them. Returns null for <2 selected.
    _groupTransformSnapshot: function () {
      var page = this.active;
      var m = this.activeModel;
      if (!page || !m || !this.selSet || this.selSet.length < 2) return null;
      var margin = store.modelMarginIn();
      var items = [];
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      var self = this;
      this.selSet.forEach(function (s) {
        var el = null;
        if (s.kind === 'textBox') {
          (page.textBoxes || []).forEach(function (tb) { if (tb.id === s.id) el = tb; });
        } else {
          (page.images || []).forEach(function (im) { if (im.id === s.id) el = im; });
        }
        if (!el) return;
        var w = (typeof el.w === 'number') ? el.w : 0.6;
        var h = (el.kind === 'icon') ? w : ((typeof el.h === 'number') ? el.h : (s.kind === 'textBox' ? 0.5 : w));
        var cx = (typeof el.x === 'number' ? el.x : 0) + margin + w / 2;
        var cy = (typeof el.y === 'number' ? el.y : 0) + margin + h / 2;
        items.push({
          kind: s.kind, id: s.id,
          cx: cx, cy: cy, w: w, h: h,
          rot: (typeof el.rot === 'number') ? el.rot : 0,
          fontPt: (typeof el.fontPt === 'number') ? el.fontPt : null
        });
        if (cx - w/2 < minX) minX = cx - w/2;
        if (cy - h/2 < minY) minY = cy - h/2;
        if (cx + w/2 > maxX) maxX = cx + w/2;
        if (cy + h/2 > maxY) maxY = cy + h/2;
      });
      if (items.length < 2) return null;
      return {
        pivot: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
        items: items
      };
    },

    // Apply a uniform scale (s) and/or rotation (thetaDeg) to a group snapshot
    // about its pivot. Writes back x/y/w/h/rot/fontPt (in page inches).
    _applyGroupTransform: function (g, s, thetaDeg) {
      var page = this.active;
      var m = this.activeModel;
      if (!page || !m || !g) return;
      var margin = store.modelMarginIn();
      var th = (thetaDeg || 0) * Math.PI / 180;
      var cos = Math.cos(th), sin = Math.sin(th);
      g.items.forEach(function (it) {
        // Rotate the center about the pivot, and scale its distance from it.
        var dx = it.cx - g.pivot.x, dy = it.cy - g.pivot.y;
        var rx = dx * cos - dy * sin;
        var ry = dx * sin + dy * cos;
        var ncx = g.pivot.x + rx * s;
        var ncy = g.pivot.y + ry * s;
        var nw = it.w * s;
        var nh = it.h * s;
        var nrot = it.rot + (thetaDeg || 0);
        // Locate the element and write back.
        var el = null;
        if (it.kind === 'textBox') {
          (page.textBoxes || []).forEach(function (tb) { if (tb.id === it.id) el = tb; });
        } else {
          (page.images || []).forEach(function (im) { if (im.id === it.id) el = im; });
        }
        if (!el) return;
        el.x = Math.round((ncx - margin - nw / 2) * 100) / 100;
        el.y = Math.round((ncy - margin - nh / 2) * 100) / 100;
        el.w = Math.round(Math.max(0.1, nw) * 100) / 100;
        if (el.kind !== 'icon') {
          if (typeof it.h === 'number' && it.h > 0) el.h = Math.round(Math.max(0.05, nh) * 100) / 100;
        }
        el.rot = Math.round(nrot);
        // Text boxes: on a GROUP SCALE, lock the width so the box scales
        // RIGIDLY like every other element. Otherwise auto-width re-hugs the
        // (scaled) text, so the box width drifts independently of the group
        // and looks out of lockstep. Only lock on a real scale (s !== 1), so
        // a pure group rotate does not unexpectedly fix a box's width.
        if (it.kind === 'textBox') {
          if (s !== 1) el.autoWidth = false;
          if (it.fontPt !== null) el.fontPt = Math.round(Math.max(4, it.fontPt * s) * 2) / 2;
        } else if (it.fontPt !== null) {
          el.fontPt = Math.round(Math.max(4, it.fontPt * s) * 2) / 2;
        }
      });
    },

    // Capture {kind, id, x, y} for every selected element, so a drag can move
    // them all by a shared delta.
    _selectionBases: function () {
      var page = this.active;
      if (!page) return [];
      var out = [];
      (this.selSet || []).forEach(function (s) {
        var el = null;
        if (s.kind === 'textBox') {
          var boxes = page.textBoxes || [];
          for (var i = 0; i < boxes.length; i++) { if (boxes[i].id === s.id) { el = boxes[i]; break; } }
        } else {
          var imgs = page.images || [];
          for (var j = 0; j < imgs.length; j++) { if (imgs[j].id === s.id) { el = imgs[j]; break; } }
        }
        if (el) out.push({ kind: s.kind, id: s.id, x: (typeof el.x === 'number' ? el.x : 0), y: (typeof el.y === 'number' ? el.y : 0) });
      });
      return out;
    },

    // Click handler for an element. Plain click selects (replace); a
    // shift-click was already handled on mousedown (toggle), so it must NOT
    // replace the selection here or it would clobber the additive selection.
    onElementClick: function (kind, el, evt) {
      if (!el) return;
      if (evt && evt.shiftKey) return; // mousedown already toggled
      // A click that follows a real drag must not reset the selection (that
      // would drop a multi-selection down to the dragged element).
      if (this._suppressClick) return;
      if (kind === 'textBox') this.selectTextBox(el);
      else this.selectImage(el);
    },

    selectImage: function (img) {
      var page = this.active;
      if (!page || !img) return;
      this._selSetOnly('image', img.id);
    },

    // If a deliberate selection's own box (+ small grace) contains the
    // pointer, return { kind, id } so the caller drags the SELECTED element
    // instead of letting z-order re-pick. Else null (normal behavior).
    _selectedWinsAtPoint: function (evt) {
      var page = this.active;
      if (!page) return null;
      var kind = page.activeImageId ? 'image' : (page.activeTextBoxId ? 'textBox' : null);
      var id = page.activeImageId || page.activeTextBoxId;
      if (!kind || !id) return null;
      var sel = page.activeImageId ? '[data-zf-img-id="' + id + '"]' : '[data-zf-text-id="' + id + '"]';
      var el = this.$el ? this.$el.querySelector(sel) : null;
      if (!el) return null;
      var r = el.getBoundingClientRect();
      var m = 4; // small grace so pressing at the very edge still grabs it
      if (evt.clientX >= r.left - m && evt.clientX <= r.right + m &&
          evt.clientY >= r.top - m && evt.clientY <= r.bottom + m) {
        return { kind: kind, id: id };
      }
      return null;
    },

    // Begin a move-drag on the given element (used when a selection takes
    // priority over the clicked element). Selects it, then sets up imageDrag.
    _startMoveDrag: function (kind, id, evt) {
      var page = this.active;
      if (!page) return;
      this._hideOverlapPicker();
      var el = null;
      if (kind === 'textBox') {
        var boxes = page.textBoxes || [];
        for (var i = 0; i < boxes.length; i++) { if (boxes[i].id === id) { el = boxes[i]; break; } }
        page.activeTextBoxId = id; page.activeImageId = null;
      } else {
        var imgs = page.images || [];
        for (var j = 0; j < imgs.length; j++) { if (imgs[j].id === id) { el = imgs[j]; break; } }
        page.activeImageId = id; page.activeTextBoxId = null;
      }
      if (!el) return;
      this.imageDrag = {
        imgId: id,
        isText: (kind === 'textBox'),
        mode: 'move',
        startX: evt.clientX,
        startY: evt.clientY,
        baseX: (typeof el.x === 'number') ? el.x : 0,
        baseY: (typeof el.y === 'number') ? el.y : 0,
        bases: this._selectionBases()
      };
      var self = this;
    },

    // -------- Overlap picker --------
    // Human-readable name for an element, used in the overlap picker.
    _elementName: function (kind, id) {
      var page = this.active;
      if (!page) return '';
      if (kind === 'textBox') {
        var boxes = page.textBoxes || [];
        for (var i = 0; i < boxes.length; i++) {
          if (boxes[i].id === id) {
            var t = (boxes[i].html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
            return t ? (t.length > 28 ? t.slice(0, 28) + '...' : t) : 'Text box';
          }
        }
        return 'Text box';
      }
      var imgs = page.images || [];
      for (var j = 0; j < imgs.length; j++) {
        if (imgs[j].id !== id) continue;
        var k = imgs[j].kind || 'photo';
        if (k === 'icon') {
          var nm = String(imgs[j].src || '').split(':').pop().replace(/-/g, ' ');
          return nm ? (nm.charAt(0).toUpperCase() + nm.slice(1)) : 'Icon';
        }
        if (k === 'tape') return 'Tape';
        if (k === 'scrap') return 'Paper scrap';
        if (k === 'sticky') return 'Sticky note';
        if (k === 'sticker') return 'Sticker';
        return 'Image';
      }
      return 'Element';
    },

    // Build the list of selectable elements stacked under a screen point,
    // topmost first. Each entry: { kind, id, name }.
    _elementsAtPoint: function (x, y) {
      var els = (document.elementsFromPoint ? document.elementsFromPoint(x, y) : []) || [];
      var list = [];
      var seen = {};
      for (var i = 0; i < els.length; i++) {
        var e = els[i];
        if (!e || !e.getAttribute) continue;
        var iid = e.getAttribute('data-zf-img-id');
        var tid = e.getAttribute('data-zf-text-id');
        var kind = iid ? 'image' : (tid ? 'textBox' : null);
        var id = iid || tid;
        if (!kind || !id) continue;
        var key = kind + ':' + id;
        if (seen[key]) continue;
        seen[key] = true;
        list.push({
          kind: kind,
          id: id,
          name: this._elementName(kind, id),
          glyph: this._elementGlyph(kind, id)
        });
      }
      return list;
    },

    // An iconify icon name to show as a small glyph in the overlap picker.
    // Icons show their own icon; other kinds get a representative glyph.
    _elementGlyph: function (kind, id) {
      var page = this.active;
      if (!page) return 'ph:square';
      if (kind === 'textBox') return 'ph:text-t';
      var imgs = page.images || [];
      for (var j = 0; j < imgs.length; j++) {
        if (imgs[j].id !== id) continue;
        var k = imgs[j].kind || 'photo';
        if (k === 'icon') return imgs[j].src || 'ph:star';
        if (k === 'tape') return 'ph:tape';
        if (k === 'scrap') return 'ph:note';
        if (k === 'sticky') return 'ph:note-pencil';
        if (k === 'sticker') return 'ph:seal';
        return 'ph:image';
      }
      return 'ph:square';
    },

    // Mousemove over the editor: if >=2 elements overlap at the cursor, show
    // a small picker listing them so the user can choose the one they want.
    onEditorHoverForPicker: function (evt) {
      // Ignore while dragging/drawing.
      if (this.imageDrag || this.drawingMode) {
        this._hideOverlapPicker();
        this._setHoveredElement(null);
        return;
      }
      var x = evt.clientX, y = evt.clientY;

      // Hover highlight: reflect what a MOUSEDOWN would actually target --
      // the selected element if the pointer is inside its own box, otherwise
      // the topmost element. This keeps the highlight consistent with the
      // drag behavior (no highlighting a different element than you'll move).
      var pri = this._selectedWinsAtPoint(evt);
      if (pri) {
        this._setHoveredElement(pri);
      } else {
        var at = this._elementsAtPoint(x, y);
        this._setHoveredElement(at.length ? { kind: at[0].kind, id: at[0].id } : null);
      }

      // Overlap picker. If it is ALREADY open, do NOT recompute/reposition it
      // on every move (that made it chase the cursor and vanish as you moved
      // toward it). Keep it open while the pointer is over the picker itself
      // or over the stack region; hide it only when the pointer is over
      // neither. If it is not open, open it (debounced) over a stack.
      var self = this;
      if (this._overPicker(x, y)) {
        // Pointer is over the open picker: keep it open, ignore.
        return;
      }
      if (this.overlapPicker.open) {
        // Still over the stack? keep it. Otherwise hide.
        var here = this._elementsAtPoint(x, y);
        if (here.length < 2) this._hideOverlapPicker();
        return;
      }
      if (this._pickerTimer) clearTimeout(this._pickerTimer);
      this._pickerTimer = setTimeout(function () {
        var list = self._elementsAtPoint(x, y);
        if (list.length < 2) { self._hideOverlapPicker(); return; }
        self.overlapPicker = { open: true, x: x, y: y, items: list };
      }, 260);
    },

    // Is the screen point over the currently-open overlap picker?
    _overPicker: function (x, y) {
      var el = this.$el ? this.$el.querySelector('.zf-overlap-picker') : null;
      if (!el) return false;
      var r = el.getBoundingClientRect();
      return (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom);
    },

    // Position the selection overlay to exactly cover the editor page, and
    // compute the selected element's outline box within it. Called on
    // mount/update/resize and whenever the selection changes.
    _positionOverlay: function () {
      if (this._overlayPending) return;
      this._overlayPending = true;
      var self = this;
      this.$nextTick(function () {
        self._overlayPending = false;
        var pageEl = self.$refs.miniPage;
        var wrapEl = pageEl && pageEl.parentElement;
        var ov = self.$refs.selOverlay;
        if (!pageEl || !wrapEl || !ov) return;
        var pr = pageEl.getBoundingClientRect();
        var wr = wrapEl.getBoundingClientRect();
        var box = {
          left: (pr.left - wr.left) + 'px',
          top: (pr.top - wr.top) + 'px',
          width: pr.width + 'px',
          height: pr.height + 'px'
        };
        // Only assign if changed -- avoids re-triggering renders.
        if (JSON.stringify(self.selectionOverlayStyle) !== JSON.stringify(box)) {
          self.selectionOverlayStyle = box;
        }
        // Outline for the selected element (image or text box), positioned as
        // a % of the page (matches the overlay which equals the page box).
        var page = self.active;
        var el = null;
        if (page && page.activeImageId) {
          var imgs = page.images || [];
          for (var i = 0; i < imgs.length; i++) { if (imgs[i].id === page.activeImageId) { el = imgs[i]; break; } }
        } else if (page && page.activeTextBoxId) {
          var boxes = page.textBoxes || [];
          for (var j = 0; j < boxes.length; j++) { if (boxes[j].id === page.activeTextBoxId) { el = boxes[j]; break; } }
        }
        var m = self.activeModel;
        if (!el || !m) {
          if (self.selectionOutline !== null) self.selectionOutline = null;
          return;
        }
        var margin = store.modelMarginIn();
        var x = (typeof el.x === 'number' ? el.x : 0) + margin;
        var y = (typeof el.y === 'number' ? el.y : 0) + margin;
        var w = (typeof el.w === 'number' ? el.w : 0.6);
        var h;
        if (el.kind === 'icon') h = w;
        else if (typeof el.h === 'number') h = el.h;
        else h = null; // content-driven (text box auto height) -> measure DOM
        if (h === null) {
          // Measure the rendered element for its height.
          var sel = page.activeImageId ? '[data-zf-img-id="' + el.id + '"]' : '[data-zf-text-id="' + el.id + '"]';
          var domEl = self.$el ? self.$el.querySelector(sel) : null;
          if (domEl) {
            var dr = domEl.getBoundingClientRect();
            h = (dr.height / pr.height) * m.page.height;
            w = (dr.width / pr.width) * m.page.width;
            x = ((dr.left - pr.left) / pr.width) * m.page.width;
            y = ((dr.top - pr.top) / pr.height) * m.page.height;
          }
        }
        var nextOutline = {
          left: (x / m.page.width * 100) + '%',
          top: (y / m.page.height * 100) + '%',
          width: (w / m.page.width * 100) + '%',
          height: (h / m.page.height * 100) + '%',
          transform: 'rotate(' + (el.rot || 0) + 'deg)',
          transformOrigin: 'center center'
        };
        if (JSON.stringify(self.selectionOutline) !== JSON.stringify(nextOutline)) {
          self.selectionOutline = nextOutline;
        }
      });
    },

    // Set the hovered element (drives the hover highlight class).
    _setHoveredElement: function (el) {
      var cur = this.hoveredEl;
      if (!el) {
        if (cur && cur.id) this.hoveredEl = { kind: '', id: '' };
        return;
      }
      if (cur && cur.kind === el.kind && cur.id === el.id) return;
      this.hoveredEl = { kind: el.kind, id: el.id };
    },

    _hideOverlapPicker: function () {
      if (this._pickerTimer) { clearTimeout(this._pickerTimer); this._pickerTimer = null; }
      if (this.overlapPicker && this.overlapPicker.open) {
        this.overlapPicker = { open: false, x: 0, y: 0, items: [] };
      }
    },

    // The picker is hovered: suppress hide-on-move so the user can reach it.
    onPickerEnter: function () {
      this._pickerHovered = true;
    },
    onPickerLeave: function () {
      this._pickerHovered = false;
    },

    // Choose an element from the overlap picker.
    pickOverlap: function (item) {
      if (!item) return;
      this._selectElementById(item.kind, item.id);
      this._hideOverlapPicker();
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
        x: 0.3 * this._unitScale(),
        y: 0.3 * this._unitScale(),
        w: 0.6 * this._unitScale(),
        rot: 0,
        wrap: 'free',
        z: 0
      };
      page.images.push(el);
      page.activeImageId = el.id;
      page.activeTextBoxId = null;
      this.iconPickerOpen = false;
      var self = this;
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
        x: 0.3 * this._unitScale(),
        y: 0.3 * this._unitScale(),
        // Small starting width; the box hugs its text while autoWidth is true
        // (grows with what you type, wrapping at the page edge). A manual
        // resize turns autoWidth off and commits a fixed width.
        w: 1.0 * this._unitScale(),
        rot: 0,
        autoWidth: true,
        // Explicit point size (12pt). Resizing the box scales this and
        // updates the number; setting the number directly does not resize
        // the box.
        fontPt: 12
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
      this._selSetOnly('textBox', box.id);
    },
    setTextBoxW: function (v) {
      var box = this.activeTextBox;
      if (!box) return;
      var s = this._unitScale();
      box.w = Math.max(0.4 * s, Math.min(8 * s, Number(v)));
    },
    setTextBoxRot: function (v) {
      var box = this.activeTextBox;
      if (!box) return;
      box.rot = Math.round(Number(v));
    },
    // Set the text box font size in POINTS. This does NOT resize the box:
    // the user chose the size deliberately. (Resizing the box, by contrast,
    // scales the font and updates this number -- see onImageMouseMove.)
    // Effective font size in points for a text box: explicit fontPt, else the
    // legacy multiplier (x base 10pt). Used by the control to display the
    // current value.
    textBoxFontPt: function (box) {
      if (!box) return 12;
      if (typeof box.fontPt === 'number' && box.fontPt > 0) return Math.round(box.fontPt * 2) / 2;
      var mult = (typeof box.fontSize === 'number' ? box.fontSize : 1.0);
      return Math.round(mult * 10 * 2) / 2;
    },

    setTextBoxFontSize: function (v) {
      var box = this.activeTextBox;
      if (!box) return;
      var pt = Number(v);
      if (isNaN(pt)) return;
      box.fontPt = Math.max(4, Math.min(200, Math.round(pt * 2) / 2));
      delete box.fontSize; // migrate off the legacy multiplier
    },
    resetTextBox: function () {
      var box = this.activeTextBox;
      if (!box) return;
      box.x = 0.3 * this._unitScale();
      box.y = 0.3 * this._unitScale();
      box.w = 1.8 * this._unitScale();
      box.rot = 0;
      box.fontPt = 12;
      delete box.fontSize;
    },
    textStyle: function (box) {
      if (!box) return {};
      var m = this.activeModel;
      if (!m) return {};
      var base = zfTextBoxStyle(box, m.page.width, m.page.height, store.modelMarginIn());
      base.minHeight = "1em";
      base.cursor = "move";
      // Layered z boost (see imageStyle). Selected above unselected; primary
      // above other selected; reverts on deselect.
      var page = this.active;
      // Boost z ONLY while a drag is in progress (see imageStyle). Idle-
      // selected text boxes show their true z so z-order commands are visible.
      if (page && this.isSelected('textBox', box.id) && this.imageDrag) {
        base.zIndex = base.zIndex + (page.activeTextBoxId === box.id ? 20000 : 10000);
      }
      return base;
    },
    setTextBoxAlign: function (align) {
      var box = this.activeTextBox;
      if (!box) return;
      box.align = align;
      // Justify only has a visible effect on WRAPPED lines, which requires a
      // fixed width. Auto-width boxes hug their text, so justify would look
      // like a no-op. Turning off autoWidth on justify gives it lines to
      // distribute. (Left/center/right work fine either way.)
      if (align === "justify" && box.autoWidth) {
        box.autoWidth = false;
        if (typeof box.w !== "number" || box.w < 0.5) box.w = 1.8;
      }
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
    // Apply one color to EVERY selected element (mixed selection included).
    // Text boxes use .color as text color; images/icons/stickers/stickies use
    // .color as tint/variant. Empty string clears to theme/default.
    setSelectionColor: function (c) {
      var page = this.active;
      if (!page) return;
      var sel = this.selSet || [];
      for (var i = 0; i < sel.length; i++) {
        var s = sel[i];
        var el = null;
        if (s.kind === 'textBox') {
          var tb = page.textBoxes || [];
          for (var a = 0; a < tb.length; a++) { if (tb[a].id === s.id) { el = tb[a]; break; } }
        } else {
          var im = page.images || [];
          for (var b = 0; b < im.length; b++) { if (im[b].id === s.id) { el = im[b]; break; } }
        }
        if (el) el.color = c;
      }
    },
    // -------- Multi-selection: apply a value to EVERY selected text box --------
    // (Absolute-same-value, per policy: 'all these boxes are now X'.)
    _eachSelectedTextBox: function (fn) {
      var page = this.active;
      if (!page || !Array.isArray(page.textBoxes)) return;
      var sel = this.selSet || [];
      for (var i = 0; i < sel.length; i++) {
        if (sel[i].kind !== 'textBox') continue;
        for (var j = 0; j < page.textBoxes.length; j++) {
          if (page.textBoxes[j].id === sel[i].id) { fn(page.textBoxes[j]); break; }
        }
      }
    },
    _eachSelectedImage: function (fn) {
      var page = this.active;
      if (!page || !Array.isArray(page.images)) return;
      var sel = this.selSet || [];
      for (var i = 0; i < sel.length; i++) {
        if (sel[i].kind !== 'image') continue;
        for (var j = 0; j < page.images.length; j++) {
          if (page.images[j].id === sel[i].id) { fn(page.images[j]); break; }
        }
      }
    },
    setTextBoxFontSizeAll: function (v) {
      var pt = Number(v); if (isNaN(pt)) return;
      pt = Math.max(4, Math.min(200, Math.round(pt * 2) / 2));
      this._eachSelectedTextBox(function (b) { b.fontPt = pt; delete b.fontSize; });
    },
    setTextBoxFontFamilyAll: function (fam) {
      this._eachSelectedTextBox(function (b) { b.fontFamily = fam; });
    },
    setTextBoxLineHeightAll: function (v) {
      var lh = Number(v); if (isNaN(lh)) return;
      this._eachSelectedTextBox(function (b) { b.lineHeight = Math.max(0.9, Math.min(2.2, lh)); });
    },
    setTextBoxAlignAll: function (align) {
      this._eachSelectedTextBox(function (b) { b.align = align; if (align === 'justify' && b.autoWidth) { b.autoWidth = false; if (typeof b.w !== 'number' || b.w < 0.5) b.w = 1.8; } });
    },
    setIconColorAll: function (c) {
      this._eachSelectedImage(function (im) { if (im.kind === 'icon') im.color = c; });
    },
    setStickerShapeAll: function (shape) {
      this._eachSelectedImage(function (im) { if (im.kind === 'sticker') im.shape = shape; });
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
    // Apply bold/italic/underline. Two modes:
    //   1) If text is HIGHLIGHTED inside a text box -> format just that
    //      selection (document.execCommand), then sync the box html.
    //   2) If a text box is active but NOTHING is highlighted -> toggle the
    //      format on the WHOLE box (wrap/unwrap its html in the tag). This
    //      handles the common case of a one-word box where highlighting
    //      feels like overkill.
    execCmdOnActive: function (cmd) {
      var el = document.activeElement;
      var inBox = el && el.classList && el.classList.contains('zf-textbox-content');
      var sel = window.getSelection ? window.getSelection() : null;
      var hasSel = false;
      if (sel && sel.rangeCount && inBox) {
        var range = sel.getRangeAt(0);
        hasSel = !range.collapsed && el.contains(range.commonAncestorContainer);
      }

      if (hasSel) {
        // Mode 1: format the highlighted text.
        try { document.execCommand(cmd, false, null); } catch (e) { console.warn('execCommand failed', e); }
        var tid = el.getAttribute('data-zf-text-content-id');
        var page = this.active;
        if (page && Array.isArray(page.textBoxes) && tid) {
          for (var i = 0; i < page.textBoxes.length; i++) {
            if (page.textBoxes[i].id === tid) { page.textBoxes[i].html = zfSanitizeHtml(el.innerHTML); break; }
          }
        }
        return;
      }

      // Mode 2: no selection -> toggle the whole selected box, if any.
      var box = this.selectedTextBox;
      if (box) {
        var tag = cmd === 'bold' ? 'b' : (cmd === 'italic' ? 'i' : (cmd === 'underline' ? 'u' : null));
        if (tag) { this._toggleWholeBoxFormat(box, tag); }
      }
    },
    // Wrap or unwrap a box's entire html in a formatting tag. If the content
    // is already fully wrapped in that tag, remove the wrapper (toggle off).
    // Toggle a format across the WHOLE box, independently of the others.
    // If the tag appears anywhere, strip that tag everywhere (leaving inner
    // content + other formats intact, even when nested). Otherwise wrap the
    // entire content in the tag. String ops only (no regex) -- the sanitizer
    // guarantees only known tags exist.
    _toggleWholeBoxFormat: function (box, tag) {
      if (!box) return;
      var html = box.html || '';
      var present = this.boxHasFormat(tag);
      var aliases = { b: ['b', 'strong'], i: ['i', 'em'], u: ['u'] };
      var names = aliases[tag] || [tag];
      if (present) {
        // Remove every opening/closing tag of this format (and aliases),
        // case-insensitively, via split/join (no regex).
        for (var n = 0; n < names.length; n++) {
          var t = names[n];
          html = this._stripTag(html, t);
        }
        box.html = html;
      } else {
        box.html = '<' + tag + '>' + (html || '&nbsp;') + '</' + tag + '>';
      }
      var self = this;
      this.$nextTick(function () { self.syncTextBoxDom(); });
    },
    // Remove all <tag> and </tag> (case-insensitive) via split/join.
    _stripTag: function (html, tag) {
      var lower = html.toLowerCase();
      var open = '<' + tag + '>';
      var close = '</' + tag + '>';
      // Case-insensitive removal: split on lower-open, but we must remove the
      // actual-cased occurrences. Since tags are ASCII, walk and rebuild.
      var result = html;
      // Repeatedly remove open/close until none remain (handles nesting).
      var guard = 0;
      while (guard++ < 50) {
        var lo = result.toLowerCase();
        var io = lo.indexOf(open);
        var ic = lo.indexOf(close);
        if (io === -1 && ic === -1) break;
        // Remove the earliest occurrence.
        if (io !== -1 && (ic === -1 || io < ic)) {
          result = result.slice(0, io) + result.slice(io + open.length);
        } else {
          result = result.slice(0, ic) + result.slice(ic + close.length);
        }
      }
      return result;
    },
    // Whether the whole selected box is currently wrapped in a format tag,
    // for the panel buttons' pressed state. String checks only (no regex).
    // True if this format is present ANYWHERE in the box, so B/I/U can all
    // light up independently when a box uses several at once. Matches the
    // tag pair plus common aliases (strong/em).
    boxHasFormat: function (tag) {
      var box = this.selectedTextBox;
      if (!box || !box.html) return false;
      var h = box.html.toLowerCase();
      var variants = { b: ['<b>', '<strong>'], i: ['<i>', '<em>'], u: ['<u>'] };
      var tags = variants[tag] || ['<' + tag + '>'];
      for (var k = 0; k < tags.length; k++) {
        if (h.indexOf(tags[k]) !== -1) return true;
      }
      return false;
    },
    onTextBoxInput: function (evt, box) {
      // Read innerHTML only. Do NOT write it back via Vue's v-html (that
      // would move the caret to position 0 on every keystroke). See
      // syncTextBoxDom for the one-time DOM sync.
      box.html = zfSanitizeHtml(evt.target.innerHTML);
    },
    onTextBoxPaste: function (evt, box) {
      // Symmetric to onBodyPaste: flatten rich pastes to plain text before
      // insertion so a pasted <img onerror=...> or styling can never land in
      // the text box's innerHTML even transiently. Without this, a text-box
      // paste would keep its rich HTML until onTextBoxInput re-sanitized it
      // on the next input event -- close, but a real transient window.
      evt.preventDefault();
      var text = (evt.clipboardData || window.clipboardData).getData('text/plain');
      if (document.execCommand) document.execCommand('insertText', false, text);
      // execCommand fires an input event, so onTextBoxInput runs and
      // re-sanitizes box.html for us. Belt-and-suspenders below in case a
      // browser suppresses the input event for execCommand inserts.
      if (box && evt.target) box.html = zfSanitizeHtml(evt.target.innerHTML);
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
      // Shift-click: toggle membership, no drag / no priority redirect.
      if (evt.shiftKey) {
        evt.preventDefault();
        this._hideOverlapPicker();
        this._selSetToggle('textBox', box.id);
        return;
      }
      // Selection priority: a deliberate selection wins inside its own box.
      var priTb = this._selectedWinsAtPoint(evt);
      if (priTb && !(priTb.kind === 'textBox' && priTb.id === box.id)) {
        evt.preventDefault();
        this._startMoveDrag(priTb.kind, priTb.id, evt);
        return;
      }
      this._hideOverlapPicker();
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
      // If the box is part of a multi-selection, keep the selection (do not
      // collapse to just this box) and move the whole group.
      var multi = this.selSet && this.selSet.length > 1 && this.isSelected('textBox', box.id);
      if (multi) this._syncPrimary('textBox', box.id);
      else this.selectTextBox(box);
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
        baseY: (typeof box.y === 'number') ? box.y : 0,
        bases: multi ? this._selectionBases() : null
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
      var margin = store.modelMarginIn();
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
      var pageEl = this.$refs.miniPage;
      if (!pageEl) return;
      var pr = pageEl.getBoundingClientRect();
      var _mR = this.activeModel;
      var px = (_mR && _mR.page.width) ? pr.width / _mR.page.width : 96 * this.imageScale;
      var margin = store.modelMarginIn() * this._unitScale();
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
        startX: evt.clientX,
        startY: evt.clientY,
        startAngle: startAngle,
        baseRot: (typeof box.rot === 'number') ? box.rot : 0,
        cx: cx,
        cy: cy
      };
      // Do NOT collapse the selection: with several selected, rotate the
      // whole group about its pivot (like an image rotate handle).
      if (this.isSelected('textBox', box.id)) this._syncPrimary('textBox', box.id);
      else this.selectTextBox(box);
      var gsnapTR = this._groupTransformSnapshot();
      if (gsnapTR) {
        var gpxTR = pr.left + gsnapTR.pivot.x * px;
        var gpyTR = pr.top + gsnapTR.pivot.y * px;
        var gdxTR = evt.clientX - gpxTR, gdyTR = evt.clientY - gpyTR;
        this.imageDrag.group = gsnapTR;
        this.imageDrag.gcx = gpxTR;
        this.imageDrag.gcy = gpyTR;
        this.imageDrag.startAngle = Math.atan2(gdyTR, gdxTR) * 180 / Math.PI;
      }
    },
    onTextBoxDelete: function (box) {
      var page = this.active;
      if (!page || !box) return;
      var idx = page.textBoxes.indexOf(box);
      if (idx >= 0) page.textBoxes.splice(idx, 1);
      page.activeTextBoxId = null;
    },
    // (Inline body editing methods removed: the page body is a blank
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
      var page = store.activePage();
      if (!page) return;
      if (!Array.isArray(page.textBoxes)) page.textBoxes = [];
      // All text is in text boxes now, so drop a content-area text box
      // holding the lorem ipsum instead of writing the retired page.body.
      page.textBoxes.push({
        id: zfNewTextBoxId(),
        kind: '',
        role: '',
        html: zfSanitizeHtml('<p>' + text + '</p>'),
        x: 0.1,
        y: 0.85,
        w: 2.55,
        rot: 0,
        fontSize: 1.0,
        z: 5,
        hidden: false
      });
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
    // Wrapper: show the accessible confirm modal, then run the real clear
    // (in _doClearAllPageContent) only if the user confirms. zfConfirm is
    // non-blocking, so the actual mutation happens inside the callback.
    clearAllText: function () {
      var self = this;
      zfConfirm(
        'Clear all page content? This removes text, images, and text boxes from every page and cannot be undone.',
        function () { self._doClearAllPageContent(); },
        { title: 'Clear all page content?', confirmLabel: 'Clear all', danger: true }
      );
    },
    // The actual mutation: empty every page's body, images, and text boxes.
    // Extracted from the old confirm()-based clearAllText so the mutation
    // and the confirmation are separate concerns (and so the mutation can
    // be tested without opening a modal).
    _doClearAllPageContent: function () {
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
          // Inline heading/body are retired; pages are images + textBoxes.
          return {
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
    toggleDebugFlow: function () { this.debugFlow = !this.debugFlow; },
    // Map a stored color (hex OR named variant) to a hex the color input
    // can display. Named variants render via CSS classes; their hex here is
    // only for reflecting a representative swatch in the picker.
    namedColorToHex: function (c) {
      if (typeof c !== 'string' || !c) return '';
      if (c.charAt(0) === '#') return c;
      var map = {
        yellow: '#f4e08a', pink: '#f2a9b8', blue: '#a2d2ec', green: '#a9df94', orange: '#f3c184',
        kraft: '#cdb48c', white: '#f3efe6', news: '#e8e4d8', beige: '#e8dcc0', red: '#d7263d', black: '#1b1b1b'
      };
      return map[c] || '#1b1b1b';
    },
    // The color of the single active element as a display hex.
    activeColorHex: function () {
      var one = this.selectedTextBox || this.selectedImage;
      return this.namedColorToHex(one && one.color ? one.color : '') || '#1b1b1b';
    },
  };

  // Merge the extracted method groups (drawing, layers) into the main
  // table. Each extracted file publishes its methods on window.ZFEditor*.methods;
  // Object.assign keeps the same flat object the rest of the file expects,
  // and Vue's `this` binding is unaffected by which file a method came from.
  Object.assign(ZF_EDITOR_METHODS, window.ZFEditorDrawing.methods, window.ZFEditorLayers.methods);

  var ZineEditor = {
    data: function () {
      return {
        _groupScaleBase: null,
        _groupRotateBase: null,
        groupScalePct: 100,
        groupRotateDeg: 0,
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
        layerDragIndex: -1,
        layerDropIndex: -1,
        layersOpen: true,
        decorMenuOpen: false,
        // Drawing mode state. When true, a canvas overlays the mini-page and
        // captures pointer events so the user can freehand-draw. On commit
        // the canvas becomes a placed (movable) image element.
        drawingMode: false,
        drawColor: '#1b1b1b',
        drawSize: 6,
        // Active drawing tool: 'pen' | 'eraser' | 'calligraphy'.
        drawTool: 'pen',
        // Nib angle (degrees) for the calligraphy tool. The stroke is thick
        // when moving perpendicular to this angle and thin when moving along
        // it, giving the classic flat-nib thick/thin contrast.
        drawNibAngle: 45,

        // Id of the drawing element currently being re-edited (if any). The
        // template references this to hide that element while its pixels are
        // loaded onto the canvas. Declared here so it is reactive and defined
        // at first render.
        editDrawingId: null,
        drawUndoStack: [],
        // Refinement options. All default to the neutral, precise behavior
        // so nothing changes unless the user opts in.
        //   drawSmoothing: 0=off, 1=low, 2=medium, 3=high (quadratic curves)
        // Default is High (3): most drawings look better smoothed, and the
        // user can dial it down to Off for pixel-precise work.
        //   drawVelocity:  width varies with pointer speed (pen-like)
        //   drawOpacity:   0..1 stroke alpha
        drawSmoothing: 3,
        drawVelocity: false,
        drawOpacity: 1,
        drawOptionsOpen: false,
        // Right-click context menu state: open flag, cursor position, and the
        // target element (kind + id) so an action knows what to operate on.
        // Declared here so the template + methods can safely read it.
        ctxMenu: { open: false, x: 0, y: 0, kind: '', id: '' },
        // Overlap picker: shown on hover when 2+ elements stack under the
        // cursor, so the user can pick the one they mean by name.
        overlapPicker: { open: false, x: 0, y: 0, items: [] },
        // Element under the cursor (priority-aware) for the hover highlight.
        hoveredEl: { kind: '', id: '' },
        // Track the page id the current selection belongs to, so the active
        // watcher clears the selection only on a real page change.
        _selPageId: null,
        // Rubber-band marquee state (drag on empty page space to select).
        marquee: { active: false, startX: 0, startY: 0, x: 0, y: 0, w: 0, h: 0, moved: false },
        // Multi-selection set: array of { kind: 'image'|'textBox', id }.
        // The single active ids (activeImageId/activeTextBoxId) always reflect
        // the PRIMARY (last-selected) member, so existing single-element code
        // keeps working. Reset per page change.
        selSet: []
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
      // STRICT selection: only the box the user actually selected (by id),
      // or null. Unlike activeTextBox, this does NOT fall back to "last box",
      // so the floating Text panel can hide when nothing is selected.
      selectedTextBox: function () {
        var p = this.active;
        if (!p || !p.activeTextBoxId || !Array.isArray(p.textBoxes)) return null;
        for (var i = 0; i < p.textBoxes.length; i++) {
          if (p.textBoxes[i].id === p.activeTextBoxId) return p.textBoxes[i];
        }
        return null;
      },
      // STRICT image selection: only the image the user actually selected
      // (by activeImageId), or null. No 'last image' fallback.
      selectedImage: function () {
        var p = this.active;
        if (!p || !p.activeImageId || !Array.isArray(p.images)) return null;
        for (var i = 0; i < p.images.length; i++) {
          if (p.images[i].id === p.activeImageId) return p.images[i];
        }
        return null;
      },
      // Single source of truth for which floating panel to show:
      //   'text'  -- a text box is the primary selection
      //   'image' -- an image is the primary selection
      //   'mixed' -- the selection contains BOTH kinds
      //   'none'  -- nothing (or an empty selection) is selected
      // Templates gate on this. Today 'mixed' shows NO panel (property
      // panels are for homogeneous selections; the context menu still
      // handles structural ops on mixes). When a generic/common-properties
      // panel is added, 'mixed' can map to it here without touching the
      // templates or the selection logic.
      panelMode: function () {
        var s = this.selSet || [];
        var hasImg = false, hasText = false;
        for (var i = 0; i < s.length; i++) {
          if (s[i].kind === 'image') hasImg = true;
          else if (s[i].kind === 'textBox') hasText = true;
        }
        if (hasImg && hasText) return 'mixed';
        // Only report text/image when the PRIMARY selected object actually
        // resolves (non-null). During a resize the selection set and the
        // active id can disagree for a frame; if we said 'text'/'image' then,
        // the panel would render while selectedTextBox/selectedImage is null
        // and the template read .w on null (render crash). Gating on the
        // object keeps the gate and the bindings in lockstep.
        if (hasImg) return this.selectedImage ? 'image' : 'none';
        if (hasText) return this.selectedTextBox ? 'text' : 'none';
        return 'none';
      },
      // True when more than one element is selected (multi-select).
      isMultiSelected: function () {
        return (this.selSet || []).length > 1;
      },
      // The color shared by ALL selected elements, or '' if they differ
      // (or none set). Used to reflect the active color in the panel.
      sharedSelectionColor: function () {
        var page = this.active;
        if (!page) return '';
        var sel = this.selSet || [];
        if (!sel.length) {
          var one = this.selectedTextBox || this.selectedImage;
          return (one && one.color) ? one.color : '';
        }
        var seen = null, first = true;
        for (var i = 0; i < sel.length; i++) {
          var el = null;
          if (sel[i].kind === 'textBox') { var tb = page.textBoxes||[]; for (var a=0;a<tb.length;a++){ if(tb[a].id===sel[i].id){el=tb[a];break;} } }
          else { var im2 = page.images||[]; for (var b=0;b<im2.length;b++){ if(im2[b].id===sel[i].id){el=im2[b];break;} } }
          if (!el) continue;
          var c = el.color || '';
          if (first) { seen = c; first = false; }
          else if (c !== seen) { return ''; }
        }
        return seen || '';
      },
      // The font-family shared by ALL selected text boxes, or '' if mixed.
      sharedFontFamily: function () {
        var page = this.active;
        if (!page) return '';
        var sel = this.selSet || [];
        if (sel.length < 2) { return this.selectedTextBox ? (this.selectedTextBox.fontFamily || '') : ''; }
        var seen = null, first = true, n = 0;
        for (var i = 0; i < sel.length; i++) {
          if (sel[i].kind !== 'textBox') continue;
          var tb = page.textBoxes || [], el = null;
          for (var a = 0; a < tb.length; a++) { if (tb[a].id === sel[i].id) { el = tb[a]; break; } }
          if (!el) continue;
          n++;
          var f = el.fontFamily || '';
          if (first) { seen = f; first = false; } else if (f !== seen) { return ''; }
        }
        return (n > 1) ? (seen || '') : (seen || '');
      },
      // The font to SHOW in the select: the shared/selected explicit font if
      // any, else the closest option matching the theme's actual body font,
      // so a freshly loaded box shows the font it renders in (not "theme
      // default").
      effectiveFontFamily: function () {
        var explicit = this.sharedFontFamily;
        if (explicit) return explicit;
        var t = (window.ZFThemes && store.theme()) ? store.theme() : null;
        var body = (t && t.bodyFont) ? t.bodyFont.toLowerCase() : '';
        if (body.indexOf("times new roman") !== -1) return "'Times New Roman', Times, serif";
        if (body.indexOf("georgia") !== -1) return "Georgia, 'Times New Roman', serif";
        if (body.indexOf("public sans") !== -1 || body.indexOf("helvetica") !== -1) return "'Public Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif";
        if (body.indexOf("iowan") !== -1 || body.indexOf("palatino") !== -1) return "'Iowan Old Style', Palatino, Georgia, serif";
        return '';
      },
      // Union bounding box of the multi-selection, as page-relative
      // percentages, for rendering ONE group selection box. Derived from
      // the same geometry _groupTransformSnapshot uses.
      groupBoxStyle: function () {
        var g = this._groupTransformSnapshot();
        var m = this.activeModel;
        if (!g || !m) return null;
        var margin = store.modelMarginIn();
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        g.items.forEach(function (it) {
          if (it.cx - it.w/2 < minX) minX = it.cx - it.w/2;
          if (it.cy - it.h/2 < minY) minY = it.cy - it.h/2;
          if (it.cx + it.w/2 > maxX) maxX = it.cx + it.w/2;
          if (it.cy + it.h/2 > maxY) maxY = it.cy + it.h/2;
        });
        // cx/cy in _groupTransformSnapshot are page inches INCLUDING margin;
        // subtract margin to get back to the element coordinate space, then
        // convert to % of page.
        var leftIn = minX - margin, topIn = minY - margin;
        var wIn = maxX - minX, hIn = maxY - minY;
        var pw = m.page.width, ph = m.page.height;
        return {
          left: (leftIn / pw * 100) + '%',
          top: (topIn / ph * 100) + '%',
          width: (wIn / pw * 100) + '%',
          height: (hIn / ph * 100) + '%'
        };
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
      // All page text now lives in text boxes, so the budget counters
      // concatenate every text box's HTML on the active page and count
      // that. (Previously they read the retired inline page.body.)
      activeTextHtml: function () {
        var p = this.active;
        if (!p || !Array.isArray(p.textBoxes)) return '';
        var parts = [];
        for (var i = 0; i < p.textBoxes.length; i++) {
          if (p.textBoxes[i] && p.textBoxes[i].html) parts.push(p.textBoxes[i].html);
        }
        return parts.join(' ');
      },
      wordCount: function () {
        if (!window.ZFModels) return 0;
        return window.ZFModels.countWords(zfHtmlToText(this.activeTextHtml));
      },
      lineCount: function () {
        if (!window.ZFModels) return 0;
        return window.ZFModels.countLines(zfHtmlToText(this.activeTextHtml));
      },
      charCount: function () {
        return zfHtmlToText(this.activeTextHtml).length;
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
          "--zf-page-margin": store.modelMarginIn() + "in"
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
      this._onMouseUp = function (evt) { self.onImageMouseUp(evt); };
      window.addEventListener("mousemove", this._onMouseMove);
      window.addEventListener("mouseup", this._onMouseUp);

      // Keep the floating text panel anchored to the rail on resize/scroll.
      this._onPanelReflow = function () { self.positionTextPanel(); };
      window.addEventListener("resize", this._onPanelReflow);
      window.addEventListener("scroll", this._onPanelReflow, true);
      this.$nextTick(function () { self.positionTextPanel(); self.updateGroupBox(); });

      // Auto-commit the drawing when the user clicks outside the canvas and
      // the draw panel, so wandering off never loses a drawing.
      this._onDrawDocDown = function (evt) { self.onDrawDocPointerDown(evt); };
      document.addEventListener("pointerdown", this._onDrawDocDown, true);
      // Hover detection for the overlap picker + hover highlight. Tracked at
      // the DOCUMENT level (not just the mini-page) so that moving the cursor
      // from the page ONTO the picker -- which is a fixed element outside the
      // page -- does not fire a page mouseleave that hides the picker before
      // the user can reach it.
      this._onHoverPicker = function (evt) {
        // Only react when the pointer is over the page OR over the picker.
        var overPicker = self._overPicker(evt.clientX, evt.clientY);
        var miniEl = self.$refs.miniPage;
        var overPage = miniEl ? (function () {
          var r = miniEl.getBoundingClientRect();
          return evt.clientX >= r.left && evt.clientX <= r.right &&
                 evt.clientY >= r.top && evt.clientY <= r.bottom;
        })() : false;
        if (overPage || overPicker) {
          self.onEditorHoverForPicker(evt);
        } else {
          self._setHoveredElement(null);
          self._hideOverlapPicker();
        }
      };
      document.addEventListener("mousemove", this._onHoverPicker);
      // Dismiss the context menu on any outside click / Esc / scroll.
      this._onCtxDismiss = function (evt) {
        if (!self.ctxMenu.open) return;
        var t = evt.target;
        var menu = self.$el ? self.$el.querySelector('.zf-ctx-menu') : null;
        if (menu && menu.contains(t)) return;
        self.closeContextMenu();
      };
      document.addEventListener("pointerdown", this._onCtxDismiss, true);
      this._onCtxKey = function (evt) { if (evt.key === 'Escape') self.closeContextMenu(); };
      document.addEventListener("keydown", this._onCtxKey);
      this._onCtxScroll = function () { self.closeContextMenu(); };
      window.addEventListener("scroll", this._onCtxScroll, true);
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
        },
        selectAll: function () { self.selectAllOnPage(); }
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
      // When a text box becomes selected/deselected, the floating panel is
      // added/removed. Reposition on the next tick so it measures the real rail.
      selectedTextBox: function (tb) {
        var self = this;
        this.$nextTick(function () { self.positionTextPanel(); self.updateGroupBox(); });
      },
      selectedImage: function (im) {
        var self = this;
        this.$nextTick(function () { self.positionTextPanel(); self.updateGroupBox(); });
      },
      panelMode: function (m) {
        var self = this;
        // New selection -> reset group scale/rotate bases so each fresh group
        // starts at 100% / 0deg.
        this._groupScaleBase = null;
        this._groupRotateBase = null;
        this.groupScalePct = 100;
        this.groupRotateDeg = 0;
        this.$nextTick(function () { self.positionTextPanel(); self.updateGroupBox(); });
      },
      // When the active page changes (or its body is replaced by undo),
      // re-sync the contenteditable so it shows the correct content.
      active: {
        handler: function (newActive) {
          // Clear the multi-selection ONLY when the PAGE actually changes.
          // `active` is a computed that re-emits whenever store.pages mutates
          // (e.g. a move), so clearing on every emit
          // collapsed a multi-selection mid-move. Track the page id.
          var newId = newActive && newActive.id;
          if (newId !== this._selPageId) {
            this._selPageId = newId;
            this.selSet = [];
          }
          this.syncTextBoxDom();
        },
        deep: false
      },

      // While RE-EDITING a drawing, changing a property control applies to
      // the whole drawing (all its strokes), re-rendering the canvas live.
      // For a brand-new drawing these controls only set defaults for the
      // next stroke, so nothing needs to happen there.
      drawColor: function () { this._applySettingsToStrokes(); },
      drawOpacity: function () { this._applySettingsToStrokes(); },
      drawSize: function () { this._applySettingsToStrokes(); },
      drawSmoothing: function () { this._applySettingsToStrokes(); },
      drawNibAngle: function () { this._applySettingsToStrokes(); }
    },
    beforeUnmount: function () {
      window.removeEventListener("mousemove", this._onMouseMove);
      window.removeEventListener("mouseup", this._onMouseUp);
      if (this._onPanelReflow) {
        window.removeEventListener("resize", this._onPanelReflow);
        window.removeEventListener("scroll", this._onPanelReflow, true);
      }

      if (this._onDrawDocDown) document.removeEventListener("pointerdown", this._onDrawDocDown, true);
      if (this._onHoverPicker) document.removeEventListener("mousemove", this._onHoverPicker);
      if (this._pickerTimer) clearTimeout(this._pickerTimer);
      if (this._onCtxDismiss) document.removeEventListener("pointerdown", this._onCtxDismiss, true);
      if (this._onCtxKey) document.removeEventListener("keydown", this._onCtxKey);
      if (this._onCtxScroll) window.removeEventListener("scroll", this._onCtxScroll, true);
      window.ZFEditorActions = null;
    },
    updated: function () {
      this.syncTextBoxDom();
      this.positionTextPanel();
    },
    methods: Object.assign({}, ZF_EDITOR_METHODS, {
      // Anchor the floating text panel to the rail's actual box: its top
      // matches the rail's top, and its left sits one grid-gap (20px) to the
      // right of the rail -- the same gap that separates the rail from the
      // canvas. Runs on show, resize, and scroll so it stays aligned.
      // Position whichever floating panel is currently visible (text or
      // image) against the rail: top aligned to the rail top, left one grid
      // gap to its right (flips to the left if it would run off-screen).
      // Only one panel is ever visible at a time, so we pick the present ref.
      positionTextPanel: function () {
        var panel = this.$refs.floatPanelEl || this.$refs.textPanelEl || this.$refs.imagePanelEl;
        var rail = this.$refs.railEl;
        if (!panel || !rail) return;
        var rr = rail.getBoundingClientRect();
        var gap = 20; // .zf-editor gap: 1.25rem at 16px root
        var panelW = panel.offsetWidth || 260;
        var top = rr.top;
        var left = rr.right + gap;
        if (left + panelW > window.innerWidth - 8) {
          left = rr.left - gap - panelW;
        }
        panel.style.top = Math.max(8, top) + 'px';
        panel.style.left = Math.max(8, left) + 'px';
      },
      // Position the group selection box to exactly wrap the multi-selection.
      // The box lives in .zf-canvas-wrap (unclipped), so its px are relative
      // to that wrap. We convert the union rect (page inches) to px using the
      // page's rendered scale, then offset by the page's position in the wrap.
      // This lets the box (and later its handles) extend past the page edge.
      updateGroupBox: function () {
        var boxEl = this.$refs.groupBoxEl;
        if (!boxEl) return;
        // Clear any rigid-rotation left over from a prior rotate drag so a
        // freshly computed (axis-aligned) box is not shown pre-rotated.
        boxEl.style.transform = "";
        if (!this.isMultiSelected) return;
        var g = this._groupTransformSnapshot();
        var m = this.activeModel;
        var pageEl = this.$refs.miniPage;
        var wrapEl = boxEl.parentNode;
        if (!g || !m || !pageEl || !wrapEl) return;
        // Measure each selected element's ACTUAL rendered rect and take the
        // true union. This accounts for rotation, real icon size, and text
        // box height -- so every element sits fully INSIDE the group box
        // (the snapshot's approximate w/h could under-size the box).
        var wrapRect = wrapEl.getBoundingClientRect();
        var pageEl2 = this.$refs.miniPage;
        var sel = this.selSet || [];
        var uMinX = Infinity, uMinY = Infinity, uMaxX = -Infinity, uMaxY = -Infinity;
        var found = 0;
        for (var si = 0; si < sel.length; si++) {
          var s = sel[si];
          var node = null;
          if (s.kind === 'image') node = pageEl2.querySelector('[data-zf-img-id="' + s.id + '"]');
          else node = pageEl2.querySelector('[data-zf-text-id="' + s.id + '"]');
          if (!node) continue;
          var nr = node.getBoundingClientRect();
          if (nr.width < 0.5 && nr.height < 0.5) continue;
          var lx = nr.left - wrapRect.left, ty = nr.top - wrapRect.top;
          var rx = lx + nr.width, byy = ty + nr.height;
          if (lx < uMinX) uMinX = lx;
          if (ty < uMinY) uMinY = ty;
          if (rx > uMaxX) uMaxX = rx;
          if (byy > uMaxY) uMaxY = byy;
          found++;
        }
        if (!found) return;
        var bx = uMinX, by = uMinY, bw = (uMaxX - uMinX), bh = (uMaxY - uMinY);
        // Clamp so the box's edges (and the ~6px handle overhang) always sit
        // inside the visible canvas workspace -- handles stay reachable even
        // when the selection overhangs the page. The box may not perfectly
        // wrap an extreme overhang, but every control stays grabbable.
        var inset = 8;
        var wrapW = wrapEl.clientWidth;
        var wrapH = wrapEl.clientHeight;
        var minLeft = inset, maxRight = wrapW - inset;
        var minTop = inset, maxBottom = wrapH - inset;
        // Clamp width first, then left, so right edge stays within maxRight.
        if (bx < minLeft) { bw -= (minLeft - bx); bx = minLeft; }
        if (by < minTop) { bh -= (minTop - by); by = minTop; }
        if (bx + bw > maxRight) { bw = maxRight - bx; }
        if (by + bh > maxBottom) { bh = maxBottom - by; }
        if (bw < 10) bw = 10;
        if (bh < 10) bh = 10;
        boxEl.style.left = bx + 'px';
        boxEl.style.top = by + 'px';
        boxEl.style.width = bw + 'px';
        boxEl.style.height = bh + 'px';
      },
      // Start a GROUP resize drag from a corner handle on the group box.
      // Pivot = current group-box center (screen px). No imgId -> the early
      // group branch in onImageMouseMove handles the transform.
      // Drag the group box itself to MOVE the whole selection. Mirrors the
      // element move (mode:'move' + bases) but with no single imgId, so the
      // multi-move branch in onImageMouseMove shifts every selected element.
      onGroupMoveStart: function (evt) {
        evt.stopPropagation(); evt.preventDefault();
        var bases = this._selectionBases();
        if (!bases || !bases.length) return;
        this.imageDrag = {
          mode: 'move',
          group: true,
          startX: evt.clientX, startY: evt.clientY,
          moved: false,
          bases: bases
        };
      },
      onGroupResizeStart: function (evt) {
        evt.stopPropagation(); evt.preventDefault();
        var boxEl = this.$refs.groupBoxEl;
        var g = this._groupTransformSnapshot();
        if (!boxEl || !g) return;
        var r = boxEl.getBoundingClientRect();
        var gcx = r.left + r.width / 2;
        var gcy = r.top + r.height / 2;
        var dx = evt.clientX - gcx, dy = evt.clientY - gcy;
        this.imageDrag = {
          mode: 'resize',
          group: g,
          gcx: gcx, gcy: gcy,
          startDist: Math.sqrt(dx * dx + dy * dy) || 1,
          startX: evt.clientX, startY: evt.clientY,
          moved: false
        };
      },
      // Start a GROUP rotate drag from the rotate handle.
      onGroupRotateStart: function (evt) {
        evt.stopPropagation(); evt.preventDefault();
        var boxEl = this.$refs.groupBoxEl;
        var g = this._groupTransformSnapshot();
        if (!boxEl || !g) return;
        var r = boxEl.getBoundingClientRect();
        var gcx = r.left + r.width / 2;
        var gcy = r.top + r.height / 2;
        var dx = evt.clientX - gcx, dy = evt.clientY - gcy;
        this.imageDrag = {
          mode: 'rotate',
          group: g,
          gcx: gcx, gcy: gcy,
          startAngle: Math.atan2(dy, dx) * 180 / Math.PI,
          startX: evt.clientX, startY: evt.clientY,
          moved: false
        };
      },
      // Wrapper so the template can call this via the component instance
      // (plain script functions like zfLoadTemplate are not reachable
      // from Vue templates).
      loadTemplate: function (file) { return window.zfLoadTemplate(file); }
    }),
    template: "#zine-editor-template"
  };

  window.ZineEditor = ZineEditor;

  // TEMP DEBUG: ZFDebugTB() logs the selected text box geometry + DOM rect.
  window.ZFDebugTB = function () {
    var app = document.querySelector("#app");
    var s = window.ZF_STORE;
    if (!s) return "no store";
    var p = s.activePage();
    if (!p || !p.activeTextBoxId) return "no active text box";
    var box = null;
    (p.textBoxes||[]).forEach(function(t){ if(t.id===p.activeTextBoxId) box=t; });
    if (!box) return "box not found";
    var domEl = document.querySelector('[data-zf-text-id="' + box.id + '"]');
    var pageEl = document.querySelector(".zf-page.zf-mini-page");
    var pr = pageEl ? pageEl.getBoundingClientRect() : null;
    var dr = domEl ? domEl.getBoundingClientRect() : null;
    return {
      stored: { x: box.x, y: box.y, w: box.w, h: box.h, autoWidth: box.autoWidth, fontPt: box.fontPt, fontSize: box.fontSize, rot: box.rot },
      pageRect: pr ? { left: Math.round(pr.left), top: Math.round(pr.top), w: Math.round(pr.width), h: Math.round(pr.height) } : null,
      domRect: dr ? { left: Math.round(dr.left), top: Math.round(dr.top), w: Math.round(dr.width), h: Math.round(dr.height) } : null,
      relToPage: (pr && dr) ? { left: Math.round(dr.left - pr.left), top: Math.round(dr.top - pr.top), w: Math.round(dr.width), h: Math.round(dr.height) } : null
    };
  };


  // TEMP DEBUG: ZFDebugImages() dumps every image/icon on the active page.
  window.ZFDebugImages = function () {
    var s = window.ZF_STORE;
    if (!s) return "no store";
    var p = s.activePage();
    if (!p) return "no page";
    return (p.images || []).map(function (im) {
      return { id: im.id, kind: im.kind, src: (im.src||"").slice(0,20), x: im.x, y: im.y, w: im.w, h: im.h, z: im.z, hidden: !!im.hidden, wrap: im.wrap, placeholder: !!im.placeholder };
    });
  };


  // TEMP DEBUG: compact one-line-per-image summary (no truncation).
  window.ZFDebugImages = function () {
    var s = window.ZF_STORE; if (!s) return "no store";
    var p = s.activePage(); if (!p) return "no page";
    return (p.images || []).map(function (im) {
      return [im.kind, (im.src||"").slice(0,22), "x=" + Math.round(im.x||0), "y=" + Math.round(im.y||0), "w=" + (im.w), "h=" + (im.h), "z=" + (im.z), "hid=" + (!!im.hidden), "wrap=" + (im.wrap||"")].join(" | ");
    }).join("\n");
  };


  // TEMP DEBUG: all elements on the active page with geometry + z.
  window.ZFDebugElements = function () {
    var s = window.ZF_STORE; if (!s) return "no store";
    var p = s.activePage(); if (!p) return "no page";
    var lines = [];
    (p.images || []).forEach(function (im) {
      lines.push("IMG " + im.kind + " id=" + im.id + " x=" + Math.round(im.x||0) + " y=" + Math.round(im.y||0) + " w=" + im.w + " h=" + im.h + " z=" + im.z + " hid=" + (!!im.hidden));
    });
    (p.textBoxes || []).forEach(function (tb) {
      lines.push("TB  id=" + tb.id + " x=" + Math.round(tb.x||0) + " y=" + Math.round(tb.y||0) + " w=" + tb.w + " h=" + tb.h + " z=" + tb.z + " auto=" + (!!tb.autoWidth) + " hid=" + (!!tb.hidden));
    });
    return lines.join("\n");
  };


  // TEMP DEBUG: live DOM rects of the active page text boxes + icons,
  // relative to the page, so we see what actually covers what.
  window.ZFDebugRects = function () {
    var s = window.ZF_STORE; if (!s) return "no store";
    var p = s.activePage(); if (!p) return "no page";
    var pageEl = document.querySelector(".zf-page.zf-mini-page");
    if (!pageEl) return "no page el";
    var pr = pageEl.getBoundingClientRect();
    function rel(el) { var r = el.getBoundingClientRect(); return { l: Math.round(r.left-pr.left), t: Math.round(r.top-pr.top), w: Math.round(r.width), h: Math.round(r.height) }; }
    var out = [];
    (p.textBoxes||[]).forEach(function(tb){
      var d = document.querySelector('[data-zf-text-id="' + tb.id + '"]');
      out.push("TB z=" + tb.z + " " + (d ? JSON.stringify(rel(d)) : "NO-DOM"));
    });
    (p.images||[]).forEach(function(im){
      var d = document.querySelector('[data-zf-img-id="' + im.id + '"]');
      out.push("IMG " + im.kind + " z=" + im.z + " " + (d ? JSON.stringify(rel(d)) : "NO-DOM"));
    });
    out.push("PAGE w=" + Math.round(pr.width) + " h=" + Math.round(pr.height));
    return out.join("\n");
  };

})();