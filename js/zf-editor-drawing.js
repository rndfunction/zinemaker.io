// zf-editor-drawing.js -- the freehand-drawing subsystem.
// Extracted from zf-editor-component.js during the editor split.
// Methods here are plain Vue method bodies (no closures over locals,
// no `this` assumptions beyond the shared Vue instance). They are
// merged back into the component's methods table by zf-editor-component.js
// via Object.assign, so `this` resolves identically to before.
//
// The one external dependency this group has that is not a `this.*`
// instance member is zfRenderStrokes (from util.js), which is a global
// function -- it resolves the same way from any module.
(function () {
  'use strict';

  if (typeof zfAssertDeps === 'function') zfAssertDeps('zf-editor-drawing', ['ZF_STORE', 'zfRenderStrokes']);

  var methods = {
    _drawToInches: function (p) {
      var m = this.activeModel;
      var canvas = this.$refs.drawCanvas;
      if (!m || !canvas) return { x: 0, y: 0 };
      var dpr = window.devicePixelRatio || 1;
      var cssW = canvas.width / dpr, cssH = canvas.height / dpr;
      if (!cssW || !cssH) return { x: 0, y: 0 };
      var x = p.x, y = p.y;
      // Re-editing a rotated drawing: strokes are STORED in page space, but
      // the pointer is in screen space. Inverse-rotate around the box centre
      // so the recorded stroke is un-rotated (the element's `rot` re-applies
      // the tilt on render). Live drawing itself is unrotated (raw _drawPos).
      if (this._editRot && this._editCenter) {
        var c = this._editCenter;
        var dx = x - c.x, dy = y - c.y;
        var cos = Math.cos(-this._editRot), sin = Math.sin(-this._editRot);
        x = c.x + (dx * cos - dy * sin);
        y = c.y + (dx * sin + dy * cos);
      }
      return {
        x: (x / cssW) * m.page.width,
        y: (y / cssH) * m.page.height
      };
    },
    _drawRecordPoint: function (p, wIn) {
      var st = this._currentStroke;
      if (!st) return;
      var ip = this._drawToInches(p);
      var pts = st.pts;
      if (pts.length) {
        var prev = pts[pts.length - 1];
        var dx = ip.x - prev.x, dy = ip.y - prev.y;
        // Skip points closer than ~0.3 device px (converted): tiny threshold.
        if ((dx * dx + dy * dy) < 1e-6) return;
      }
      // Optional per-point width in INCHES (for speed-variable strokes).
      if (typeof wIn === 'number' && wIn > 0) ip.w = wIn;
      pts.push(ip);
    },
    startDrawing: function () {
      var self = this;
      this.drawUndoStack = [];
      this._strokes = [];
      this._currentStroke = null;
      this._editRot = 0;
      this._editCenter = null;
      this.drawingMode = true;
      // No element being re-edited for a fresh drawing.
      this.editDrawingId = null;
      // Cancel any in-progress image drag so nothing moves under the canvas.
      this.imageDrag = null;
      this.clearElementSelection();
      this.$nextTick(function () {
        var pageEl = self.$refs.miniPage;
        var canvas = self.$refs.drawCanvas;
        if (!pageEl || !canvas) return;
        var rect = pageEl.getBoundingClientRect();
        // Use device pixel ratio for crisp strokes, but keep CSS size 1:1.
        var dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
        var ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, rect.width, rect.height);
        self._drawCtx = ctx;
        self._drawActive = false;
      });
    },
    _drawPos: function (evt) {
      var canvas = this.$refs.drawCanvas;
      if (!canvas) return { x: 0, y: 0 };
      var r = canvas.getBoundingClientRect();
      return { x: evt.clientX - r.left, y: evt.clientY - r.top };
    },
    onDrawPointerDown: function (evt) {
      var ctx = this._drawCtx;
      if (!ctx) return;
      evt.preventDefault();
      try { this.$refs.drawCanvas.setPointerCapture(evt.pointerId); } catch (e) {}
      // "Erase stroke" tool: a click removes the whole stroke under the
      // cursor instead of drawing. Only available while re-editing.
      if (this.drawTool === 'eraseStroke' && this.editDrawingId) {
        var dp = this._drawPos(evt);
        this._deleteStrokeAtPoint(dp);
        return;
      }
      // Snapshot the current canvas AND strokes so Undo can restore both.
      // (Restoring only the canvas would leave _strokes out of sync, and a
      // later commit would resurrect an undone stroke.)
      var canvas = this.$refs.drawCanvas;
      try {
        this.drawUndoStack.push({
          img: canvas.toDataURL(),
          strokes: JSON.parse(JSON.stringify(this._strokes || []))
        });
      } catch (e) {}
      this._drawActive = true;
      var p = this._drawPos(evt);
      this._drawLast = p;
      this._drawLastTime = (evt.timeStamp || Date.now());
      // Smoothed mode tracks the last few points to draw quadratic curves
      // through; raw mode only needs the previous point.
      this._drawPts = [p, p];
      // Calligraphy keeps the previous point's nib offset so consecutive
      // filled quads share an edge (no gaps between segments).
      this._calliLast = null;

      // Begin a new vector stroke record. IMPORTANT: the brush size is
      // entered in SCREEN PIXELS (the slider is 1..40 px on the live canvas),
      // but the renderer (zfRenderStrokes) treats `size` as INCHES (it does
      // size * scale). Record it in inches here, or a "6px" brush becomes a
      // 6-inch stroke and floods the page.
      var pxPerInch = 1;
      (function () {
        var c = this.$refs.drawCanvas;
        var m = this.activeModel;
        if (c && m && m.page.width) {
          var dpr = window.devicePixelRatio || 1;
          pxPerInch = (c.width / dpr) / m.page.width;
        }
      }).call(this);
      this._currentStroke = {
        tool: this.drawTool,
        color: this.drawColor,
        size: this.drawSize / (pxPerInch || 1),
        opacity: (typeof this.drawOpacity === 'number') ? this.drawOpacity : 1,
        nib: this.drawNibAngle,
        smoothing: (typeof this.drawSmoothing === 'number') ? this.drawSmoothing : 0,
        pts: []
      };
      // Record the first point's width in the SAME unit as st.size (page
      // units), so the commit renderer's (pt.w * scale) is in px. At down,
      // width == drawSize, so pt.w == st.size exactly.
      this._drawRecordPoint(p, this._currentStroke.size);

      if (this.drawTool === 'calligraphy') {
        // A tap should leave a small mark; draw a tiny quad now.
        this._calliSegment(ctx, p, { x: p.x + 0.5, y: p.y + 0.5 });
        return;
      }

      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      // A single tap should leave a dot, so draw a tiny segment now.
      ctx.lineTo(p.x + 0.01, p.y + 0.01);
      this._drawStrokeStyle(ctx, this.drawSize);
      ctx.stroke();
    },
    _calliSegment: function (ctx, a, b) {
      var phi = Math.atan2(b.y - a.y, b.x - a.x);
      var theta = (this.drawNibAngle || 0) * Math.PI / 180;
      // Half-width varies with the angle between travel and the nib edge.
      var hw = (this.drawSize / 2) * Math.abs(Math.sin(phi - theta));
      // Small floor so the stroke never fully vanishes (reads better).
      hw = Math.max(hw, this.drawSize * 0.06);
      // Perpendicular to the segment direction.
      var nx = -Math.sin(phi), ny = Math.cos(phi);
      var aL = { x: a.x + nx * hw, y: a.y + ny * hw };
      var aR = { x: a.x - nx * hw, y: a.y - ny * hw };
      var bL = { x: b.x + nx * hw, y: b.y + ny * hw };
      var bR = { x: b.x - nx * hw, y: b.y - ny * hw };
      // If we have the previous end edge, start from it to avoid a seam.
      var startL = this._calliLast ? this._calliLast.L : aL;
      var startR = this._calliLast ? this._calliLast.R : aR;
      ctx.beginPath();
      ctx.moveTo(startL.x, startL.y);
      ctx.lineTo(aL.x, aL.y);
      ctx.lineTo(bL.x, bL.y);
      ctx.lineTo(bR.x, bR.y);
      ctx.lineTo(aR.x, aR.y);
      ctx.lineTo(startR.x, startR.y);
      ctx.closePath();
      this._drawApplyColor(ctx, false);
      ctx.fill();
      this._calliLast = { L: bL, R: bR };
    },
    onDrawPointerMove: function (evt) {
      if (!this._drawActive) return;
      var ctx = this._drawCtx;
      if (!ctx) return;
      evt.preventDefault();
      var p = this._drawPos(evt);
      var last = this._drawLast || p;

      // Calligraphy tool: fill a nib-shaped quad for this segment and return.
      // (Velocity/smoothing do not apply -- width comes from direction.)
      if (this.drawTool === 'calligraphy') {
        this._drawRecordPoint(p);
        this._calliSegment(ctx, last, p);
        this._drawLast = p;
        return;
      }

      // Velocity-based width: fast strokes thinner, slow strokes thicker.
      var width = this.drawSize;
      if (this.drawVelocity) {
        var now = (evt.timeStamp || Date.now());
        var dt = Math.max(1, now - (this._drawLastTime || now));
        var dx = p.x - last.x, dy = p.y - last.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var speed = dist / dt; // px per ms
        // Map speed (~0..2 px/ms) to a width factor (~1.15 .. 0.55).
        var f = 1.15 - Math.min(1, speed) * 0.6;
        width = Math.max(0.5, this.drawSize * f);
        this._drawLastTime = now;
      }

      // Record this point, capturing per-point width in PAGE UNITS (same as
      // st.size) via the ratio width/drawSize, so (pt.w * scale) is px at
      // any unit. (Storing inches here made A4 strokes ~25x too thin.)
      var _szUnit = (this._currentStroke && this._currentStroke.size) || this.drawSize;
      this._drawRecordPoint(p, _szUnit * (this.drawSize ? (width / this.drawSize) : 1));

      if (this.drawSmoothing > 0) {
        // Quadratic smoothing: keep the last two points and draw a curve
        // through the midpoint, using the previous point as the control.
        // Strength controls how far back the smoothing reaches (more points
        // = smoother, at the cost of a little lag).
        var pts = this._drawPts || [last, last];
        pts.push(p);
        var keep = 2 + this.drawSmoothing; // 3..5 points retained
        if (pts.length > keep) pts.shift();
        this._drawPts = pts;
        var n = pts.length;
        if (n >= 3) {
          var p0 = pts[n - 3];
          var p1 = pts[n - 2];
          var p2 = pts[n - 1];
          var mid1 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
          var mid2 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
          ctx.beginPath();
          ctx.moveTo(mid1.x, mid1.y);
          ctx.quadraticCurveTo(p1.x, p1.y, mid2.x, mid2.y);
          this._drawStrokeStyle(ctx, width);
          ctx.stroke();
        }
      } else {
        ctx.beginPath();
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(p.x, p.y);
        this._drawStrokeStyle(ctx, width);
        ctx.stroke();
      }
      this._drawLast = p;
    },
    onDrawPointerUp: function (evt) {
      if (!this._drawActive) return;
      this._drawActive = false;
      try { this.$refs.drawCanvas.releasePointerCapture(evt.pointerId); } catch (e) {}
      // Finalize the current vector stroke.
      if (this._currentStroke && this._currentStroke.pts.length) {
        if (!Array.isArray(this._strokes)) this._strokes = [];
        this._strokes.push(this._currentStroke);
      }
      this._currentStroke = null;
    },
    _drawStrokeStyle: function (ctx, width) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = (typeof width === 'number') ? width : this.drawSize;
      this._drawApplyColor(ctx, true);
    },
    _drawApplyColor: function (ctx, forStroke) {
      var erasing = (this.drawTool === 'eraser');
      var color;
      if (erasing) {
        ctx.globalCompositeOperation = 'destination-out';
        color = 'rgba(0,0,0,1)';
      } else {
        ctx.globalCompositeOperation = 'source-over';
        var op = (typeof this.drawOpacity === 'number') ? this.drawOpacity : 1;
        color = (op >= 1) ? this.drawColor : this._withAlpha(this.drawColor, op);
      }
      if (forStroke) ctx.strokeStyle = color;
      else ctx.fillStyle = color;
    },
    _withAlpha: function (hex, alpha) {
      var h = String(hex || '#000000').replace('#', '');
      if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
      if (h.length !== 6) return 'rgba(0,0,0,' + alpha + ')';
      var r = parseInt(h.slice(0,2), 16);
      var g = parseInt(h.slice(2,4), 16);
      var b = parseInt(h.slice(4,6), 16);
      return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
    },
    drawUndo: function () {
      var snap = this.drawUndoStack.pop();
      if (!snap) return;
      var canvas = this.$refs.drawCanvas;
      if (!canvas) return;
      // Restore the stroke DATA (always present + correct) and re-render
      // from it. Do NOT draw the raster snap.img -- a toDataURL of a
      // transparent canvas can be blank/stale, which made undo blank the
      // whole drawing even though the stroke data was intact.
      this._strokes = (snap && snap.strokes) ? JSON.parse(JSON.stringify(snap.strokes)) : [];
      this._currentStroke = null;
      this._redrawCanvasFromStrokes();
    },
    _deleteStrokeAtPoint: function (canvasPt) {
      var strokes = this._strokes || [];
      if (!strokes.length) return;
      var canvas = this.$refs.drawCanvas;
      var m = this.activeModel;
      if (!canvas || !m) return;
      var dpr = window.devicePixelRatio || 1;
      var pxPerInch = (canvas.width / dpr) / m.page.width || 1;
      var ip = this._drawToInches(canvasPt);
      var tol = 12 / pxPerInch; // ~12 screen px hit tolerance, in inches
      var best = -1, bestDist = Infinity;
      for (var i = 0; i < strokes.length; i++) {
        var d = this._distToStroke(strokes[i], ip);
        // Prefer the LAST (topmost) stroke among close ones: use <= so later
        // strokes win ties.
        if (d <= tol && d <= bestDist) { bestDist = d; best = i; }
      }
      if (best < 0) return;
      // Snapshot for undo before removing.
      try {
        this.drawUndoStack.push({
          img: canvas.toDataURL(),
          strokes: JSON.parse(JSON.stringify(strokes))
        });
      } catch (e) {}
      strokes.splice(best, 1);
      this._redrawCanvasFromStrokes();
    },
    _distToStroke: function (stroke, p) {
      var pts = stroke.pts || [];
      if (!pts.length) return Infinity;
      var half = (stroke.size || 0.05) / 2;
      if (pts.length === 1) {
        var dx0 = pts[0].x - p.x, dy0 = pts[0].y - p.y;
        return Math.sqrt(dx0 * dx0 + dy0 * dy0) - half;
      }
      var min = Infinity;
      for (var i = 1; i < pts.length; i++) {
        var a = pts[i-1], b = pts[i];
        var vx = b.x - a.x, vy = b.y - a.y;
        var wx = p.x - a.x, wy = p.y - a.y;
        var len2 = vx * vx + vy * vy;
        var t = len2 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2)) : 0;
        var cx = a.x + vx * t, cy = a.y + vy * t;
        var dx = p.x - cx, dy = p.y - cy;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d < min) min = d;
      }
      return min - half;
    },
    drawClear: function () {
      var canvas = this.$refs.drawCanvas;
      if (!canvas) return;
      // Snapshot before clearing so Clear is undoable.
      try {
        this.drawUndoStack.push({
          img: canvas.toDataURL(),
          strokes: JSON.parse(JSON.stringify(this._strokes || []))
        });
      } catch (e) {}
      var ctx = canvas.getContext('2d');
      var dpr = window.devicePixelRatio || 1;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    },
    stopDrawing: function () {
      var page = this.active;
      var editId = this.editDrawingId;
      var strokes = this._strokes || [];
      this.drawingMode = false;
      this.editDrawingId = null;
      this._drawCtx = null;
      if (!page) return;

      var m = this.activeModel;
      if (!m) return;

      // No strokes -> if re-editing, the user erased everything, so remove
      // the element; otherwise just exit.
      if (!strokes.length) {
        if (editId) this._removeDrawingElement(editId);
        return;
      }

      // Bounding box of the ink, computed from the stroke points (page-inch
      // space), padded by the largest stroke width so wide strokes are not
      // clipped. This is more precise than scanning canvas pixels.
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      var maxSize = 0;
      for (var s = 0; s < strokes.length; s++) {
        var st = strokes[s];
        if (st.size > maxSize) maxSize = st.size;
        var pts = st.pts || [];
        for (var p = 0; p < pts.length; p++) {
          if (pts[p].x < minX) minX = pts[p].x;
          if (pts[p].x > maxX) maxX = pts[p].x;
          if (pts[p].y < minY) minY = pts[p].y;
          if (pts[p].y > maxY) maxY = pts[p].y;
        }
      }
      // Pad by half the widest stroke plus a small grace margin (inches).
      var padIn = maxSize / 2 + 0.04;
      var inkMinX = minX - padIn, inkMinY = minY - padIn;
      var inkMaxX = maxX + padIn, inkMaxY = maxY + padIn;

      // Find the element being re-edited (if any) so we can PRESERVE its box.
      var found = null;
      if (editId) {
        var imgs0 = page.images || [];
        for (var i0 = 0; i0 < imgs0.length; i0++) { if (imgs0[i0].id === editId) { found = imgs0[i0]; break; } }
      }

      // Final box: for a new drawing it is the ink bounds; for a re-edit it
      // is the UNION of the existing box and the ink bounds, so re-editing
      // never drifts the element and only grows if new strokes extend past
      // the old box. Never shrinks.
      var boxMinX = inkMinX, boxMinY = inkMinY, boxMaxX = inkMaxX, boxMaxY = inkMaxY;
      if (found && typeof found.x === 'number' && typeof found.w === 'number') {
        boxMinX = Math.min(boxMinX, found.x);
        boxMinY = Math.min(boxMinY, found.y);
        boxMaxX = Math.max(boxMaxX, found.x + found.w);
        boxMaxY = Math.max(boxMaxY, found.y + found.h);
      }
      // Clamp to the page box.
      boxMinX = Math.max(0, boxMinX); boxMinY = Math.max(0, boxMinY);
      boxMaxX = Math.min(m.page.width, boxMaxX); boxMaxY = Math.min(m.page.height, boxMaxY);
      var minX2 = boxMinX, minY2 = boxMinY;
      var wIn = Math.max(0.02, boxMaxX - boxMinX);
      var hIn = Math.max(0.02, boxMaxY - boxMinY);

      // Render the strokes into a canvas sized to the FINAL box at HIGH DPI,
      // so the element prints sharply and the image lines up with the box.
      var DPI = 300;
      var outW = Math.max(1, Math.round(wIn * DPI));
      var outH = Math.max(1, Math.round(hIn * DPI));
      var MAXPX = 4096;
      if (outW > MAXPX || outH > MAXPX) {
        var k = MAXPX / Math.max(outW, outH);
        outW = Math.max(1, Math.round(outW * k));
        outH = Math.max(1, Math.round(outH * k));
      }
      var out = document.createElement('canvas');
      out.width = outW; out.height = outH;
      var octx = out.getContext('2d');
      var scalePxPerInch = outW / wIn;
      octx.save();
      octx.translate(-minX2 * scalePxPerInch, -minY2 * scalePxPerInch);
      zfRenderStrokes(octx, strokes, scalePxPerInch);
      octx.restore();
      var src = out.toDataURL('image/png');

      if (editId) {
        if (found) {
          found.src = src;
          found.strokes = strokes;
          found.x = minX2; found.y = minY2; found.w = wIn; found.h = hIn;
          found.settings = this._currentDrawSettings();
          page.activeImageId = found.id;
          page.activeTextBoxId = null;
        }
      } else {
        if (!Array.isArray(page.images)) page.images = [];
        var el = {
          id: zfNewImageId(),
          kind: 'photo',
          src: src,
          strokes: strokes,
          settings: this._currentDrawSettings(),
          x: minX2, y: minY2, w: wIn, h: hIn,
          rot: 0,
          wrap: 'free',
          z: (function () {
            var maxZ = 0;
            var all = (page.images || []).concat(page.textBoxes || []);
            for (var zi = 0; zi < all.length; zi++) {
              if (typeof all[zi].z === 'number' && all[zi].z > maxZ) maxZ = all[zi].z;
            }
            return maxZ + 1;
          })(),
          drawing: true
        };
        page.images.push(el);
        page.activeImageId = el.id;
        page.activeTextBoxId = null;
      }
    },
    _removeDrawingElement: function (id) {
      var page = this.active;
      if (!page || !Array.isArray(page.images)) return;
      for (var i = 0; i < page.images.length; i++) {
        if (page.images[i].id === id) {
          page.images.splice(i, 1);
          if (page.activeImageId === id) page.activeImageId = null;
          return;
        }
      }
    },
    editDrawing: function (img) {
      if (!img || !img.drawing) return;
      var self = this;
      this.editDrawingId = img.id;
      this.drawUndoStack = [];
      // Restore the drawing's own settings so re-opening feels like the same
      // session (same tool/color/size/opacity/nib/smoothing as before).
      var s = img.settings || {};
      if (s.tool) this.drawTool = s.tool;
      if (s.color) this.drawColor = s.color;
      if (typeof s.size === 'number') this.drawSize = s.size;
      if (typeof s.opacity === 'number') this.drawOpacity = s.opacity;
      if (typeof s.nib === 'number') this.drawNibAngle = s.nib;
      if (typeof s.smoothing === 'number') this.drawSmoothing = s.smoothing;
      this.drawingMode = true;
      // Cancel any in-progress image drag from the mousedown that preceded
      // this double-click, so the element does not keep moving under the
      // freshly opened canvas.
      this.imageDrag = null;
      this.clearElementSelection();
      this.$nextTick(function () {
        var pageEl = self.$refs.miniPage;
        var canvas = self.$refs.drawCanvas;
        if (!pageEl || !canvas) return;
        var rect = pageEl.getBoundingClientRect();
        var dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
        var ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, rect.width, rect.height);
        self._drawCtx = ctx;
        self._drawActive = false;
        var m = self.activeModel;
        if (!m) return;

        // Match the element's placement rotation on the edit canvas, so the
        // drawing looks the same while editing as it does placed. Store the
        // rotation and the box centre (canvas px); input is inverse-rotated
        // in _drawPos so recorded strokes stay in page space.
        self._editRot = (typeof img.rot === 'number' ? img.rot : 0) * Math.PI / 180;
        var cxIn = (img.x || 0) + (img.w || m.page.width) / 2;
        var cyIn = (img.y || 0) + (img.h || m.page.height) / 2;
        self._editCenter = {
          x: cxIn / m.page.width * rect.width,
          y: cyIn / m.page.height * rect.height
        };

        if (Array.isArray(img.strokes) && img.strokes.length) {
          // VECTOR re-edit: re-render stored strokes (page-inch space),
          // tilted to match the element's rotation.
          self._strokes = JSON.parse(JSON.stringify(img.strokes));
          self._currentStroke = null;
          self._redrawCanvasFromStrokes();
        } else if (img.src) {
          // Backward compat: older raster-only drawing. Draw it as a tilted
          // background; new strokes go on top.
          self._strokes = [];
          self._currentStroke = null;
          var im = new Image();
          im.onload = function () {
            ctx.save();
            if (self._editRot) {
              ctx.translate(self._editCenter.x, self._editCenter.y);
              ctx.rotate(self._editRot);
              ctx.translate(-self._editCenter.x, -self._editCenter.y);
            }
            var ex = (img.x || 0) / m.page.width * rect.width;
            var ey = (img.y || 0) / m.page.height * rect.height;
            var ew = (img.w || m.page.width) / m.page.width * rect.width;
            var eh = (img.h || m.page.height) / m.page.height * rect.height;
            try { ctx.drawImage(im, ex, ey, ew, eh); } catch (e) {}
            ctx.restore();
          };
          im.src = img.src;
        }
      });
    },
    _applySettingsToStrokes: function () {
      if (!this.editDrawingId) return;
      if (!Array.isArray(this._strokes)) return;
      var canvas = this.$refs.drawCanvas;
      var m = this.activeModel;
      if (!canvas || !m) return;
      var dpr = window.devicePixelRatio || 1;
      var pxPerInch = (canvas.width / dpr) / m.page.width || 1;
      var sizeIn = this.drawSize / pxPerInch;
      for (var i = 0; i < this._strokes.length; i++) {
        var st = this._strokes[i];
        st.color = this.drawColor;
        st.opacity = (typeof this.drawOpacity === 'number') ? this.drawOpacity : 1;
        st.size = sizeIn;
        st.smoothing = (typeof this.drawSmoothing === 'number') ? this.drawSmoothing : 0;
        if (st.tool === 'calligraphy') st.nib = this.drawNibAngle;
      }
      this._redrawCanvasFromStrokes();
    },
    _redrawCanvasFromStrokes: function () {
      var canvas = this.$refs.drawCanvas;
      var m = this.activeModel;
      if (!canvas || !m) return;
      var ctx = canvas.getContext('2d');
      var dpr = window.devicePixelRatio || 1;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Render existing strokes TILTED to match the placed element, then
      // RESET to an unrotated transform so live drawing (which uses raw
      // pointer coords) is not rotated. New strokes look straight while
      // drawing but commit correctly (stored in page space, tilted by the
      // element's rot on render).
      ctx.save();
      if (this._editRot && this._editCenter) {
        ctx.translate(this._editCenter.x, this._editCenter.y);
        ctx.rotate(this._editRot);
        ctx.translate(-this._editCenter.x, -this._editCenter.y);
      }
      var pxPerInch = (canvas.width / dpr) / m.page.width;
      zfRenderStrokes(ctx, this._strokes || [], pxPerInch);
      ctx.restore();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    },
    _currentDrawSettings: function () {
      return {
        tool: this.drawTool,
        color: this.drawColor,
        size: this.drawSize,
        opacity: (typeof this.drawOpacity === 'number') ? this.drawOpacity : 1,
        nib: this.drawNibAngle,
        smoothing: (typeof this.drawSmoothing === 'number') ? this.drawSmoothing : 0
      };
    },
    cancelDrawing: function () {
      this.editDrawingId = null;
      this._drawCtx = null;
      this._drawActive = false;
      this._editRot = 0;
      this._editCenter = null;
      this.drawUndoStack = [];
    },
    onDrawDocPointerDown: function (evt) {
      if (!this.drawingMode) return;
      var t = evt.target;
      var canvas = this.$refs.drawCanvas;
      if (canvas && canvas.contains(t)) return;
      // The tools live in the floating panel now (and the legacy draw panel
      // may still exist during migration). Clicking EITHER keeps the session
      // open; only a click truly outside both (and the canvas) commits.
      var floatPanel = this.$refs.floatPanelEl;
      if (floatPanel && floatPanel.contains(t)) return;
      var oldPanel = this.$el ? this.$el.querySelector('.zf-draw-panel') : null;
      if (oldPanel && oldPanel.contains(t)) return;
      // Clicked elsewhere -> commit and exit.
      this.stopDrawing();
    }
  };

  window.ZFEditorDrawing = { methods: methods };
})();