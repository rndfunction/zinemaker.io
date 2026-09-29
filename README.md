# Zine Forge

Make and share printable zines in the browser.

Zine Forge is a single-page web app for laying out **mini zines** -- the
fold-and-cut booklet format you make from one sheet of paper. You write
pages in an editor, pick a model (how many pages fit on a sheet), choose a
theme, and print. The app handles the imposition: which page goes where on
the sheet, rotated and arranged so that when you fold and cut, the pages
read in order.

## What it does

- **Editor** -- write pages, add images, icons, and positioned text boxes,
  set margins, and see page-space budgets.
- **Read** -- flip through your zine as a reader would.
- **Print** -- preview the imposed sheet exactly as it will print, with
  fold and cut guides, then send it to the printer.
- **Library** -- save zines locally in the browser and reopen them later.
- **Share link** -- encode a zine into the URL so you can send it to
  someone else (no server needed).

Everything is client-side. Drafts autosave to `localStorage`; there is no
backend and no account.

## Running it

The app is plain HTML, CSS, and JavaScript with a few CDN dependencies
(Vue 3, Iconify, html2canvas). There is no build step.

Serve the folder with any static file server and open `index.html`:

    python3 -m http.server 8000
    # then visit http://localhost:8000

Opening `index.html` directly from disk works in most browsers, but a
local server is recommended so relative script paths resolve cleanly.

## Zine models

A **model** describes the imposition -- how N zine pages map onto one
printed sheet. Models live in `js/zine-models.js`.

A model declares:

- `paper` -- the sheet size and orientation
- `page` -- the finished mini-page size after folding
- `pagesPerSheet` -- how many zine pages fit on one sheet
- `slots` -- for each slot on the sheet: which page number goes there,
  its grid position (col/row), and its rotation
- `budget` -- a soft content budget (words / lines / chars) for one page
- `instructions` -- folding instructions shown to the user

The app currently ships an **8-page mini zine** (US Letter and A4), a
**single-page** model, and is designed so more models can be added by
extending the `MODELS` array.

**Page counts are sheet-aware.** You fill pages up to the current sheet's
capacity; once a sheet is full, the editor offers to add a whole new
sheet rather than an extra page. Pages are never destroyed when you
change models -- extra pages are kept and simply won't print.

## Project structure

    index.html                 App shell, all Vue component templates,
                               and the main application script
    css/app.css                All styles, including print styles and
                               the design tokens
    js/main.js                 Entry point (ES module)
    js/store.js                Shared reactive store
    js/util.js                 Shared helpers (sanitizing, image
                               compression, element style computation)
    js/zine-models.js          Imposition model registry
    js/zine-themes.js          Page theme registry (paper, ink, type)
    js/zine-library.js         localStorage-backed zine library
    js/components/             Vue components (shell, editor, reader,
                               icon picker)
    mockups/                   Standalone design mockups (not loaded by
                               the app): theme studies and layout
                               candidates

## Design notes

- **One renderer, three views.** The editor canvas, the reader page, and
  the printed sheet slot all render the same content inside a
  `.zf-mini-page`, so what you type matches what you read and what you
  print. A `--zf-page-scale` variable maps physical inches to the current
  on-screen size.
- **Print uses physical units.** In print, `--zf-page-scale` is reset to
  `1` so padding and type resolve to real inches and points. The page
  margin honors the user's setting via `--zf-page-margin`.
- **Safety guides.** Pages that touch a paper edge get dashed guides
  showing the printer's unreachable area, so you can keep content inside.
- **Accessibility.** High-contrast text, visible focus rings on all
  interactive controls, keyboard deletion of selected elements, and
  ARIA labeling on dialogs and toolbars.

## Browser support

Modern evergreen browsers (Chrome, Firefox, Safari, Edge). The app relies
on CSS custom properties, `contenteditable`, the Canvas API for image
compression, and `localStorage`.

## License

Add your license here.