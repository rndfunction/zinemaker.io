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

## Recent fixes

- **Multi-selection drag.** Marquee-select several elements and they now
  move together: dragging from the blue group box moves the whole
  selection, and dragging from any element's content moves the selection
  and its bounding box. Previously the box could not be grabbed and a
  content drag moved only the grabbed element, leaving the box behind.
- **Live Selection readouts.** Width and Rotation in the Selection panel
  now update continuously while you resize or rotate an element, instead
  of freezing at the value the element had when it was selected.
- **Multi-select readouts.** Group Scale % and Rotation now update live
  while you drag a group resize or rotate handle, not just when you type
  into the group inputs.
- **Locked photo aspect.** Resizing a photo keeps its frame aspect ratio
  instead of letting the frame collapse into a thin sliver. Resize now
  also has clean hard minimum and maximum sizes with no spring-back
  oscillation at the limits.
- **Calligraphy taper.** Calligraphy strokes now taper to clean points at
  both ends (with a visible minimum for very short flicks) instead of
  ending in blunt chops, and the taper is present in the live preview --
  no snap when the stroke commits.
- **Working Smoothing control.** The Smoothing setting now visibly changes
  strokes. Points are distance-decimated before Chaikin smoothing, so
  higher settings produce noticeably rounder strokes (0 = angular). Pen,
  eraser, and calligraphy all honor it, calligraphy smoothing only its
  interior so its ends stay pointed.
- **No surprise at Done.** Drawing is smoothed while you draw and the
  result is baked into the stroke on release, so the committed element
  matches the live preview instead of re-smoothing to a different shape.
- **Clear actually clears.** The drawing Clear button now empties the
  stroke data as well as the canvas pixels, so cleared ink no longer
  reappears the next time the canvas redraws.

## Running it

The app is plain HTML, CSS, and JavaScript with a few CDN dependencies
(Vue 3, Iconify, html2canvas). There is no build step.

Serve the folder with any static file server and open `index.html`:

    python3 -m http.server 8000
    # then visit http://localhost:8000

Opening `index.html` directly from disk works in most browsers, but a
local server is recommended so relative script paths resolve cleanly.

## Printing

Printing relies on a runtime-injected `@page` rule and print-specific CSS.
**Serve the app over `http://` (e.g. the local server above) when you intend
to print.** Opening the file directly from disk (`file://`) or viewing it
inside a sandboxed preview iframe can cause the browser to ignore the
injected print rules, which makes the sheet print at the wrong size or not
at all.

In the print dialog, set **Scale to 100%** and **Margins to None** so the
imposition lands at its exact physical size.

Print styles ask the browser to keep backgrounds and colors
(`print-color-adjust: exact` on the page, sheet, and body) so the sheet
prints as designed rather than in ink-saving mode. This is a request, not a
command: if your browser's **Background graphics** option is off, the
browser wins and colors are dropped. Turn it on for an exact match. The
default dialog usually keeps it on, so most users get the design with no
extra step. The sheet is sized to the
model's real paper dimensions (e.g. 11in x 8.5in for a landscape mini zine),
so any other scale shrinks or clips it.

Two-sided models (16-page mini, half-fold) print on both sides of one sheet.
The print dialog's "flip on long edge / short edge" setting matters: each
model's instructions state which edge to flip on. For the 16-page mini zine,
flip on the **short** edge.

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

    index.html                 Thin loader: CSP, CDN dependencies, and the
                               ordered list of local scripts.
    css/app.css                All styles, including print styles and
                               the design tokens
    js/util.js                 Shared helpers (HTML sanitizing, image
                               compression, element style computation,
                               drawing render, debug logging)
    js/zine-models.js          Imposition model registry
    js/zine-themes.js          Page theme registry (paper, ink, type)
    js/zine-library.js         localStorage-backed zine library
    js/zf-store.js             Shared reactive store (the app's state)
    js/zf-app-shell.js         Top-level layout and view switching
    js/zf-editor*.js           Editor: layers, drawing, and the main
                               editor component
    js/zf-reader.js            Reader view
    js/zf-sheet.js             Print / imposition sheet view
    js/zf-library-view.js      Saved-zines library view
    js/zf-boot.js              Wires everything together and mounts Vue
    js/components/ZineIconPicker.js   Icon picker modal
    js/components/ZfErrorBoundary.js  Vue error boundary
    mockups/                   Standalone design mockups (not loaded by
                               the app): theme studies and layout
                               candidates

## Data shapes

These shapes are the contract between the editor, the library, and the
exported `.zine.json` files. If you add a new per-page field, it must
survive a save/load round trip (see the note below).

**Zine record** (what `ZFLibrary.upsert` stores, and what `loadFromLibrary`
reads back):

    {
      id, title, author,
      themeId, modelId, marginIn,
      pages: [ <page>, ... ],
      updatedAt
    }

**Page:**

    {
      id,                       // regenerated on load; must be unique in-session
      images: [ <element>, ... ],   // photos, icons, tape, scraps, stickies
      textBoxes: [ <text box>, ... ]
    }

A page is a blank canvas: placed elements and positioned text boxes only.
All text lives in text boxes. (The old inline `heading`/`body` fields
are retired; see the migration note below.)

**Element** (entry in `pages[].images`): `{ id, kind, src, x, y, w, h?, rot,
z?, color?, shape?, wrap?, hidden? }`. `kind` is one of `photo`, `icon`,
`tape`, `scrap`, `sticky`, `sticker`.

**Text box** (entry in `pages[].textBoxes`): `{ id, html, x, y, w, rot,
fontSize?, lineHeight?, align?, color?, fontFamily?, z?, kind?, hidden? }`.

> **Round-trip invariant.** Page objects must be stored and loaded
> *whole*. `ZFLibrary.upsert`, `ZFLibrary.duplicate`, and
> `loadFromLibrary` must copy the full page (spreading the existing object
> and only ensuring the arrays exist) -- never rebuild a page from named
> fields. Rebuilding drops `images` and `textBoxes` silently, which
> destroys every tape strip, sticky note, icon, and positioned text box
> on save.
>
> **One-time migration.** Older zines carried an inline `heading` and
> `body` (plus legacy single-`image` fields). On load, `zfMigrateAllPages`
> in `js/util.js` converts the heading into a title text box, the body
> into a full content-area text box, and a legacy single image into an
> `images[]` element, then strips the retired fields. Migration is
> idempotent and runs once per page; after it, pages carry only
> `images`/`textBoxes` (and `groups`).

## Design notes

- **One renderer, three views.** The editor canvas, the reader page, and
  the printed sheet slot all render the same content inside a
  `.zf-mini-page`, so what you place matches what you read and what you
  print. All text is placed in text boxes; there is no separate inline
  page body. A `--zf-page-scale` variable maps physical inches to the
  current on-screen size.
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