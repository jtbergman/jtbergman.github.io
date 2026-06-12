# jtbergman.github.io

My personal site. A static site generator in a single file (`build.mjs`): reads
Markdown + JSON, renders it through plain-JS string templates with
[Shiki](https://shiki.style) syntax highlighting, and writes `dist/`.

## Commands

```bash
npm install        # one time
npm run build      # generate dist/
```

A full rebuild takes well under a second.

## Themes

Switch the site look by changing `site.theme` in `build.mjs`:

| Theme | Font | Accent | Vibe |
|---|---|---|---|
| `default` | Literata + JetBrains Mono | Amber | Warm serif |
| `terminal` | JetBrains Mono (everything) | Green | Monospace, utilitarian |
| `sans` | Inter + JetBrains Mono | Indigo | Clean, modern |

Each theme is a `:root` CSS variable block in `static/themes/{name}.css` that
overrides the tokens consumed by `static/style.css`. The theme also selects
which Google Fonts and which Shiki highlighting palette to use (see
`THEME_FONTS` in `templates/layout.mjs` and `SHIKI_THEMES` in `build.mjs`).

## Layout

```
build.mjs              The whole generator: read → transform → write.
templates/
  layout.mjs           The HTML shell (head, header/nav, footer).
  pages.mjs            One function per page type.
themes/
  paper-light.json     Custom Shiki theme (light palette).
  paper-dark.json      Custom Shiki theme (dark palette).
content/
  posts/               One Markdown file per post. Filename: YYYY-MM-DD-slug.md
  pages/               about.md (fixed page).
  gallery.json         Photo sections for the photos page.
  micro/               One Markdown file per micro entry (named by timestamp).
static/
  style.css            Structural stylesheet — element/attribute selectors only.
  themes/              CSS variable overrides, one file per theme.
  quiz.js              Custom elements for interactive quizzes.
dist/                  Generated output (safe to delete; rebuilt each run).
```

## Adding content

- **A post:** drop a Markdown file in `content/posts/` named `YYYY-MM-DD-slug.md`
  with front matter `title`, `date`, and optional `description`. It appears on
  the home page (grouped by year), gets its own page at `/slug/`, and enters
  the feed automatically.
- **A photo trip:** add a section to `content/gallery.json`. Replace the
  `picsum.photos` placeholder URLs with your own files under `static/`.
- **A micro post:** drop a Markdown file in `content/micro/` named
  `YYYY-MM-DD-HHMM.md` with front matter `date` (e.g. `2026-06-12 02:02`).
  It appears on the micro page.
- **A theme:** add a CSS file in `static/themes/` with `:root` variable
  overrides, add a font entry in `THEME_FONTS` and a Shiki entry in
  `SHIKI_THEMES`, then reference it from `site.theme`.

## Code highlighting

Code fences are highlighted at build time by Shiki. Each site theme pairs with
a Shiki theme — the default uses custom `paper-light`/`paper-dark` palettes
(edit hex values in `themes/` to tweak), while `terminal` and `sans` use
One Light / One Dark Pro.

## Quizzes

Posts can embed interactive multiple-choice quizzes via custom HTML elements
(`static/quiz.js`, the only client-side JS). See the source for authoring rules.
