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

  if (typeof zfAssertDeps === 'function') zfAssertDeps('zf-editor', ['ZF_STORE', 'zfGetImageSize', 'zfCompressImageAsync', 'zfCompressImageSync']);

  var store = window.ZF_STORE;

  // Legacy: single-image injector. Kept for callers that haven't been
  // migrated to the merged flow yet. (The sheet and reader modules have
  // their own copies in the current codebase; this version is only for the
  // editor's import path, which never calls it today, but we keep it to
  // match the original file exactly.)
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
  window.zfCompressAndPlace = zfCompressAndPlace;
})();