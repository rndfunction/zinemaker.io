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
    }
  ];

  function getModel(id) {
    for (var i = 0; i < MODELS.length; i++) {
      if (MODELS[i].id === id) return MODELS[i];
    }
    return MODELS[0];
  }

  function listModels() {
    return MODELS.slice();
  }

  function minimumPages(model) {
    return model.pagesPerSheet;
  }

  function requiredPageCount(model, sheets) {
    return model.pagesPerSheet * Math.max(1, sheets);
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
    listModels: listModels,
    minimumPages: minimumPages,
    requiredPageCount: requiredPageCount,
    gridSize: gridSize,
    slotRect: slotRect,
    contentBudget: contentBudget,
    countWords: countWords,
    countLines: countLines
  };
})();