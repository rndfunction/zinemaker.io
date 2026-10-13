// Zine Forge - zine model registry
// A "model" describes the imposition: how N zine pages map onto one printed sheet.
// Slots use normalized grid coords with {col, row} indexing a sheet divided into
// (maxCol+1) columns and (maxRow+1) rows. Rotation is degrees clockwise.
//
// Classic W-fold mini-zine (from the Origami Mini-Zine instructions):
//   - Landscape US Letter sheet (11 x 8.5)
//   - 4 columns x 2 rows = 8 slots
//   - Top row printed upside-down (pages 5, 4, 3, 2)
//   - Bottom row printed upright (pages 6, 7, 8, 1)
//   - Mini-pages come out portrait, roughly 2.75" wide x 4.25" tall

(function () {
  var MODELS = [
    {
      id: 'mini-8',
      label: '8-page mini zine (1 sheet, US Letter)',
      // Landscape US Letter. Content is printed at 90 degrees relative to the
      // sheet's natural orientation, which is why the top row is rotated 180.
      paper: { width: 11, height: 8.5, unit: 'in', orientation: 'landscape' },
      // Each mini-page after folding and cutting is portrait, roughly 2.75 x 4.25.
      page: { width: 2.75, height: 4.25, unit: 'in' },
      pagesPerSheet: 8,
      sides: 1,
      slots: [
        { page: 5, col: 0, row: 0, rotation: 180 },
        { page: 4, col: 1, row: 0, rotation: 180 },
        { page: 3, col: 2, row: 0, rotation: 180 },
        { page: 2, col: 3, row: 0, rotation: 180 },
        { page: 6, col: 0, row: 1, rotation: 0 },
        { page: 7, col: 1, row: 1, rotation: 0 },
        { page: 8, col: 2, row: 1, rotation: 0 },
        { page: 1, col: 3, row: 1, rotation: 0 }
      ],
      // Soft content budget for a 2.75 x 4.25 mini-page with tight (0.1in)
      // margins. At 10pt serif, 1.3 line-height, roughly 40 chars per line.
      // Budget is 23 lines (not 24) to leave room for text descenders
      // (g, j, p, q, y) that hang below the last baseline and would
      // otherwise be clipped by the mini-page's overflow boundary.
      budget: { chars: 900, lines: 23, words: 150 },
      guides: [
        { type: 'fold', axis: 'v', pos: 25 },
        { type: 'fold', axis: 'v', pos: 50 },
        { type: 'fold', axis: 'v', pos: 75 },
        { type: 'fold', axis: 'h', pos: 50 },
        { type: 'cut', axis: 'h', pos: 50, from: 25, to: 75 }
      ],
      instructions: [
        'Print this sheet in landscape, single-sided, at 100% (no scaling).',
        'Fold in half (mountain fold), then unfold.',
        'Fold both edges to the center line, then unfold. The sheet now has 4 columns.',
        'Fold in half lengthwise, then unfold. The sheet now has 2 rows.',
        'Cut between 3 & 8 and between 4 & 7 (between the two center columns).',
        'Push pages 4 & 3 and 7 & 8 away from one another, then pull the ends together at the arrows.',
        'Fold page 1 to the front and page 8 to the back. Done.'
      ]
    },
    {
      id: 'mini-8-a4',
      label: '8-page mini zine (1 sheet, A4)',
      paper: { width: 297, height: 210, unit: 'mm', orientation: 'landscape' },
      page: { width: 74.25, height: 105, unit: 'mm' },
      pagesPerSheet: 8,
      sides: 1,
      slots: [
        { page: 5, col: 0, row: 0, rotation: 180 },
        { page: 4, col: 1, row: 0, rotation: 180 },
        { page: 3, col: 2, row: 0, rotation: 180 },
        { page: 2, col: 3, row: 0, rotation: 180 },
        { page: 6, col: 0, row: 1, rotation: 0 },
        { page: 7, col: 1, row: 1, rotation: 0 },
        { page: 8, col: 2, row: 1, rotation: 0 },
        { page: 1, col: 3, row: 1, rotation: 0 }
      ],
      guides: [
        { type: 'fold', axis: 'v', pos: 25 },
        { type: 'fold', axis: 'v', pos: 50 },
        { type: 'fold', axis: 'v', pos: 75 },
        { type: 'fold', axis: 'h', pos: 50 },
        { type: 'cut', axis: 'h', pos: 50, from: 25, to: 75 }
      ],
      budget: { chars: 900, lines: 23, words: 150 },
      instructions: [
        'Print this sheet in landscape, single-sided, at 100% (no scaling).',
        'Fold in half (mountain fold), then unfold.',
        'Fold both edges to the center line, then unfold. The sheet now has 4 columns.',
        'Fold in half lengthwise, then unfold. The sheet now has 2 rows.',
        'Cut between 3 & 8 and between 4 & 7 (between the two center columns).',
        'Push pages 4 & 3 and 7 & 8 away from one another, then pull the ends together.',
        'Fold page 1 to the front and page 8 to the back. Done.'
      ]
    },
    {
      id: 'single-page',
      label: 'Single-page zine (1 sheet = 1 page)',
      paper: { width: 8.5, height: 11, unit: 'in', orientation: 'portrait' },
      page: { width: 8.5, height: 11, unit: 'in' },
      pagesPerSheet: 1,
      sides: 1,
      slots: [
        { page: 1, col: 0, row: 0, rotation: 0 }
      ],
      budget: { chars: 5500, lines: 90, words: 900 },
      guides: [],
      instructions: [
        'Print as a standard portrait page. One printed page equals one zine page.'
      ]
    },
    {
      id: 'mini-16',
      label: '16-page mini zine (1 sheet, 2 sides, US Letter)',
      // SAME W-fold geometry as mini-8, printed DOUBLE-SIDED and stapled.
      // The 4x4 / central-slit method used previously was a different sheet
      // topography entirely and has been retired; this model now branches
      // directly off the verified mini-8 fold.
      //
      //   - PRINT LANDSCAPE, double-sided, flip on the LONG edge, at 100%.
      //   - Front cells carry pages 1-8 (mini-8's pattern).
      //   - Back cells carry pages 9-16, arranged so each back page is the
      //     leaf-mate of the front page it shares paper with.
      //   - Fold and cut exactly as mini-8, then staple the spine.
      //
      // IMPOSITION STATUS: The slot->page mapping below is a FIRST GUESS.
      // Pages 1-8 (front) are verified mini-8. Pages 9-16 (back) are a
      // mirrored guess pending a single test print. If the folded order is
      // wrong, only the `page` values in slotsBack change; the geometry is
      // fixed. Use the keyboard test-sheet helper to verify.
      paper: { width: 11, height: 8.5, unit: 'in', orientation: 'landscape' },
      // Same mini-page size as mini-8 after folding: ~2.75 x 4.25 portrait.
      page: { width: 2.75, height: 4.25, unit: 'in' },
      // Cells per side is 8 (see slots); pagesPerSheet is DERIVED as
      // cells * sides = 16. Kept here for readability.
      pagesPerSheet: 16,
      sides: 2,
      // SHORT-edge flip: verified on a real print. In landscape, flipping
      // on the short edge makes the back register correctly.
      flip: 'short',
      binding: 'staple',
      // Imposition DERIVED from a physical test print. The fold permutation
      // (which flat cell lands at which flip position) was read off the
      // printed sheet, then pages were assigned so the booklet reads
      // 1,2,3,...,16 as you flip through it. This differs from mini-8's
      // front, because a 16-page booklet distributes pages across BOTH
      // sides rather than putting all 8 front pages on one side.
      // Front (rot 180 = top row, printed upside-down):
      slots: [
        { page: 4, col: 3, row: 0, rotation: 180 },
        { page: 5, col: 2, row: 0, rotation: 180 },
        { page: 8, col: 1, row: 0, rotation: 180 },
        { page: 9, col: 0, row: 0, rotation: 180 },
        { page: 12, col: 0, row: 1, rotation: 0 },
        { page: 13, col: 1, row: 1, rotation: 0 },
        { page: 16, col: 2, row: 1, rotation: 0 },
        { page: 1, col: 3, row: 1, rotation: 0 }
      ],
      // Back:
      slotsBack: [
        { page: 3, col: 0, row: 0, rotation: 180 },
        { page: 6, col: 1, row: 0, rotation: 180 },
        { page: 7, col: 2, row: 0, rotation: 180 },
        { page: 10, col: 3, row: 0, rotation: 180 },
        { page: 2, col: 0, row: 1, rotation: 0 },
        { page: 15, col: 1, row: 1, rotation: 0 },
        { page: 14, col: 2, row: 1, rotation: 0 },
        { page: 11, col: 3, row: 1, rotation: 0 }
      ],
      // Same mini-page size as mini-8, so SAME budget.
      budget: { chars: 900, lines: 23, words: 150 },
      // Guides for the 16-page fold. The center lines are CUTS (not folds):
      // you cut the sheet into quarters along the center vertical and
      // center horizontal, then fold along the two outer vertical creases
      // (v25, v75). Showing a fold and a cut on the same line was confusing,
      // so the center is a cut only. The horizontal cut is FULL width (no
      // from/to = full span); the vertical cut is FULL height.
      guides: [
        { type: 'fold', axis: 'v', pos: 25 },
        { type: 'fold', axis: 'v', pos: 75 },
        { type: 'cut', axis: 'h', pos: 50 },
        { type: 'cut', axis: 'v', pos: 50 }
      ],
      instructions: [
        'Print LANDSCAPE, double-sided, flipping on the SHORT edge, at 100%.',
        'Fold in half (mountain fold), then unfold.',
        'Fold both edges to the center line, then unfold. The sheet now has 4 columns.',
        'Fold in half lengthwise, then unfold. The sheet now has 2 rows.',
        'Cut between 3 & 8 and between 4 & 7 (between the two center columns).',
        'Push pages 4 & 3 and 7 & 8 away from one another, then pull the ends together.',
        'Fold page 1 to the front. Staple twice along the spine to bind the 16-page booklet.',
        'Flip the booklet over to read pages 9-16. Done.'
      ]
    },
    {
      id: 'mini-16-a4',
      label: '16-page mini zine (1 sheet, 2 sides, A4)',
      // A4 equivalent of mini-16. SAME fold geometry, imposition, flip and
      // binding as the US-Letter mini-16 -- only the paper and page sizes
      // differ (metric). Kept in sync with mini-16 by hand; if you change
      // the imposition on one, change it on the other.
      paper: { width: 297, height: 210, unit: 'mm', orientation: 'landscape' },
      page: { width: 74.25, height: 105, unit: 'mm' },
      pagesPerSheet: 16,
      sides: 2,
      flip: 'short',
      binding: 'staple',
      // Front (rot 180 = top row, printed upside-down):
      slots: [
        { page: 4, col: 3, row: 0, rotation: 180 },
        { page: 5, col: 2, row: 0, rotation: 180 },
        { page: 8, col: 1, row: 0, rotation: 180 },
        { page: 9, col: 0, row: 0, rotation: 180 },
        { page: 12, col: 0, row: 1, rotation: 0 },
        { page: 13, col: 1, row: 1, rotation: 0 },
        { page: 16, col: 2, row: 1, rotation: 0 },
        { page: 1, col: 3, row: 1, rotation: 0 }
      ],
      // Back:
      slotsBack: [
        { page: 3, col: 0, row: 0, rotation: 180 },
        { page: 6, col: 1, row: 0, rotation: 180 },
        { page: 7, col: 2, row: 0, rotation: 180 },
        { page: 10, col: 3, row: 0, rotation: 180 },
        { page: 2, col: 0, row: 1, rotation: 0 },
        { page: 15, col: 1, row: 1, rotation: 0 },
        { page: 14, col: 2, row: 1, rotation: 0 },
        { page: 11, col: 3, row: 1, rotation: 0 }
      ],
      budget: { chars: 900, lines: 23, words: 150 },
      // Center lines are CUTS; outer verticals are folds. Same as mini-16.
      guides: [
        { type: 'fold', axis: 'v', pos: 25 },
        { type: 'fold', axis: 'v', pos: 75 },
        { type: 'cut', axis: 'h', pos: 50 },
        { type: 'cut', axis: 'v', pos: 50 }
      ],
      instructions: [
        'Print LANDSCAPE, double-sided, flipping on the SHORT edge, at 100%.',
        'Fold in half (mountain fold), then unfold.',
        'Fold both edges to the center line, then unfold. The sheet now has 4 columns.',
        'Fold in half lengthwise, then unfold. The sheet now has 2 rows.',
        'Cut along the center vertical and center horizontal lines (the + cut).',
        'Fold along the two outer vertical creases.',
        'Fold page 1 to the front. Staple twice along the spine to bind the 16-page booklet.',
        'Flip the booklet over to read the rest. Done.'
      ]
    },
    {
      id: 'half-fold-4',
      label: '4-page half-fold (1 sheet, 2 sides)',
      // Landscape letter, folded once across the middle into a half-letter
      // booklet. Two half-letter pages per side, printed on both sides.
      paper: { width: 11, height: 8.5, unit: 'in', orientation: 'landscape' },
      page: { width: 5.5, height: 8.5, unit: 'in' },
      pagesPerSheet: 2,
      sides: 2,
      // Front (outside): back cover on the left, front cover on the right.
      slots: [
        { page: 4, col: 0, row: 0, rotation: 0 },
        { page: 1, col: 1, row: 0, rotation: 0 }
      ],
      // Back (inside): pages 2 and 3.
      slotsBack: [
        { page: 2, col: 0, row: 0, rotation: 0 },
        { page: 3, col: 1, row: 0, rotation: 0 }
      ],
      guides: [
        { type: 'fold', axis: 'v', pos: 50 }
      ],
      budget: { chars: 2600, lines: 42, words: 420 },
      instructions: [
        'Print double-sided, flipping on the SHORT edge, landscape, at 100%.',
        'Fold the sheet in half across the middle so page 1 is the front cover.',
        'Page 2 is inside-left, page 3 is inside-right, page 4 is the back cover.'
      ]
    },
    {
      id: 'mini-16-accordion',
      label: '16-page accordion (1 sheet, 1 side, no staples)',
      // Single-sided 4x4 accordion fold. Cut the sheet into 4 horizontal
      // strips (they stay connected), then accordion-fold. No staples and
      // no double-sided printing -- the whole booklet is one face.
      //
      // Layout (landscape 11x8.5, 4 cols x 4 rows). Covers are counted as
      // pages 1 and 16 so every cell maps to a real page.
      //
      //   row A (top):    16  15  14  13
      //   row B:           9  10  11  12
      //   row C:           8   7   6   5
      //   row D (bottom):  1   2   3   4
      //
      // Reading order serpentines up the sheet: D left->right, C right->left,
      // B left->right, A right->left. Rows alternate orientation (1st and
      // 3rd right-side-up, 2nd and 4th upside-down) per the source diagram.
      //
      // IMPOSITION STATUS: mapping and rotations are a best-effort read of a
      // reference diagram, NOT yet verified on paper. Print, fold, and read;
      // if the order is wrong, only the `page`/`rotation` values change.
      paper: { width: 11, height: 8.5, unit: 'in', orientation: 'landscape' },
      // 4x4 grid on an 11x8.5 sheet => each panel is 2.75 x 2.125 (landscape).
      page: { width: 2.75, height: 2.125, unit: 'in' },
      pagesPerSheet: 16,
      sides: 1,
      binding: 'none',
      // Zero page margin: the mini-page IS the folded panel, so any inset
      // would make edge panels a different effective size than interior
      // ones and the accordion would not fold flush. noSafeEdge disables the
      // printer safe-edge padding for the same reason (it would add
      // asymmetric inset to edge panels).
      marginIn: 0,
      noSafeEdge: true,
      slots: [
        // row A (top), left->right: 16,15,14,13 -- printed upside-down
        { page: 16, col: 0, row: 0, rotation: 180 },
        { page: 15, col: 1, row: 0, rotation: 180 },
        { page: 14, col: 2, row: 0, rotation: 180 },
        { page: 13, col: 3, row: 0, rotation: 180 },
        // row B: 9,10,11,12 -- right-side-up
        { page: 9, col: 0, row: 1, rotation: 0 },
        { page: 10, col: 1, row: 1, rotation: 0 },
        { page: 11, col: 2, row: 1, rotation: 0 },
        { page: 12, col: 3, row: 1, rotation: 0 },
        // row C: 8,7,6,5 -- printed upside-down
        { page: 8, col: 0, row: 2, rotation: 180 },
        { page: 7, col: 1, row: 2, rotation: 180 },
        { page: 6, col: 2, row: 2, rotation: 180 },
        { page: 5, col: 3, row: 2, rotation: 180 },
        // row D (bottom): 1,2,3,4 -- right-side-up
        { page: 1, col: 0, row: 3, rotation: 0 },
        { page: 2, col: 1, row: 3, rotation: 0 },
        { page: 3, col: 2, row: 3, rotation: 0 },
        { page: 4, col: 3, row: 3, rotation: 0 }
      ],
      // Three horizontal cuts between the four strips. They stay connected
      // after cutting (the cuts separate strips, they do not detach them).
      // Fold lines at every interior grid line (the 4x4 cell boundaries),
      // and cut lines at the three horizontal strip boundaries. The cuts are
      // PARTIAL -- each spans a different range of columns so the strips
      // stay connected (alternating), which is what makes the accordion
      // hold together without staples:
      //   top cut    (pos 25): columns 1-3  -> from 0% to 75%
      //   middle cut (pos 50): columns 2-4  -> from 25% to 100%
      //   bottom cut (pos 75): columns 1-3  -> from 0% to 75%
      guides: [
        { type: 'fold', axis: 'v', pos: 25 },
        { type: 'fold', axis: 'v', pos: 50 },
        { type: 'fold', axis: 'v', pos: 75 },
        { type: 'fold', axis: 'h', pos: 25 },
        { type: 'fold', axis: 'h', pos: 50 },
        { type: 'fold', axis: 'h', pos: 75 },
        { type: 'cut', axis: 'h', pos: 25, from: 0,  to: 75 },
        { type: 'cut', axis: 'h', pos: 50, from: 25, to: 100 },
        { type: 'cut', axis: 'h', pos: 75, from: 0,  to: 75 }
      ],
      budget: { chars: 700, lines: 14, words: 100 },
      instructions: [
        'Print this sheet ONE SIDE ONLY, landscape, at 100%.',
        'Cut along the three horizontal lines to make four connected strips.',
        'Fold the strips accordion-style (mountain/valley alternating) so the panels stack.',
        'Fold the inside front cover (page 1) face to face with page 2.',
        'Continue folding back-to-back / face-to-face in page order.',
        'Tuck the blank ends into the cover pocket to finish. No staples needed.'
      ]
    }
  ];

  function getModel(id) {
    for (var i = 0; i < MODELS.length; i++) {
      if (MODELS[i].id === id) return MODELS[i];
    }
    return MODELS[0];
  }

  // ---- Geometry primitives ----
  // pagesPerSheet is DERIVED, not hardcoded: it is the number of zine pages
  // one physical sheet produces, i.e. (cells per side) x (number of sides).
  // A model may still declare pagesPerSheet explicitly for legacy reasons,
  // but derivePagesPerSheet() is the source of truth and matches it.
  // This is what lets a 1-sided W-fold (8 cells, 8 pages) and a 2-sided
  // W-fold (8 cells x 2 sides, 16 pages) share the SAME grid geometry.
  function cellsPerSide(model) {
    if (!model || !model.slots) return 0;
    return model.slots.length;
  }

  function modelSides(model) {
    if (!model) return 1;
    return (typeof model.sides === 'number' && model.sides > 0) ? model.sides : 1;
  }

  function derivePagesPerSheet(model) {
    var cells = cellsPerSide(model);
    if (!cells) return (model && model.pagesPerSheet) ? model.pagesPerSheet : 1;
    return cells * modelSides(model);
  }

  // Models flagged `experimental: true` have an UNVERIFIED imposition --
  // the slot page-numbers may need a one-time correction after a test
  // print (see the mini-16 comments above). They are hidden from the user
  // facing New Zine / Settings dropdowns until verified, but remain
  // resolvable by getModel() so an existing project that already uses one
  // keeps working and does not silently fall back to mini-8.
  function isExperimental(model) {
    return !!(model && model.experimental);
  }

  // Models safe to show in a picker: everything except experimental ones.
  function listSelectableModels() {
    return MODELS.filter(function (m) { return !isExperimental(m); });
  }

  function listModels() {
    return MODELS.slice();
  }

  function minimumPages(model) {
    return derivePagesPerSheet(model);
  }

  function requiredPageCount(model, sheets) {
    return derivePagesPerSheet(model) * Math.max(1, sheets);
  }

  // How many slots wide/tall is the grid for this model?
  function gridSize(model) {
    var cols = 1, rows = 1;
    model.slots.forEach(function (s) {
      if (s.col + 1 > cols) cols = s.col + 1;
      if (s.row + 1 > rows) rows = s.row + 1;
    });
    return { cols: cols, rows: rows };
  }

  function slotRect(model, slot) {
    var g = gridSize(model);
    var w = 100 / g.cols;
    var h = 100 / g.rows;
    return {
      left: (slot.col * w) + '%',
      top: (slot.row * h) + '%',
      width: w + '%',
      height: h + '%'
    };
  }

  function contentBudget(model) {
    return model && model.budget ? model.budget : null;
  }

  function countWords(text) {
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(function (w) { return w.length > 0; }).length;
  }

  function countLines(text) {
    if (!text) return 0;
    return text.split(/\n/).length;
  }

  window.ZFModels = {
    getModel: getModel,
    isExperimental: isExperimental,
    listSelectableModels: listSelectableModels,
    listModels: listModels,
    minimumPages: minimumPages,
    requiredPageCount: requiredPageCount,
    pagesPerSheet: derivePagesPerSheet,
    cellsPerSide: cellsPerSide,
    sides: modelSides,
    gridSize: gridSize,
    slotRect: slotRect,
    contentBudget: contentBudget,
    countWords: countWords,
    countLines: countLines
  };
})();