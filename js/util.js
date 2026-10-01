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
  return page;
}
function zfMigrateAllPages(pages) {
  if (!Array.isArray(pages)) return pages;
  for (var i = 0; i < pages.length; i++) zfMigratePage(pages[i]);
  return pages;
}

// -------- HTML sanitization --------
var ZF_ALLOWED_TAGS = { STRONG: 1, B: 1, EM: 1, I: 1, U: 1, S: 1, STRIKE: 1, BR: 1, DIV: 1, P: 1, SPAN: 1, FONT: 1 };
// Only these color forms are allowed through, so a pasted/typed style can
// never smuggle a url(), expression(), or other CSS.
var ZF_COLOR_RE = /^(#[0-9a-fA-F]{3,8}|rgba?\([0-9.,\s%]+\)|[a-zA-Z]{3,20})$/;
function zfSafeColor(val) {
  if (!val) return '';
  var v = String(val).trim();
  return ZF_COLOR_RE.test(v) ? v : '';
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
        var text = document.createTextNode(child.textContent || '');
        node.replaceChild(text, child);
        continue;
      }
      // Capture a validated color BEFORE stripping attributes, since the
      // removal below would otherwise delete it.
      var keepColor = '';
      if (tag === 'SPAN') {
        var st = (child.getAttribute('style') || '');
        var m = st.match(/color\s*:\s*([^;]+)/i);
        if (m) keepColor = zfSafeColor(m[1]);
      } else if (tag === 'FONT') {
        keepColor = zfSafeColor(child.getAttribute('color'));
      }
      var attrs = Array.prototype.slice.call(child.attributes || []);
      for (var j = 0; j < attrs.length; j++) {
        child.removeAttribute(attrs[j].name);
      }
      // Re-apply the single validated color so inline text color survives.
      if (keepColor) {
        if (tag === 'SPAN') child.setAttribute('style', 'color: ' + keepColor);
        else if (tag === 'FONT') child.setAttribute('color', keepColor);
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
      // 13.333px * pageScale, and 10pt in print. Factor 1.4 for Phosphor's
      // internal SVG padding so the visible glyph matches `w` in inches.
      bs.fontSize = ((w / pageW) * 13.333 * 1.4).toFixed(4) + "em";
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
    style.fontSize = ((w / pageW) * 13.333 * 1.4).toFixed(4) + "em";
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
    height: "auto",
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