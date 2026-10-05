// zf-editor.js -- the editor view: page list, canvas, rail tools, and the
// inspector/tools column. Extracted from the inline <script> in index.html.
// Classic script; reads the shared store from window.ZF_STORE (set by
// zf-store.js, which must load first). Uses helpers from util.js
// (zfElementStyle, zfTextBoxStyle, zfGetImageSize, zfSanitizeHtml, etc.)
// and from zine-models.js (window.ZFModels).
//
// NOTE: The very large ZF_EDITOR_METHODS object and the ZineEditor
// component are kept in one file for now to keep this extraction a
// faithful, low-risk copy. It can be split further later if desired.
(function () {
  'use strict';

  var store = window.ZF_STORE;

  // -------- Flow-image injection helpers --------
  // Inject a flow-mode spacer + image into a body-like container. These are
  // used by the editor (and, for legacy reasons, by reader/sheet). Kept here
  // because the editor is the only live caller.
  function zfInjectMergedFlow(container, imgs, pxPerIn, bodyWIn, bodyHIn, opts) {
    if (!container || !imgs || !imgs.length) return;
    opts = opts || {};
    // Strip all previous flow injections (spacers, wraps, imgs).
    var old = container.querySelectorAll(
      '[data-zf-spacer="1"], [data-zf-flow-img="1"], [data-zf-flow-wrap="1"]'
    );
    for (var i = 0; i < old.length; i++) old[i].remove();

    // Build a list of rectangles (in inches) for each visible image, and
    // also the pixel size needed for rendering each img.
    var rects = [];   // { id, xL, yT, xR, yB, side, img, imgW, imgH, rot }
    var pending = imgs.length;
    if (!pending) return;

    for (var k = 0; k < imgs.length; k++) {
      (function (img) {
        zfGetImageSize(img.src, function (size) {
          var aspect = (size.w && size.h) ? (size.w / size.h) : 1.33;
          var w = (typeof img.w === 'number') ? img.w : 1.5;
          var h = w / aspect;
          var rot = (typeof img.rot === 'number') ? img.rot : 0;
          var xIn = (typeof img.x === 'number') ? img.x : 0;
          var yIn = (typeof img.y === 'number') ? img.y : 0;
          var rad = rot * Math.PI / 180;
          var cosA = Math.abs(Math.cos(rad));
          var sinA = Math.abs(Math.sin(rad));
          var bbW = w * cosA + h * sinA;
          var bbH = w * sinA + h * cosA;
          var cx = xIn + w / 2;
          var cy = yIn + h / 2;
          var bbX = Math.max(0, cx - bbW / 2);
          var bbY = Math.max(0, cy - bbH / 2);
          var bbRight = Math.min(bodyWIn, bbX + bbW);
          var bbBottom = Math.min(bodyHIn, bbY + bbH);
          var side = (cx < bodyWIn / 2) ? 'left' : 'right';
          rects.push({
            id: img.id || ('anon-' + Math.random().toString(36).slice(2, 6)),
            img: img,
            xL: bbX / bodyWIn,
            xR: bbRight / bodyWIn,
            yT: Math.max(0, bbY / bodyHIn),
            yB: Math.min(1, bbBottom / bodyHIn),
            side: side,
            imgW: w,
            imgH: h,
            rot: rot,
            xIn: xIn,
            yIn: yIn
          });
          pending--;
          if (pending === 0) {
            finalizeMergedFlow(container, rects, pxPerIn, opts);
          }
        });
      })(imgs[k]);
    }
  }

  function finalizeMergedFlow(container, rects, pxPerIn, opts) {
    if (!rects.length) return;
    // Sort by yT for stable polygon tracing.
    rects.sort(function (a, b) { return a.yT - b.yT; });

    // For the shape-outside polygon we need to trace a boundary that
    // excludes every rectangle. Simplification: assign each rect to a side
    // based on its center x. Then trace:
    //   For all-left rects, notch in from the left edge.
    //   For all-right rects, notch in from the right edge.
    // Mixed rects are supported by tracing a staircase on both edges.
    var leftRects = [];
    var rightRects = [];
    for (var i = 0; i < rects.length; i++) {
      if (rects[i].side === 'left') leftRects.push(rects[i]);
      else rightRects.push(rects[i]);
    }
    // Enforce at most one notch per side (same-side rects would produce a
    // self-intersecting polygon, which browsers silently reject). Keep the
    // rect closer to its own edge and drop the rest.
    leftRects.sort(function (a, b) { return a.xL - b.xL; });   // closest to left first
    rightRects.sort(function (a, b) { return b.xR - a.xR; });  // closest to right first
    if (leftRects.length > 1) leftRects = [leftRects[0]];
    if (rightRects.length > 1) rightRects = [rightRects[0]];
    leftRects.sort(function (a, b) { return a.yT - b.yT; });
    rightRects.sort(function (a, b) { return a.yT - b.yT; });

    // Safety clamp: if a single notch would occupy more than 70% of the
    // body width, shrink it so text always has at least 30% of the width
    // to flow. This prevents "text completely disappears" when the image
    // is large or centered.
    function clampNotchLeft(rect) {
      var minX = 0.3; // right edge of notch must leave at least 30% width
      if (rect.xR > 1 - minX) rect.xR = 1 - minX;
    }
    function clampNotchRight(rect) {
      var minX = 0.3;
      if (rect.xL < minX) rect.xL = minX;
    }
    for (var ci = 0; ci < leftRects.length; ci++) clampNotchLeft(leftRects[ci]);
    for (var cj = 0; cj < rightRects.length; cj++) clampNotchRight(rightRects[cj]);

    // Build polygon: start top-left, go clockwise around the bounding box,
    // but jog inward on the left edge for left-side notches and inward on
    // the right edge for right-side notches. Since at most one notch per
    // side, this is a simple 6- to 8-vertex polygon.
    var pts = [];
    pts.push('0% 0%');
    pts.push('100% 0%');
    // Right edge, top to bottom, with at most one notch
    if (rightRects.length) {
      var rr = rightRects[0];
      pts.push(pct(1) + '% ' + pct(rr.yT) + '%');
      pts.push(pct(rr.xL) + '% ' + pct(rr.yT) + '%');
      pts.push(pct(rr.xL) + '% ' + pct(rr.yB) + '%');
      pts.push(pct(1) + '% ' + pct(rr.yB) + '%');
    }
    pts.push(pct(1) + '% ' + pct(1) + '%');
    pts.push('0% 100%');
    // Left edge, bottom to top, with at most one notch
    if (leftRects.length) {
      var lr = leftRects[0];
      pts.push('0% ' + pct(lr.yB) + '%');
      pts.push(pct(lr.xR) + '% ' + pct(lr.yB) + '%');
      pts.push(pct(lr.xR) + '% ' + pct(lr.yT) + '%');
      pts.push('0% ' + pct(lr.yT) + '%');
    }

    function pct(x) {
      if (x < 0) x = 0;
      if (x > 1) x = 1;
      return (x * 100).toFixed(3);
    }

    // Deduplicate consecutive identical points.
    var cleaned = [];
    for (var p = 0; p < pts.length; p++) {
      if (p === 0 || pts[p] !== pts[p - 1]) cleaned.push(pts[p]);
    }
    if (cleaned.length < 3) return;

    var spacer = document.createElement('div');
    spacer.setAttribute('data-zf-spacer', '1');
    spacer.style.cssText =
      'float: left;width: 100%;height: 100%;' +
      'shape-outside: polygon(' + cleaned.join(', ') + ');' +
      'pointer-events: none;';
    container.insertBefore(spacer, container.firstChild);

    // Now draw each image as an absolutely positioned wrapper.
    for (var im = 0; im < rects.length; im++) {
      var rect = rects[im];
      var img2 = rect.img;
      var thisId = rect.id;
      var wrapEl = document.createElement('div');
      wrapEl.setAttribute('data-zf-flow-wrap', '1');
      wrapEl.setAttribute('data-zf-img-id', thisId);
      wrapEl.className = 'zf-img-wrap';
      if (opts.selectedId && opts.selectedId === thisId) {
        wrapEl.className += ' zf-img-selected';
      }
      wrapEl.style.cssText =
        'position: absolute;' +
        'left: ' + (rect.xIn * pxPerIn) + 'px;' +
        'top: ' + (rect.yIn * pxPerIn) + 'px;' +
        'width: ' + (rect.imgW * pxPerIn) + 'px;' +
        'height: auto;' +
        'transform: rotate(' + rect.rot + 'deg);' +
        'transform-origin: center center;' +
        'z-index: 2;';
      var imgEl = document.createElement('img');
      imgEl.setAttribute('data-zf-flow-img', '1');
      imgEl.setAttribute('data-zf-img-id', thisId);
      imgEl.setAttribute('src', img2.src);
      imgEl.setAttribute('alt', 'Page illustration');
      imgEl.className = 'zf-mini-image zf-flow-image';
      imgEl.style.cssText = 'display:block;width:100%;height:auto;' +
        (opts.draggable ? 'cursor: grab;' : 'pointer-events: none;');
      wrapEl.appendChild(imgEl);

      // Dragging: delegate to the editor's drag system so onImageMouseMove
      // updates img.x / img.y and the shape-outside follows.
      if (opts.draggable && opts.onDragStart) {
        imgEl.addEventListener('mousedown', (function (timg) {
          return function (evt) {
            evt.stopPropagation();
            opts.onDragStart(evt, timg);
          };
        })(img2));
      }

      if (opts.draggable) {
        var handleR = document.createElement('span');
        handleR.className = 'zf-img-handle zf-img-handle-resize';
        handleR.title = 'Drag to resize';
        handleR.addEventListener('mousedown', (function (timg) {
          return function (evt) {
            evt.stopPropagation();
            evt.preventDefault();
            if (opts.onResize) opts.onResize(evt, timg);
          };
        })(img2));
        wrapEl.appendChild(handleR);
        var handleRot = document.createElement('span');
        handleRot.className = 'zf-img-handle zf-img-handle-rotate';
        handleRot.title = 'Drag to rotate';
        handleRot.addEventListener('mousedown', (function (timg) {
          return function (evt) {
            evt.stopPropagation();
            evt.preventDefault();
            if (opts.onRotate) opts.onRotate(evt, timg);
          };
        })(img2));
        wrapEl.appendChild(handleRot);

        if (opts.onSelect) {
          wrapEl.addEventListener('click', (function (timg) {
            return function (evt) {
              evt.stopPropagation();
              opts.onSelect(timg);
            };
          })(img2));
        }
      }

      container.appendChild(wrapEl);
    }
  }

  // Legacy: single-image injector. Kept for callers that haven't been
  // migrated to the merged flow yet. (The sheet and reader modules have
  // their own copies in the current codebase; this version is only for the
  // editor's import path, which never calls it today, but we keep it to
  // match the original file exactly.)
  function zfInjectFlow(container, img, pxPerIn, bodyWIn, bodyHIn, opts) {
    if (!container || !img || !img.src) return;
    if (img.wrap && img.wrap !== 'flow') return;
    opts = opts || {};
    var thisId = img.id || 'anon';
    // Remove ONLY our previous injections for THIS image; leave others alone.
      var old = container.querySelectorAll(
        '[data-zf-spacer="1"][data-zf-img-id="' + thisId + '"], ' +
        '[data-zf-flow-img="1"][data-zf-img-id="' + thisId + '"], ' +
        '[data-zf-flow-wrap="1"][data-zf-img-id="' + thisId + '"]'
      );
      for (var i = 0; i < old.length; i++) old[i].remove();

    zfGetImageSize(img.src, function (size) {
      var aspect = (size.w && size.h) ? (size.w / size.h) : 1.33;
      var w = (typeof img.w === 'number') ? img.w : 1.5;
      var imgW = w;
      var imgH = w / aspect;
      var rot = (typeof img.rot === 'number') ? img.rot : 0;
      var xIn = (typeof img.x === 'number') ? img.x : 0;
      var yIn = (typeof img.y === 'number') ? img.y : 0;
      var rad = rot * Math.PI / 180;
      var cosA = Math.abs(Math.cos(rad));
      var sinA = Math.abs(Math.sin(rad));
      var bbW = imgW * cosA + imgH * sinA;
      var bbH = imgW * sinA + imgH * cosA;
      var cx = xIn + imgW / 2;
      var cy = yIn + imgH / 2;
      var bbX = Math.max(0, cx - bbW / 2);
      var bbY = Math.max(0, cy - bbH / 2);
      var bbRight = Math.min(bodyWIn, bbX + bbW);
      var bbBottom = Math.min(bodyHIn, bbY + bbH);

      var xL = Math.max(0, (bbX / bodyWIn) * 100);
      var xR = Math.min(100, (bbRight / bodyWIn) * 100);
      var yT = Math.max(0, (bbY / bodyHIn) * 100);
      var yB = Math.min(100, (bbBottom / bodyHIn) * 100);
      if (xR <= xL) xR = xL + 1;
      if (yB <= yT) yB = yT + 1;

      var onRight = cx >= bodyWIn / 2;
      var pts;
      if (onRight) {
        pts = [
          xL.toFixed(2) + '% ' + yT.toFixed(2) + '%',
          '100% ' + yT.toFixed(2) + '%',
          '100% ' + yB.toFixed(2) + '%',
          xL.toFixed(2) + '% ' + yB.toFixed(2) + '%'
        ];
      } else {
        pts = [
          '0% ' + yT.toFixed(2) + '%',
          xR.toFixed(2) + '% ' + yT.toFixed(2) + '%',
          xR.toFixed(2) + '% ' + yB.toFixed(2) + '%',
          '0% ' + yB.toFixed(2) + '%'
        ];
      }

      var spacer = document.createElement('div');
      spacer.setAttribute('data-zf-spacer', '1');
      spacer.setAttribute('data-zf-img-id', thisId);
      spacer.style.cssText =
        'float: left;width: 100%;height: 100%;' +
        'shape-outside: polygon(' + pts.join(', ') + ');' +
        'pointer-events: none;';
      container.insertBefore(spacer, container.firstChild);

      // Wrap the flow image so we can attach resize/rotate handles in the
      // same way the free-mode images have them.
      var wrapEl = document.createElement('div');
      wrapEl.setAttribute('data-zf-flow-wrap', '1');
      wrapEl.setAttribute('data-zf-img-id', thisId);
      wrapEl.className = 'zf-img-wrap';
      if (opts.selectedId && opts.selectedId === thisId) {
        wrapEl.className += ' zf-img-selected';
      }
      wrapEl.style.cssText =
        'position: absolute;' +
        'left: ' + (xIn * pxPerIn) + 'px;' +
        'top: ' + (yIn * pxPerIn) + 'px;' +
        'width: ' + (imgW * pxPerIn) + 'px;' +
        'height: auto;' +
        'transform: rotate(' + rot + 'deg);' +
        'transform-origin: center center;' +
        'z-index: 2;';
      var imgEl;
      if (img.kind === 'icon') {
        imgEl = document.createElement('iconify-icon');
        imgEl.setAttribute('icon', img.src);
        imgEl.className = 'zf-mini-image zf-flow-image zf-flow-icon';
        if (img.color) imgEl.style.color = img.color;
      } else {
        imgEl = document.createElement('img');
        imgEl.setAttribute('src', img.src);
        imgEl.setAttribute('alt', 'Page illustration');
        imgEl.className = 'zf-mini-image zf-flow-image';
      }
      imgEl.style.cssText = 'display:block;width:100%;height:auto;' +
        (opts.draggable ? 'cursor: grab;' : '');
      wrapEl.appendChild(imgEl);

      // Handles for the editor only.
      if (opts.draggable) {
        var handleR = document.createElement('span');
        handleR.className = 'zf-img-handle zf-img-handle-resize';
        handleR.title = 'Drag to resize';
        handleR.addEventListener('mousedown', function (evt) {
          evt.stopPropagation();
          evt.preventDefault();
          if (opts.onResize) opts.onResize(evt, img);
        });
        wrapEl.appendChild(handleR);
        var handleRot = document.createElement('span');
        handleRot.className = 'zf-img-handle zf-img-handle-rotate';
        handleRot.title = 'Drag to rotate';
        handleRot.addEventListener('mousedown', function (evt) {
          evt.stopPropagation();
          evt.preventDefault();
          if (opts.onRotate) opts.onRotate(evt, img);
        });
        wrapEl.appendChild(handleRot);
      }

      container.appendChild(wrapEl);

      // Selection: click selects this image. Only in editor (draggable).
      if (opts.draggable && opts.onSelect) {
        wrapEl.addEventListener('click', function (evt) {
          evt.stopPropagation();
          opts.onSelect(img);
        });
      }

      // Optional drag handler for interactive editor use.
      if (opts.draggable) {
        imgEl.addEventListener('mousedown', function (evt) {
          evt.preventDefault();
          var startX = evt.clientX;
          var startY = evt.clientY;
          var baseX = (typeof img.x === 'number') ? img.x : 0;
          var baseY = (typeof img.y === 'number') ? img.y : 0;
          var active = true;
          function move(e) {
            if (!active) return;
            var dx = (e.clientX - startX) / pxPerIn;
            var dy = (e.clientY - startY) / pxPerIn;
            var nx = Math.round((baseX + dx) * 100) / 100;
            var ny = Math.round((baseY + dy) * 100) / 100;
            img.x = nx;
            img.y = ny;
            imgEl.style.left = (nx * pxPerIn) + 'px';
            imgEl.style.top = (ny * pxPerIn) + 'px';
            if (opts.onDrag) opts.onDrag(img);
          }
          function up() {
            active = false;
            window.removeEventListener('mousemove', move);
            window.removeEventListener('mouseup', up);
            if (opts.onDrag) opts.onDrag(img);
          }
          window.addEventListener('mousemove', move);
          window.addEventListener('mouseup', up);
        });
      }
    });
  }

  // -------- Image compression wrapper --------
  // Downscales to at most maxSide px on the longest edge and re-encodes as
  // JPEG. zfCompressImageAsync/Sync live in util.js.
  function zfCompressAndPlace(dataUrl, maxSide, quality, onDone) {
    try {
      var img = new Image();
      img.src = dataUrl;
      var c = document.createElement('canvas');
      if (!img.complete || !img.naturalWidth) {
        zfCompressImageAsync(dataUrl, maxSide, quality, function (out) {
          if (onDone) onDone(out);
        });
        return dataUrl;
      }
      var out2 = zfCompressImageSync(img, maxSide, quality, c);
      if (onDone) onDone(out2);
      return out2;
    } catch (e) {
      console.warn('compress failed', e);
      if (onDone) onDone(dataUrl);
      return dataUrl;
    }
  }

  // Expose the helpers other modules rely on.
  window.zfInjectMergedFlow = zfInjectMergedFlow;
  window.zfInjectFlow = zfInjectFlow;
  window.zfCompressAndPlace = zfCompressAndPlace;
})();