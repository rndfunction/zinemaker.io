// Zine Forge -- client-side PDF export.
//
// Stage 3a: WYSIWYG rasterization. The sheet view already renders the exact
// imposition a printed page shows, with the exact CSS (gradients, clip-paths,
// text wrapping, icon SVGs) the app uses everywhere else. So instead of
// reimplementing that rendering in PDF primitives (Stage 2's approach, now
// removed), we take a picture of the rendered sheet via html2canvas and
// embed the picture in the PDF. The result is what the user sees, at print
// resolution, with no per-element logic to drift out of sync.
//
// Flow:
//   1. Switch to the sheet view (in the background; the caller shows a modal).
//   2. Wait one paint + a short delay for image/icon decode.
//   3. For each .zf-sheet-side element, html2canvas at print DPI.
//   4. Embed each raster as a PDF page sized to the model's paper.
//   5. Restore the previous view (caller's job -- we return the view to switch to).
//
// Cost: html2canvas is slow (hundreds of ms per side). Called only from
// Share > "Print to PDF", where a wait is expected. If cache becomes necessary
// later, key by element content hash and reuse the PNG.
(function () {
  'use strict';

  var PDF_EXPORT_VERSION = '0.4.0-raster';

  // Convert a model dimension to points. 1pt = 1/72in, 1in = 25.4mm.
  function _toPoints(value, unit) {
    var n = Number(value) || 0;
    if ((unit || 'in').toLowerCase() === 'mm') return n * (72 / 25.4);
    return n * 72;
  }

  function _paperPoints(model) {
    if (!model || !model.paper) return { width: 612, height: 792 };
    var u = model.paper.unit || 'in';
    return {
      width: Math.round(_toPoints(model.paper.width, u) * 100) / 100,
      height: Math.round(_toPoints(model.paper.height, u) * 100) / 100
    };
  }

  // Rasterize an element at print DPI. html2canvas's `scale` option multiplies
  // the element's rendered size; we choose scale so the resulting raster is
  // paperHeightPx pixels tall, i.e. paper inches * DPI.
  // Trace log: every export step appends to window.ZFExportPdf.trace so a
  // hang or failure can be diagnosed by reading the trace afterward.
  function _trace(step) {
    try {
      if (!window.ZFExportPdf) window.ZFExportPdf = {};
      if (!Array.isArray(window.ZFExportPdf.trace)) window.ZFExportPdf.trace = [];
      window.ZFExportPdf.trace.push({ t: Date.now(), step: step });
      // Keep the trace bounded -- a runaway loop shouldn't fill memory.
      if (window.ZFExportPdf.trace.length > 50) {
        window.ZFExportPdf.trace = window.ZFExportPdf.trace.slice(-30);
      }
    } catch (e) {}
  }

  // Watchdog: run a Promise with a timeout. If the promise hasn't settled in
  // `ms`, reject with a clear error naming the stage. Without this, a stuck
  // html2canvas call hangs forever and shareAsPdf never fires.
  function _withTimeout(promise, ms, label) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        _trace('TIMEOUT: ' + label);
        reject(new Error('Timed out after ' + ms + 'ms at: ' + label));
      }, ms);
      promise.then(function (v) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(v);
      }).catch(function (e) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        reject(e);
      });
    });
  }

  async function _rasterizeElement(el, paperHeightPx) {
    _trace('rasterize:start');
    if (!el) { _trace('rasterize:no-el'); return null; }
    if (!window.html2canvas) { _trace('rasterize:no-lib'); throw new Error('html2canvas not loaded'); }
    var renderedH = el.clientHeight || el.getBoundingClientRect().height;
    _trace('rasterize:height=' + renderedH);
    if (!renderedH || renderedH < 1) throw new Error('Sheet element has zero height');
    var scale = paperHeightPx / renderedH;
    scale = Math.max(0.5, Math.min(6, scale));
    _trace('rasterize:scale=' + scale.toFixed(2));
    // Wrap the html2canvas call in a watchdog. If it hangs, we at least get
    // a clear error pointing here instead of an infinite await.
    var canvas = await _withTimeout(
      window.html2canvas(el, {
        scale: scale,
        useCORS: true,
        allowTaint: false,
        logging: false,
        backgroundColor: null,
        ignoreElements: function (node) {
          return node.classList && (
            node.classList.contains('zf-slot-page-num') ||
            node.classList.contains('zf-sheet-guides')
          );
        }
      }),
      15000,
      'html2canvas:side'
    );
    _trace('rasterize:done ' + (canvas ? canvas.width + 'x' + canvas.height : 'null'));
    return canvas;
  }

  // Public entry. Expects the caller to have switched `store.view` to 'sheet'
  // and to restore it afterward. Returns { blob, pages, sides }.
  async function exportPdf() {
    var store = window.ZF_STORE;
    if (!store) throw new Error('No store available');
    if (!window.PDFLib) throw new Error('pdf-lib not loaded');
    if (!window.ZFModels) throw new Error('ZFModels not loaded');
    if (!window.html2canvas) throw new Error('html2canvas not loaded');

    var model = window.ZFModels.getModel(store.modelId);
    if (!model) throw new Error('Unknown model: ' + store.modelId);
    var paper = _paperPoints(model);

    // Print DPI. 250 is a good balance: crisp on paper, smaller files than
    // 300dpi, well above the 72dpi a standard PDF preview shows.
    var DPI = 250;
    var paperHeightPx = paper.height * DPI / 72;
    var paperWidthPx = paper.width * DPI / 72;

    _trace('export:start');
    // Yield twice so Vue paints the sheet view (the caller set store.view).
    await new Promise(function (r) { setTimeout(r, 0); });
    await new Promise(function (r) { requestAnimationFrame(function () { setTimeout(r, 0); }); });
    // A short settle for icon SVG decode and gradient paint.
    await new Promise(function (r) { setTimeout(r, 300); });
    _trace('export:painted');

    var sideEls = document.querySelectorAll('.zf-sheet-side');
    _trace('export:sides=' + sideEls.length);
    if (!sideEls.length) throw new Error('No sheet sides rendered');

    var PDFLib = window.PDFLib;
    var pdfDoc = await PDFLib.PDFDocument.create();

    for (var i = 0; i < sideEls.length; i++) {
      // Rasterize the .zf-sheet element inside the side, NOT the side itself.
      // .zf-sheet-side is a wrapper: the sheet is centered inside a wider
      // container (max-width: 1000px with padding), so photographing the
      // wrapper would embed the surrounding whitespace into the PDF page as
      // empty margins. The .zf-sheet element is sized to the paper, so it
      // produces the correct edge-to-edge raster.
      var sheetEl = sideEls[i].querySelector('.zf-sheet') || sideEls[i];
      _trace('export:side-' + i + '-sheet=' + (sheetEl !== sideEls[i]));
      var canvas = await _rasterizeElement(sheetEl, paperHeightPx);
      if (!canvas) continue;
      // Crop or pad to paper aspect. The sheet element's aspect should already
      // match the paper (it is sized from paper dimensions), but rounding
      // means a pixel or two of slack; scale the canvas onto the page exactly.
      var pngBytes = await new Promise(function (resolve) {
        canvas.toBlob(function (blob) {
          var reader = new FileReader();
          reader.onload = function () { resolve(new Uint8Array(reader.result)); };
          reader.readAsArrayBuffer(blob);
        }, 'image/png');
      });
      var embedded = await pdfDoc.embedPng(pngBytes);
      var pdfPage = pdfDoc.addPage([paper.width, paper.height]);
      pdfPage.drawImage(embedded, {
        x: 0, y: 0, width: paper.width, height: paper.height
      });
    }

    if (pdfDoc.getPageCount() === 0) {
      throw new Error('No pages were produced');
    }

    var bytes = await pdfDoc.save();
    return new Blob([bytes], { type: 'application/pdf' });
  }

  // Wrap exportPdf so any thrown error is captured for diagnosis: store it
  // on the function object AND on window.ZFExportPdf.lastError. Callers
  // (shareAsPdf) still see the rejection -- we don't swallow it -- but the
  // failure reason is queryable afterward via #execute for debugging.
  var _wrappedExportPdf = function () {
    window.ZFExportPdf.lastError = null;
    return exportPdf().catch(function (err) {
      window.ZFExportPdf.lastError = {
        message: (err && err.message) ? err.message : String(err),
        stack: (err && err.stack) ? String(err.stack).slice(0, 500) : null,
        when: Date.now()
      };
      throw err;
    });
  };
  window.ZFExportPdf = _wrappedExportPdf;
  window.ZFExportPdf.version = PDF_EXPORT_VERSION;
  window.ZFExportPdf.lastError = null;
  window.ZFExportPdf.trace = [];
})();