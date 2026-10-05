// zf-sheet.js -- the sheet (Print) view: printable imposition of pages onto
// physical paper, with fold/cut guides. Extracted from the inline <script>
// in index.html. Classic script; reads the shared store from window.ZF_STORE
// (set by zf-store.js, which must load first). Uses zfElementStyle /
// zfTextBoxStyle (util.js) and window.ZFModels / window.ZFThemes. Also
// depends on zfBuildSlot, which is defined here.
(function () {
  'use strict';

  var store = window.ZF_STORE;

  // Build one sheet slot's render data: rect, page scale, safe edges, and
  // the page content. Shared by the front (slots) and back (slotsBack) of a
  // sheet so two-sided models use identical logic.
  function zfBuildSlot(m, slot, pages) {
    var rect = window.ZFModels.slotRect(m, slot);
    var page = pages[slot.page - 1];
    var unit = m.page.unit || 'in';
    var pageInchesW = unit === 'mm' ? m.page.width / 25.4 : m.page.width;
    var physicalCssW = pageInchesW * 96;
    var sheetHeight = 560;
    var aspect = m.paper.width / m.paper.height;
    var sheetWidth = sheetHeight * aspect;
    var grid = window.ZFModels.gridSize(m);
    var slotRenderedW = sheetWidth / grid.cols;
    var slotScale = slotRenderedW / physicalCssW;
    var touchesPaperTop = (slot.row === 0);
    var touchesPaperBottom = (slot.row === grid.rows - 1);
    var touchesPaperLeft = (slot.col === 0);
    var touchesPaperRight = (slot.col === grid.cols - 1);
    var safeEdges = { top: false, right: false, bottom: false, left: false };
    var rot = ((slot.rotation % 360) + 360) % 360;
    if (rot === 0) {
      safeEdges.top = touchesPaperTop; safeEdges.right = touchesPaperRight;
      safeEdges.bottom = touchesPaperBottom; safeEdges.left = touchesPaperLeft;
    } else if (rot === 180) {
      safeEdges.top = touchesPaperBottom; safeEdges.right = touchesPaperLeft;
      safeEdges.bottom = touchesPaperTop; safeEdges.left = touchesPaperRight;
    } else if (rot === 90) {
      safeEdges.top = touchesPaperLeft; safeEdges.right = touchesPaperTop;
      safeEdges.bottom = touchesPaperRight; safeEdges.left = touchesPaperBottom;
    } else if (rot === 270) {
      safeEdges.top = touchesPaperRight; safeEdges.right = touchesPaperBottom;
      safeEdges.bottom = touchesPaperLeft; safeEdges.left = touchesPaperTop;
    }
    return {
      key: 's-' + slot.page,
      pageNum: slot.page,
      rotation: slot.rotation,
      rect: rect,
      page: page,
      isEmpty: !page || (
        !page.heading && !page.body && !page.image &&
        !(page.images && page.images.length) &&
        !(page.textBoxes && page.textBoxes.length)
      ),
      pageScale: slotScale,
      pageMargin: store.marginIn + 'in',
      safeEdges: safeEdges,
      bodyHtml: page ? (page.body || '') : ''
    };
  }

  window.zfBuildSlot = zfBuildSlot;

  var ZineSheet = {
    data: function () { return { store: store, showPageNumbers: true }; },
    watch: {
      "store.view": function (v) {
        if (v === "sheet") {
          var self = this;
          this.$nextTick(function () { self.sheetInjectFlows(); });
        }
      },
      "store.pages": {
        deep: true,
        handler: function () {
          var self = this;
          this.$nextTick(function () { self.sheetInjectFlows(); });
        }
      }
    },
    computed: {
      model: function () { return store.model(); },
      themeStyle: function () {
        if (!window.ZFThemes || !store.theme()) return {};
        return window.ZFThemes.pageStyle(store.theme());
      },
      sheetStyle: function () {
        var m = this.model;
        if (!m) return {};
        var aspect = m.paper.width / m.paper.height;
        var h = 560;
        var w = Math.round(h * aspect);
        return { width: w + 'px', height: h + 'px' };
      },
      paperCss: function () {
        var m = this.model;
        if (!m) return '';
        // NATIVE ORIENTATION -- NO ROTATION.
        //
        // The sheet prints at the model's OWN paper size and orientation:
        // a landscape model (mini-8, mini-16) gets a landscape @page and a
        // landscape .zf-sheet, and the imposition slots sit where they
        // naturally are. A portrait model (single-page) gets a portrait
        // @page. No transform, no portrait swap.
        //
        // Why: the previous approach rotated a landscape imposition 90deg
        // into a portrait page. That depended on the transform surviving the
        // browser's print snapshot, which it did NOT on real printers --
        // content printed unrotated in the top-left corner. With no rotation
        // there is nothing to drop. Modern printers print landscape natively.
        //
        // w and h already carry their unit ("11in", "8.5in"), so they are
        // used directly. The @page size, the .zf-sheet size, and the inner
        // all use the model's natural w x h.
        var unit = m.paper.unit === 'in' ? 'in' : 'mm';
        var w = m.paper.width + unit;
        var h = m.paper.height + unit;
        return '@page { size: ' + w + ' ' + h + '; margin: 0; }\n' +
               '@media print {\n' +
               '  html, body { margin: 0; padding: 0; background: #ffffff; }\n' +
               // Each .zf-sheet is one printed side. Sized to the model's
               // natural paper dimensions. The page break between sides is
               // applied via .zf-sheet-side in app.css.
               '  .zf-sheet-side {\n' +
               '    display: block !important;\n' +
               '    margin: 0 !important;\n' +
               '    padding: 0 !important;\n' +
               '    position: relative !important;\n' +
               '  }\n' +
               '  .zf-sheet {\n' +
               '    width: ' + w + ' !important;\n' +
               '    height: ' + h + ' !important;\n' +
               '    margin: 0 !important;\n' +
               '    padding: 0 !important;\n' +
               '    overflow: hidden !important;\n' +
               '    position: relative !important;\n' +
               '  }\n' +
               // No rotation: the inner fills the sheet 1:1. transform is
               // explicitly reset so no leftover transform applies.
               '  .zf-sheet-inner {\n' +
               '    width: 100% !important;\n' +
               '    height: 100% !important;\n' +
               '    position: absolute !important;\n' +
               '    top: 0 !important;\n' +
               '    left: 0 !important;\n' +
               '    transform: none !important;\n' +
               '  }\n' +
               '}\n';
      },
      slots: function () {
        var m = this.model;
        if (!m || !window.ZFModels) return [];
        var pages = store.pages;
        return m.slots.map(function (slot) { return zfBuildSlot(m, slot, pages); });
      },
      slotsBack: function () {
        var m = this.model;
        if (!m || !window.ZFModels || !Array.isArray(m.slotsBack)) return [];
        var pages = store.pages;
        return m.slotsBack.map(function (slot) { return zfBuildSlot(m, slot, pages); });
      },
      hasBack: function () {
        return this.slotsBack.length > 0;
      },
      sheetSides: function () {
        var sides = [{ label: 'Front', slots: this.slots }];
        if (this.hasBack) sides.push({ label: 'Back', slots: this.slotsBack });
        return sides;
      }
    },
    methods: {
      slotBlockImageStyleFor: function (img, s) {
        var m = this.model;
        if (!m || !img || !img.src) return {};
        var base = zfElementStyle(img, m.page.width, m.page.height, store.marginIn, { block: true });
        base.borderRadius = "calc(0.02in * var(--zf-page-scale, 1))";
        return base;
      },
      slotFreeImageStyleFor: function (img, s) {
        var m = this.model;
        if (!m || !img) return {};
        var decorKinds = { tape: 1, scrap: 1, sticky: 1, sticker: 1 };
        if (!img.src && !decorKinds[img.kind]) return {};
        return zfElementStyle(img, m.page.width, m.page.height, store.marginIn, {});
      },
      stickyStyle: function (img, base) {
        var out = Object.assign({}, base || {});
        if (img && typeof img.color === 'string' && img.color.charAt(0) === '#') {
          out['--zf-sticky-bg'] = img.color;
        }
        return out;
      },
      stickerStyle: function (img, base) {
        var out = Object.assign({}, base || {});
        if (img && typeof img.color === 'string' && img.color.charAt(0) === '#') {
          out['--zf-sticker-bg'] = img.color;
        }
        return out;
      },
      slotTextBoxStyleFor: function (box, s) {
        var m = this.model;
        if (!m || !box) return {};
        return zfTextBoxStyle(box, m.page.width, m.page.height, store.marginIn);
      },
      sheetInjectFlows: function () {
        var self = this;
        this.$nextTick(function () {
          self._attemptSheetInject(0);
        });
      },
      _attemptSheetInject: function (attempt) {
        var self = this;
        if (attempt > 20) return;
        if (store.view !== "sheet") return;
        var root = self.$el;
        if (!root) { self._schedSheetRetry(attempt); return; }
        var bodies = root.querySelectorAll('.zf-mini-body[data-slot-page]');
        if (!bodies.length) { self._schedSheetRetry(attempt); return; }
        var firstRect = bodies[0].getBoundingClientRect();
        if (firstRect.width < 20 || firstRect.height < 20) {
          self._schedSheetRetry(attempt);
          return;
        }
        for (var i = 0; i < bodies.length; i++) {
          var el = bodies[i];
          var pageNum = Number(el.getAttribute('data-slot-page'));
          var page = store.pages[pageNum - 1];
          if (!page) continue;
          var stale = el.querySelectorAll('[data-zf-spacer="1"], [data-zf-flow-img="1"]');
          for (var k = 0; k < stale.length; k++) stale[k].remove();
          var flowImgs = [];
          if (Array.isArray(page.images) && page.images.length) {
            for (var fi = 0; fi < page.images.length; fi++) {
              if (page.images[fi].wrap === 'flow') flowImgs.push(page.images[fi]);
            }
          } else if (page.image && page.imageWrap === 'flow') {
            flowImgs.push({ src: page.image, x: page.imageX || 0, y: page.imageY || 0, w: page.imageW || 1.5, rot: page.imageRot || 0 });
          }
          if (!flowImgs.length) continue;
          var m = self.model;
          if (!m) continue;
          var slotEl = el.closest('.zf-mini-page');
          var slotScale = 1;
          if (slotEl) {
            var styleScale = slotEl.style.getPropertyValue('--zf-page-scale');
            slotScale = parseFloat(styleScale) || 1;
          }
          var px = 96 * slotScale;
          var rect = el.getBoundingClientRect();
          if (rect.width < 20 || rect.height < 20) continue;
          var bodyWIn = rect.width / px;
          var bodyHIn = rect.height / px;
          for (var fk = 0; fk < flowImgs.length; fk++) {
            window.zfInjectFlow(el, flowImgs[fk], px, bodyWIn, bodyHIn);
          }
        }
      },
      _schedSheetRetry: function (attempt) {
        var self = this;
        setTimeout(function () { self._attemptSheetInject(attempt + 1); }, 80);
      },
      slotMiniPageStyle: function (s) {
        var scale = (s && s.pageScale) ? s.pageScale : 1;
        var margin = store.marginIn;
        var safe = store.safeEdgeIn;
        var se = (s && s.safeEdges) ? s.safeEdges : {};
        var top = margin + (se.top ? safe : 0);
        var right = margin + (se.right ? safe : 0);
        var bottom = margin + (se.bottom ? safe : 0);
        var left = margin + (se.left ? safe : 0);
        return {
          transform: 'rotate(' + s.rotation + 'deg)',
          width: '100%',
          height: '100%',
          '--zf-page-scale': s.pageScale,
          '--zf-page-margin': s.pageMargin,
          paddingTop: 'calc(' + top + 'in * var(--zf-page-scale, 1))',
          paddingRight: 'calc(' + right + 'in * var(--zf-page-scale, 1))',
          paddingBottom: 'calc(' + bottom + 'in * var(--zf-page-scale, 1))',
          paddingLeft: 'calc(' + left + 'in * var(--zf-page-scale, 1))'
        };
      },
      printSheet: function () { window.print(); },
      installPaperCss: function () {
        try {
          var id = 'zf-paper-css';
          var el = document.getElementById(id);
          if (!el) {
            el = document.createElement('style');
            el.id = id;
            document.head.appendChild(el);
          }
          var css = this.paperCss;
          if (css) el.textContent = css;
        } catch (e) {}
      }
    },
    mounted: function () {
      this.installPaperCss();
      this.sheetInjectFlows();
      var self = this;
      this._onBeforePrint = function () {
        try {
          self.installPaperCss();
          self.sheetInjectFlows();
        } catch (e) {}
      };
      window.addEventListener('beforeprint', this._onBeforePrint);
    },
    beforeUnmount: function () {
      if (this._onBeforePrint) {
        window.removeEventListener('beforeprint', this._onBeforePrint);
        this._onBeforePrint = null;
      }
    },
    updated: function () {
      this.installPaperCss();
      this.sheetInjectFlows();
    },
    template:
      '<div class="zf-sheet-view">' +
        '<div class="zf-no-print" style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap;margin-bottom:1rem;">' +
          '<div>' +
            '<h2 style="margin:0;font-family:var(--zf-serif);">{{ model ? model.label : \'No model\' }}</h2>' +
            '<div class="zf-muted">Printable sheet preview. Toggle fold and cut guides below.</div>' +
            '<div v-if="model && model.flip" class="zf-flip-note" style="margin-top:0.35rem;font-size:0.85rem;">' +
              '<span class="zf-flip-badge">2-sided</span> ' +
              'Print double-sided, flip on the <b>{{ model.flip === \'short\' ? \'short\' : \'long\' }} edge</b>.' +
            '</div>' +
            '<div v-if="model && model.binding === \'staple\'" class="zf-flip-note" style="margin-top:0.2rem;font-size:0.85rem;">' +
              '<span class="zf-flip-badge">staple</span> ' +
              'Two staple marks are printed on the spine. Staple there after folding.' +
            '</div>' +
          '</div>' +
          '<div class="zf-header-actions" style="gap:0.5rem;">' +
            '<label class="zf-muted" style="display:flex;align-items:center;gap:0.35rem;font-size:0.85rem;cursor:pointer;">' +
              '<input type="checkbox" v-model="showPageNumbers" /> page numbers' +
            '</label>' +
            '<label class="zf-muted" style="display:flex;align-items:center;gap:0.35rem;font-size:0.85rem;cursor:pointer;">' +
              '<input type="checkbox" v-model="store.showFoldLines" /> fold lines' +
            '</label>' +
            '<label class="zf-muted" style="display:flex;align-items:center;gap:0.35rem;font-size:0.85rem;cursor:pointer;">' +
              '<input type="checkbox" v-model="store.showCutLines" /> cut lines' +
            '</label>' +
            '<button class="zf-btn zf-btn-primary" @click="printSheet">Print this sheet</button>' +
          '</div>' +
        '</div>' +
        '<div v-for="(side, si) in sheetSides" :key="\'side-\' + si" class="zf-sheet-side">' +
          '<div v-if="sheetSides.length > 1" class="zf-sheet-side-label zf-no-print">{{ side.label }}</div>' +
        '<div class="zf-sheet" :style="sheetStyle">' +
          '<div class="zf-sheet-inner">' +
            '<div class="zf-sheet-guides">' +
              '<template v-for="(g, gi) in (model && model.guides ? model.guides : [])" :key="\'g-\' + gi">' +
                '<div v-if="g.type === \'fold\' && store.showFoldLines" ' +
                  ':class="g.axis === \'v\' ? \'zf-fold-v\' : \'zf-fold-h\'" ' +
                  ':style="(g.axis === \'v\' ? \'left:\' : \'top:\') + g.pos + \'%\'"></div>' +
                '<div v-else-if="g.type === \'cut\' && store.showCutLines" ' +
                  ':class="g.axis === \'v\' ? \'zf-cut-v\' : \'zf-cut-h\'" ' +
                  ':style="(g.axis === \'v\' ? \'top:\' + (g.from||0) + \'%;bottom:\' + (100-(g.to||100)) + \'%;left:\' : \'left:\' + (g.from||0) + \'%;right:\' + (100-(g.to||100)) + \'%;top:\') + g.pos + \'%\'"></div>' +
              '</template>' +
              '<template v-if="model && model.binding === \'staple\'">' +
                '<div class="zf-staple-mark zf-staple-mark-1" aria-hidden="true"></div>' +
                '<div class="zf-staple-mark zf-staple-mark-2" aria-hidden="true"></div>' +
              '</template>' +
            '</div>' +
            '<div v-for="s in side.slots" :key="s.key" class="zf-slot" :style="Object.assign({}, s.rect, themeStyle)">' +
            '<div class="zf-mini-page zf-slot-rot" :style="slotMiniPageStyle(s)">' +
              '<span v-if="showPageNumbers && s.pageNum > 1" class="zf-slot-page-num">{{ s.pageNum - 1 }}</span>' +
              '<template v-if="!s.isEmpty">' +
                '<template v-for="img in (s.page.images || [])" :key="\'sl-blk-\' + img.id">' +
                  '<img v-if="img.wrap === \'block\' && img.kind !== \'icon\'" ' +
                    'class="zf-mini-image zf-block-image" :src="img.src" alt="" ' +
                    ':style="slotBlockImageStyleFor(img, s)" />' +
                  '<iconify-icon v-else-if="img.wrap === \'block\' && img.kind === \'icon\'" ' +
                    'class="zf-mini-image zf-block-image zf-block-icon" ' +
                    ':icon="img.src" ' +
                    ':style="Object.assign({}, slotBlockImageStyleFor(img, s), { color: img.color || \'inherit\' })"></iconify-icon>' +
                '</template>' +
                '<div class="zf-mini-body" :data-slot-page="s.pageNum" v-html="s.bodyHtml" style="position: relative;"></div>' +
                '<template v-for="img in (s.page.images || [])" :key="\'sl-free-\' + img.id">' +
                  '<div v-if="(img.wrap === \'free\' || !img.wrap) && img.kind === \'tape\'" ' +
                    'class="zf-tape zf-positioned" :class="\'zf-tape-\' + (img.color || \'beige\')" ' +
                    ':style="slotFreeImageStyleFor(img, s)"></div>' +
                  '<div v-else-if="(img.wrap === \'free\' || !img.wrap) && img.kind === \'scrap\'" ' +
                    'class="zf-scrap zf-positioned" :class="\'zf-scrap-\' + (img.color || \'kraft\')" ' +
                    ':style="slotFreeImageStyleFor(img, s)"></div>' +
                  '<div v-else-if="(img.wrap === \'free\' || !img.wrap) && img.kind === \'sticky\'" ' +
                    'class="zf-sticky zf-positioned" :class="\'zf-sticky-\' + (img.color || \'yellow\')" ' +
                    ':style="stickyStyle(img, slotFreeImageStyleFor(img, s))"></div>' +
                  '<div v-else-if="(img.wrap === \'free\' || !img.wrap) && img.kind === \'sticker\'" ' +
                    'class="zf-sticker zf-positioned" :class="\'zf-sticker-\' + (img.shape || \'circle\')" ' +
                    ':style="stickerStyle(img, slotFreeImageStyleFor(img, s))"></div>' +
                  '<img v-else-if="(img.wrap === \'free\' || !img.wrap) && img.kind !== \'icon\'" ' +
                    'class="zf-mini-image zf-positioned" :src="img.src" alt="" ' +
                    ':style="slotFreeImageStyleFor(img, s)" />' +
                  '<div v-else-if="(img.wrap === \'free\' || !img.wrap) && img.kind === \'icon\'" ' +
                    'class="zf-mini-image zf-positioned zf-positioned-icon-wrap" ' +
                    ':style="slotFreeImageStyleFor(img, s)">' +
                    '<iconify-icon class="zf-icon-element" ' +
                      ':icon="img.src" ' +
                      ':style="{ width: \'100%\', height: \'100%\', color: img.color || \'inherit\' }"></iconify-icon>' +
                  '</div>' +
                '</template>' +
                '<template v-for="box in (s.page.textBoxes || [])" :key="\'sl-tb-\' + box.id">' +
                  '<div class="zf-textbox zf-textbox-readonly" :class="{ \'zf-stamp\': box.kind === \'stamp\', \'zf-panel\': box.kind === \'panel\' }" :style="slotTextBoxStyleFor(box, s)">' +
                    '<div class="zf-textbox-content" v-html="box.html"></div>' +
                  '</div>' +
                '</template>' +
              '</template>' +
            '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '</div>' +
        '<div class="zf-instructions zf-no-print" v-if="model && model.instructions">' +
          '<h3>Text instructions</h3>' +
          '<ol>' +
            '<li v-for="(step, i) in model.instructions" :key="i">{{ step }}</li>' +
          '</ol>' +
        '</div>' +
      '</div>'
  };

  window.ZineSheet = ZineSheet;

  // Diagnostic: ZFDiag() from the app's own console dumps live sheet geometry.
  window.ZFDiag = function () {
    function g(el) {
      if (!el) return null;
      var cs = getComputedStyle(el);
      return {
        w: cs.width, h: cs.height, pos: cs.position,
        transform: cs.transform, overflow: cs.overflow, display: cs.display
      };
    }
    var st = document.getElementById('zf-paper-css');
    var sheet = document.querySelector('.zf-sheet');
    var inner = document.querySelector('.zf-sheet-inner');
    var sides = document.querySelectorAll('.zf-sheet-side');
    return {
      model: window.ZF_STORE ? window.ZF_STORE.modelId : '(none)',
      hasPaperStyle: !!st,
      paperLen: st ? st.textContent.length : 0,
      paperCss: st ? st.textContent : '(none)',
      sideCount: sides.length,
      sheet: g(sheet),
      inner: g(inner),
      sheetRect: sheet ? sheet.getBoundingClientRect().toJSON() : null,
      innerRect: inner ? inner.getBoundingClientRect().toJSON() : null
    };
  };
})();