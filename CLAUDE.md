# CLAUDE.md

Hand-built static site generator. `node build.mjs` reads `content/`, renders
Markdown (markdown-it + Shiki), runs it through plain-JS string templates in
`templates/`, and writes `dist/`. Goal: **zero client-side JS** in the output
unless a feature explicitly scopes it.

## CSS: (mostly) class-less
Templates emit semantic HTML; `static/style.css` styles by **element + document
structure**, not classes. The only structural hook is `data-page` on `<body>`,
set by `layout()` and supplied by each `layout({ page })` call in `build.mjs`.
The full strategy and the two gotchas live in the header comment of
`static/style.css` — **read it before editing styles.**

Contract to preserve when adding or changing pages:
- Each page body is a single `<main>` (or `<article>` for posts).
- Give any new page type a `page:` key in its `layout()` call, then add matching
  `[data-page="…"]` rules — don't reintroduce structural classes.
- Keep classes only where they already exist (`.lede`, `.post-meta`,
  `.gallery-grid`) or for generated content (`.footnotes`, `.shiki`, `.num`).

## Quizzes (the one client-JS feature)
`static/quiz.js` defines `<quiz-set>` / `<quiz-question>` custom elements (Shadow
DOM). `layout()` auto-detects `<quiz-` in a page body and injects the script in
`<head>` **without `defer`** — so the elements register before the parser reaches
them and upgrade with no flash of the no-JS fallback. Because of that timing,
`connectedCallback` runs *before* children are parsed: each element attaches an
empty shadow root immediately (hides the light-DOM answers) and defers parse/render
to `whenReady`, with `<quiz-set>` driving its questions' init. The only quiz CSS in
`style.css` is the `:not(:defined)` fallback; everything else lives in `quiz.js`.
Authoring rules are in `README.md` and the header of `quiz.js`.

## Watch out (regressions we've hit)
- **Specificity.** Element/structural selectors outrank single-element rules, so
  flattening a class can silently override another rule. After CSS edits, verify
  positioning still wins — notably the sticky footer (`footer { margin-top: auto }`,
  which pins it to the bottom of short pages). Region centering uses
  `margin-inline`, never `margin: 0 auto`, to avoid clobbering `margin-top`.
- **Markdown leakage.** Don't scope bare elements on Markdown-bearing pages
  (posts, about, and Micro entry bodies); use child combinators (`>`) in the
  Micro rules.

## Themes
The site has three visual themes controlled by `site.theme` in `build.mjs`:
- `default` — warm serif (Literata), amber accent, custom Shiki themes (paper).
- `terminal` — monospace (JetBrains Mono everywhere), green accent, Shiki One
  Light / One Dark Pro.
- `sans` — sans-serif (Inter), indigo accent, Shiki One Light / One Dark Pro.

Each theme is a `:root` CSS variable block in `static/themes/{name}.css` that
overrides the tokens in `style.css`. The theme also selects which Google Fonts
and which Shiki highlighting themes to use (see `THEME_FONTS` in
`templates/layout.mjs` and `SHIKI_THEMES` in `build.mjs`). To add a theme:
1. Add a `static/themes/{name}.css` with `:root` + `@media (prefers-color-scheme: dark)` `:root` blocks
2. Add a font entry in `THEME_FONTS` in `templates/layout.mjs`
3. Add a Shiki entry in `SHIKI_THEMES` in `build.mjs` (or reuse existing ones)
4. Reference it from `site.theme` in `build.mjs`

## Build / verify
`npm run build`, then check `dist/`. A full rebuild is sub-second. There is no
watcher and no incremental build.
