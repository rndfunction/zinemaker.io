// Zine Forge - shared utilities and helpers

// -------- Debug log --------
function zfLog(msg) {
  try { console.log('[ZF]', msg); } catch (e) {}
  try {
    if (location.hash.indexOf('zfdebug') === -1) return;
    var wrap = document.getElementById('zf-boot-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'zf-boot-wrap';
      wrap.style.cssText = 'position:fixed;top:4px;right:4px;z-index:99999;font:11px monospace;';
      var toggle = document.createElement('button');
      toggle.textContent = 'ZF log';
      toggle.style.cssText = 'background:#1b1b1b;color:#ffbe2e;border:1px solid #ffbe2e;border-radius:3px;padding:2px 6px;font:11px monospace;cursor:pointer;';
      var panel = document.createElement('div');
      panel.id = 'zf-boot-banner';
      panel.style.cssText = 'display:none;margin-top:4px;background:#1b1b1b;color:#ffbe2e;padding:6px 8px;max-width:420px;max-height:220px;overflow:auto;white-space:pre-wrap;border:1px solid #ffbe2e;border-radius:3px;';
      toggle.addEventListener('click', function () {
        panel.style.display = (panel.style.display === 'none') ? 'block' : 'none';
      });
      wrap.appendChild(toggle);
      wrap.appendChild(panel);
      (document.body || document.documentElement).appendChild(wrap);
    }
    var banner = document.getElementById('zf-boot-banner');
    if (banner) {
      banner.textContent += msg + '\n';
      banner.scrollTop = banner.scrollHeight;
    }
  } catch (e) {}
}

// -------- ID generators --------
function zfNewImageId() {
  return 'i-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
}
function zfNewTextBoxId() {
  return 't-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
}

// -------- Page deep-copy --------
// Single deep-copy helper for page objects. Pages are plain JSON data
// (heading/body/images/textBoxes and any future fields), so JSON round-trip
// is sufficient today. It is centralized here so every copy path (store
// duplicatePage, library duplicate) uses the SAME strategy -- previously one
// path used JSON.parse(JSON.stringify()) and another used Object.assign,
// which meant a future field could survive one path and vanish in the other.
// `reid` (default true) assigns fresh ids to the page and every nested
// image/textBox so the copy can never collide with the original.
function zfDeepCopyPage(page, reid) {
  var copy = JSON.parse(JSON.stringify(page || {}));
  if (reid === false) return copy;
  copy.id = 'p' + Math.random().toString(36).slice(2, 9);
  if (Array.isArray(copy.images)) {
    copy.images = copy.images.map(function (im) {
      im.id = zfNewImageId();
      return im;
    });
  }
  if (Array.isArray(copy.textBoxes)) {
    copy.textBoxes = copy.textBoxes.map(function (tb) {
      tb.id = zfNewTextBoxId();
      return tb;
    });
  }
  copy.activeImageId = null;
  copy.activeTextBoxId = null;
  return copy;
}

// -------- Numeric clamp helper --------
// Shared by setMargin/setPrinterSafety/setSafeEdge AND by the loaders
// (import, library load, shared link). Loaders previously assigned raw
// numbers, so a hand-edited file with marginIn: 500 produced a broken
// layout. This keeps every write in range.
function zfClampNumber(value, min, max, fallback) {
  var n = Number(value);
  if (isNaN(n)) return fallback;
  if (n < min) n = min;
  if (n > max) n = max;
  return Math.round(n * 100) / 100;
}

// -------- Page migration --------
function zfMigratePage(page) {
  if (!page) return page;
  if (!Array.isArray(page.images)) page.images = [];
  if (!Array.isArray(page.textBoxes)) page.textBoxes = [];
  if (page.image && !page.images.length) {
    page.images.push({
      id: zfNewImageId(),
      src: page.image,
      x: (typeof page.imageX === "number") ? page.imageX : 0,
      y: (typeof page.imageY === "number") ? page.imageY : 0,
      w: (typeof page.imageW === "number") ? page.imageW : 1.5,
      rot: (typeof page.imageRot === "number") ? page.imageRot : 0,
      wrap: page.imageWrap || 'free'
    });
  }
  for (var ii = 0; ii < page.images.length; ii++) {
    if (!page.images[ii].kind) page.images[ii].kind = 'photo';
  }
  // Migrate a legacy fixed page heading into a placed, movable title text box.
  // Runs once per page (guarded by _headingMigrated). The title becomes a
  // free element the user can drag, resize, or remove like any other box.
  if (page.heading && !page._headingMigrated) {
    page.textBoxes.push({
      id: zfNewTextBoxId(),
      kind: '',
      role: 'title',
      html: page.heading,
      x: 0.1,
      y: 0.1,
      w: 2.55,
      rot: 0,
      fontSize: 1.6,
      z: 10,
      hidden: false
    });
    page._headingMigrated = true;
  }
  return page;
}
function zfMigrateAllPages(pages) {
  if (!Array.isArray(pages)) return pages;
  for (var i = 0; i < pages.length; i++) zfMigratePage(pages[i]);
  return pages;
}

// -------- HTML sanitization --------
// Inline formatting we keep as-is, and structural list tags we also keep.
// Lists are allowed because flattening them (the old behavior for any
// disallowed tag) collapsed <li> items into one unbroken string with no
// line breaks -- pasting a bulleted list lost all its structure.
var ZF_ALLOWED_TAGS = { STRONG: 1, B: 1, EM: 1, I: 1, U: 1, S: 1, STRIKE: 1, BR: 1, DIV: 1, P: 1, SPAN: 1, FONT: 1, UL: 1, OL: 1, LI: 1 };
// Tags we keep as structure but whose own attributes we drop (e.g. <ul>).
// The allowlist above already restricts which tags survive; this set just
// documents which ones are structural rather than inline formatting.
// Only these color forms are allowed through, so a pasted/typed style can
// never smuggle a url(), expression(), or other CSS.
var ZF_COLOR_RE = /^(#[0-9a-fA-F]{3,8}|rgba?\([0-9.,\s%]+\)|[a-zA-Z]{3,20})$/;
function zfSafeColor(val) {
  if (!val) return '';
  var v = String(val).trim();
  return ZF_COLOR_RE.test(v) ? v : '';
}

// Inline style properties we preserve through sanitization, with a strict
// value pattern for each. Anything not listed here (or whose value does not
// match) is dropped. Kept deliberately narrow so a pasted/imported style can
// never smuggle url(), expression(), javascript:, or other active CSS.
var ZF_SAFE_STYLE_PROPS = {
  'font-size':   /^[0-9.]+(em|rem|pt|px|%)$/,
  'font-weight': /^(normal|bold|bolder|lighter|[1-9]00)$/,
  'font-style':  /^(normal|italic|oblique)$/,
  'text-align':  /^(left|right|center|justify)$/,
  'line-height': /^[0-9.]+(em|rem|pt|px|%)?$/,
  'font-family': /^[a-zA-Z0-9 ,'"-]+$/,
  'color':       /^(#[0-9a-fA-F]{3,8}|rgba?\([0-9.,\s%]+\)|[a-zA-Z]{3,20})$/
};

// Parse an inline style string and return only the safe, validated
// declarations as a rebuilt "prop: value; ..." string. Returns '' if none.
function zfSafeInlineStyle(styleText) {
  if (!styleText) return '';
  var out = [];
  var parts = String(styleText).split(';');
  for (var i = 0; i < parts.length; i++) {
    var decl = parts[i];
    var colon = decl.indexOf(':');
    if (colon < 0) continue;
    var prop = decl.slice(0, colon).trim().toLowerCase();
    var val = decl.slice(colon + 1).trim();
    var re = ZF_SAFE_STYLE_PROPS[prop];
    if (re && re.test(val)) out.push(prop + ': ' + val);
  }
  return out.join('; ');
}

function zfSanitizeHtml(html) {
  if (!html) return '';
  var tmp = document.createElement('div');
  tmp.innerHTML = html;
  function walk(node) {
    var children = Array.prototype.slice.call(node.childNodes);
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      if (child.nodeType === 3) continue;
      if (child.nodeType !== 1) {
        node.removeChild(child);
        continue;
      }
      var tag = child.tagName;
      if (!ZF_ALLOWED_TAGS[tag]) {
        // Disallowed tag: replace it with its text, but recurse into its
        // children first so nested allowed tags (e.g. <a><b>x</b></a>)
        // keep their formatting instead of being flattened to plain text.
        // For the common case of <a href="...">label</a>, this drops the
        // link but keeps <b>/<i> emphasis inside the label.
        var frag = document.createDocumentFragment();
        while (child.firstChild) frag.appendChild(child.firstChild);
        walk(frag);
        node.replaceChild(frag, child);
        continue;
      }
      // Capture a SAFE SUBSET of inline styles BEFORE stripping attributes,
      // since the removal below would otherwise delete them. This preserves
      // font-size, font-weight, text-align, line-height, font-family and
      // color through a save/load round trip -- previously ALL inline styles
      // were dropped, so enlarged/bold text in bodies and text boxes came
      // back at the base size (a number typed big printed as a tiny speck).
      // Each value is validated against a strict pattern (zfSafeInlineStyle),
      // so no active CSS can survive.
      var keepStyle = zfSafeInlineStyle(child.getAttribute('style'));
      var keepColor = '';
      if (tag === 'FONT') {
        keepColor = zfSafeColor(child.getAttribute('color'));
      }
      var attrs = Array.prototype.slice.call(child.attributes || []);
      for (var j = 0; j < attrs.length; j++) {
        child.removeAttribute(attrs[j].name);
      }
      // Re-apply the validated styles. FONT keeps its legacy color attr.
      if (keepStyle) {
        child.setAttribute('style', keepStyle);
      }
      if (keepColor && tag === 'FONT') {
        child.setAttribute('color', keepColor);
      }
      walk(child);
    }
  }
  walk(tmp);
  return tmp.innerHTML;
}

function zfHtmlToText(html) {
  if (!html) return '';
  var tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || '';
}

function zfStripSpacers(html) {
  if (!html) return '';
  var tmp = document.createElement('div');
  tmp.innerHTML = html;
  var sp = tmp.querySelectorAll('[data-zf-spacer="1"]');
  for (var i = 0; i < sp.length; i++) sp[i].remove();
  return tmp.innerHTML;
}

// -------- Image dimension cache --------
var ZF_IMG_CACHE = {};
function zfGetImageSize(src, cb) {
  if (!src) { cb({ w: 1, h: 1 }); return; }
  if (ZF_IMG_CACHE[src]) { cb(ZF_IMG_CACHE[src]); return; }
  var img = new Image();
  img.onload = function () {
    var size = { w: img.naturalWidth, h: img.naturalHeight };
    ZF_IMG_CACHE[src] = size;
    cb(size);
  };
  img.onerror = function () { cb({ w: 1, h: 1 }); };
  img.src = src;
}

// -------- Image compression --------
// Downscales to at most maxSide px on the longest edge. Preserves
// transparency: PNG if the source has alpha, JPEG otherwise.
function zfCompressImageSync(img, maxSide, quality, c) {
  var w = img.naturalWidth || img.width;
  var h = img.naturalHeight || img.height;
  var scale = Math.min(1, maxSide / Math.max(w, h));
  var nw = Math.max(1, Math.round(w * scale));
  var nh = Math.max(1, Math.round(h * scale));
  c.width = nw;
  c.height = nh;
  var ctx = c.getContext('2d');
  ctx.clearRect(0, 0, nw, nh);
  ctx.drawImage(img, 0, 0, nw, nh);
  var hasAlpha = false;
  try {
    var data = ctx.getImageData(0, 0, nw, nh).data;
    for (var i = 3; i < data.length; i += 4) {
      if (data[i] < 255) { hasAlpha = true; break; }
    }
  } catch (e) {
    hasAlpha = false;
  }
  try {
    if (hasAlpha) return c.toDataURL('image/png');
    return c.toDataURL('image/jpeg', quality);
  } catch (e) {
    console.warn('toDataURL failed', e);
    return img.src;
  }
}

function zfCompressImageAsync(dataUrl, maxSide, quality, cb) {
  var img = new Image();
  img.onload = function () {
    var c = document.createElement('canvas');
    cb(zfCompressImageSync(img, maxSide, quality, c));
  };
  img.onerror = function () { cb(dataUrl); };
  img.src = dataUrl;
}

// -------- Shared element style computation --------
// These functions produce view-agnostic styles: positions are percent of
// the mini-page (so they scale automatically with the rendered page size),
// widths are percent, and icon font-sizes are in em (so they inherit the
// mini-page's font-size, which itself scales with --zf-page-scale). Every
// view (editor, reader, sheet) uses the same function so they cannot drift.
//
// Args:
//   el        - an image/icon record: { kind, x, y, w, rot, z, color }
//   pageW     - mini-page width in inches (from the model)
//   pageH     - mini-page height in inches (from the model)
//   margin    - page margin in inches (store.marginIn)
//   wrap      - optional boolean, true for block-mode (fills width)
//
// The mini-page's base font-size in px is owned by CSS (the unitless
// --zf-page-base-px custom property on .zf-mini-page). We read it here so
// the two never drift. Cached after the first successful read; falls back
// to the historical 13.333 (10pt @ 96dpi) if it is unavailable.
var ZF_PAGE_BASE_PX_CACHE = null;
function zfPageBasePx() {
  if (ZF_PAGE_BASE_PX_CACHE !== null) return ZF_PAGE_BASE_PX_CACHE;
  var fallback = 13.333;
  try {
    var probe = document.querySelector('.zf-mini-page');
    if (!probe) return fallback;
    var raw = getComputedStyle(probe).getPropertyValue('--zf-page-base-px');
    var n = parseFloat(raw);
    if (!isNaN(n) && n > 0) ZF_PAGE_BASE_PX_CACHE = n;
  } catch (e) {}
  return (ZF_PAGE_BASE_PX_CACHE !== null) ? ZF_PAGE_BASE_PX_CACHE : fallback;
}
function zfElementStyle(el, pageW, pageH, margin, opts) {
  if (!el) return {};
  opts = opts || {};
  var x = (typeof el.x === "number" ? el.x : 0) + margin;
  var y = (typeof el.y === "number" ? el.y : 0) + margin;
  var w = (typeof el.w === "number" ? el.w : 1.5);
  var rot = (typeof el.rot === "number" ? el.rot : 0);
  var z = (typeof el.z === "number" ? el.z : 0);

  // Block-mode images (image above text) do not use x/y positioning; they
  // flow in the flex column. Just give them a width and margin.
  if (opts.block) {
    var bs = {
      width: (w / pageW * 100).toFixed(4) + "%",
      maxWidth: "100%",
      marginBottom: "0.5rem",
      transform: "rotate(" + rot + "deg)",
      transformOrigin: "center center"
    };
    if (el.kind === "icon") {
      // Icon sizes are in em; the mini-page's font-size on screen is
      // zfPageBasePx() * pageScale, and 10pt in print. Factor 1.4 for
      // Phosphor's internal SVG padding so the visible glyph matches `w`
      // in inches.
      bs.fontSize = ((w / pageW) * zfPageBasePx() * 1.4).toFixed(4) + "em";
    }
    return bs;
  }

  // Free (positioned) elements use absolute positioning.
  var style = {
    position: "absolute",
    left: (x / pageW * 100).toFixed(4) + "%",
    top: (y / pageH * 100).toFixed(4) + "%",
    width: (w / pageW * 100).toFixed(4) + "%",
    transform: "rotate(" + rot + "deg)",
    transformOrigin: "center center",
    zIndex: 100 + z
  };
  if (el.kind === "icon") {
    style.fontSize = ((w / pageW) * zfPageBasePx() * 1.4).toFixed(4) + "em";
    style.height = (w / pageW * 100).toFixed(4) + "%";
  } else if (typeof el.h === "number") {
    // Decorative elements (tape, scraps) carry an explicit height, so their
    // two resize axes are independent.
    style.height = (el.h / pageH * 100).toFixed(4) + "%";
  } else {
    style.height = "auto";
  }
  if (el.kind === "icon" && el.color) style.color = el.color;
  return style;
}

// Shared style for a text box (positioned, sized, typography).
function zfTextBoxStyle(box, pageW, pageH, margin) {
  if (!box) return {};
  var x = (typeof box.x === "number" ? box.x : 0) + margin;
  var y = (typeof box.y === "number" ? box.y : 0) + margin;
  var w = (typeof box.w === "number" ? box.w : 1.8);
  var rot = (typeof box.rot === "number" ? box.rot : 0);
  var z = (typeof box.z === "number" ? box.z : 0);
  var fontSize = (typeof box.fontSize === "number" ? box.fontSize : 1.0);
  var lineHeight = (typeof box.lineHeight === "number" ? box.lineHeight : 1.35);
  var style = {
    position: "absolute",
    left: (x / pageW * 100).toFixed(4) + "%",
    top: (y / pageH * 100).toFixed(4) + "%",
    width: (w / pageW * 100).toFixed(4) + "%",
    // Text boxes with an explicit height (in inches) get a fixed height so
    // framed uses like comic panels can hold a shape; others stay auto.
    height: (typeof box.h === "number" ? (box.h / pageH * 100).toFixed(4) + "%" : "auto"),
    transform: "rotate(" + rot + "deg)",
    transformOrigin: "center center",
    fontSize: (fontSize * 100) + "%",
    lineHeight: lineHeight,
    zIndex: 100 + z
  };
  if (box.align) style.textAlign = box.align;
  if (box.color) style.color = box.color;
  if (box.fontFamily) style.fontFamily = box.fontFamily;
  return style;
}

// -------- Template refit --------
// Refit a template's pages from the page size they were authored at to a
// target model's page size, so one template works for every model. The
// template stores element positions/sizes in INCHES tuned to its native
// page box (e.g. mini-8's 2.75 x 4.25). We scale every coordinate and
// dimension by the ratio of the target page to the native page.
//
// Full-bleed images (wider than the page, negative x/y) are kept centered
// after scaling so they still bleed past all four edges on the new page.
function zfRefitPagesToSize(pages, fromW, fromH, toW, toH) {
  if (!Array.isArray(pages) || !fromW || !fromH || !toW || !toH) return pages;
  // Scale factor is "target units per source unit". The template stores
  // positions as plain numbers in the SOURCE unit (e.g. inches); the
  // renderer reads them as numbers in the TARGET unit (e.g. mm). So the
  // ratio toW/fromW DOES the unit conversion as well as the physical scale:
  //   output = input x (toW / fromW)
  // e.g. a 2.15in-wide box on an A4 (mm) page: 2.15 x (74.25 / 2.75) = 58mm,
  // which is 2.15in expressed in mm -- correct.
  //
  // NOTE: do NOT "normalize" the inputs to a common unit first -- that
  // cancels the conversion and collapses everything (text stacked one
  // letter per line, images tiny). The raw ratio is the correct formula.
  var sx = toW / fromW;
  var sy = toH / fromH;
  // Use a single scale for fonts and image widths (widths are horizontal),
  // but allow vertical positions to scale independently.
  function scaleImg(im) {
    var out = Object.assign({}, im);
    if (typeof im.w === 'number') {
      var newW = im.w * sx;
      out.w = newW;
      // Re-center horizontally: a full-bleed image on the native page has
      // x such that x + w/2 == fromW/2 (centered). Preserve that.
      if (typeof im.x === 'number') {
        out.x = (toW - newW) / 2;
      }
    }
    if (typeof im.h === 'number') out.h = im.h * sy;
    if (typeof im.y === 'number') out.y = im.y * sy;
    return out;
  }
  function scaleBox(tb) {
    var out = Object.assign({}, tb);
    if (typeof tb.x === 'number') out.x = tb.x * sx;
    if (typeof tb.y === 'number') out.y = tb.y * sy;
    if (typeof tb.w === 'number') out.w = tb.w * sx;
    if (typeof tb.h === 'number') out.h = tb.h * sy;
    // Font size is authored in em relative to the page base; scale by the
    // smaller axis ratio so text fits both dimensions.
    if (typeof tb.fontSize === 'number') out.fontSize = tb.fontSize * Math.min(sx, sy);
    return out;
  }
  return pages.map(function (p) {
    var np = Object.assign({}, p);
    if (Array.isArray(p.images)) np.images = p.images.map(scaleImg);
    if (Array.isArray(p.textBoxes)) np.textBoxes = p.textBoxes.map(scaleBox);
    return np;
  });
}

// Repeat a set of pages cyclically until there are `count` pages, giving
// each repetition fresh page ids. Used so a template's photo pages fill a
// larger model (e.g. 8 photo pages repeated to fill a 16-page booklet).
function zfRepeatPagesToCount(pages, count) {
  if (!Array.isArray(pages) || !pages.length || count <= 0) return pages || [];
  var out = [];
  for (var i = 0; i < count; i++) {
    var src = pages[i % pages.length];
    var copy = JSON.parse(JSON.stringify(src));
    copy.id = 'p' + i + '-' + Math.random().toString(36).slice(2, 7);
    out.push(copy);
  }
  return out;
}

// -------- Lorem ipsum --------
var ZF_LOREM_WORDS = ('lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ' +
  'enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit ' +
  'voluptate velit esse cillum eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt ' +
  'mollit anim id est laborum').split(' ');

function zfLorem(opts) {
  opts = opts || {};
  var targetWords = opts.words || 60;
  var targetChars = opts.chars || 380;
  var sentenceCap = opts.sentenceCap || 14;
  var out = [];
  var words = [];
  for (var i = 0; i < targetWords; i++) {
    words.push(ZF_LOREM_WORDS[Math.floor(Math.random() * ZF_LOREM_WORDS.length)]);
  }
  var start = 0;
  while (start < words.length) {
    var end = Math.min(words.length, start + (2 + Math.floor(Math.random() * sentenceCap)));
    words[start] = words[start].charAt(0).toUpperCase() + words[start].slice(1);
    var sentence = words.slice(start, end).join(' ') + '.';
    out.push(sentence);
    start = end;
  }
  var text = out.join(' ');
  if (text.length > targetChars) {
    text = text.slice(0, targetChars).replace(/\s+\S*$/, '') + '.';
  }
  return text;
}