// build.mjs — the whole generator. Read content, transform, write dist/.
//
//   node build.mjs
//
// Pipeline:
//   1. set up Markdown + Shiki (using the site's custom themes)
//   2. read posts and pages, render Markdown to HTML, collect metadata
//   3. render every page through the templates
//   4. write an Atom feed
//   5. copy static assets
// No watcher, no incremental build — a full rebuild takes milliseconds.

import { readFile, writeFile, mkdir, readdir, cp, rm } from 'node:fs/promises'
import { join, basename } from 'node:path'
import matter from 'gray-matter'
import MarkdownIt from 'markdown-it'
import { fromHighlighter } from '@shikijs/markdown-it/core'
import { createHighlighter } from 'shiki'

// ----------------------------------------------------------------------
// Config — the few things that are truly site-wide.
// ----------------------------------------------------------------------
const site = {
  title: 'jtbergman.me',
  author: 'JT Bergman',
  baseUrl: 'https://jtbergman.github.io', // used for the feed; no trailing slash
  // ^ switch to 'https://jtbergman.me' when the custom domain is live (also add
  //   static/CNAME with that hostname, set it in Settings → Pages, and point DNS).
  theme: 'default',       // 'default' | 'terminal' | 'sans'
  intro: {
    name: 'JT Bergman',
    bio: 'Globally recognized as NYC\'s #1 Knicks fan',
  },
  microIntro: 'My own personal Twitter',
}

const LANGS = ['swift', 'typescript', 'javascript', 'bash', 'json', 'css', 'html', 'python']

const SRC = 'content'
const OUT = 'dist'

// ----------------------------------------------------------------------
// Small helpers (no extra dependencies).
// ----------------------------------------------------------------------
const fmtLong = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
})
const fmtShort = new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric', timeZone: 'UTC',
})

function slugFromFilename(file) {
  // "2026-06-04-building-an-ssg.md" -> "building-an-ssg"
  return basename(file, '.md').replace(/^\d{4}-\d{2}-\d{2}-/, '')
}

function readingTime(html) {
  const words = html.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).length
  return Math.max(1, Math.round(words / 200))
}

async function write(path, contents) {
  const full = join(OUT, path)
  await mkdir(join(full, '..'), { recursive: true })
  await writeFile(full, contents)
}

// ----------------------------------------------------------------------
// 1. Markdown + Shiki (theme-aware: each site theme uses fitting code colors)
// ----------------------------------------------------------------------
const SHIKI_THEMES = {
  default: { light: 'paper-light', dark: 'paper-dark' },
  terminal: { light: 'one-light', dark: 'one-dark-pro' },
  sans: { light: 'one-light', dark: 'one-dark-pro' },
}
const shikiChoice = SHIKI_THEMES[site.theme] || SHIKI_THEMES.default

let lightTheme, darkTheme
if (site.theme === 'default') {
  [lightTheme, darkTheme] = await Promise.all([
    readFile('themes/paper-light.json', 'utf8').then(JSON.parse),
    readFile('themes/paper-dark.json', 'utf8').then(JSON.parse),
  ])
} else {
  lightTheme = shikiChoice.light
  darkTheme = shikiChoice.dark
}

const highlighter = await createHighlighter({ themes: [lightTheme, darkTheme], langs: LANGS })

const md = MarkdownIt({ html: true, linkify: true, typographer: true })
md.use(
  fromHighlighter(highlighter, {
    themes: { light: shikiChoice.light, dark: shikiChoice.dark },
  })
)

// Every Markdown-rendered <img> (post bodies, micro entry bodies) gets native
// lazy loading + async decoding, so off-screen images aren't fetched on first
// paint. Template-emitted images set the same attributes inline. We tag tokens
// (not the render rule) so markdown-it's own alt-text handling still runs.
// Note: raw <img> HTML typed directly in Markdown is an html token, not an
// image token, so it is NOT tagged — add loading/decoding by hand in that case.
md.core.ruler.push('lazy_images', (state) => {
  const tag = (tokens) => {
    for (const t of tokens) {
      if (t.type === 'image') {
        if (t.attrIndex('loading') < 0) t.attrPush(['loading', 'lazy'])
        if (t.attrIndex('decoding') < 0) t.attrPush(['decoding', 'async'])
      }
      if (t.children) tag(t.children)
    }
  }
  tag(state.tokens)
})

// ----------------------------------------------------------------------
// 2. Read content
// ----------------------------------------------------------------------
async function loadPosts() {
  const dir = join(SRC, 'posts')
  const entries = await readdir(dir, { withFileTypes: true })
  const posts = []
  for (const entry of entries) {
    let file, postDir
    if (entry.isDirectory()) {
      postDir = join(dir, entry.name)
      file = join(postDir, 'index.md')
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      file = join(dir, entry.name)
    } else {
      continue
    }
    const raw = await readFile(file, 'utf8')
    const { data, content } = matter(raw)
    const html = md.render(content)
    const date = new Date(data.date)
    posts.push({
      slug: data.slug || slugFromFilename(entry.name),
      title: data.title,
      description: data.description || '',
      date,
      dateISO: date.toISOString().slice(0, 10),
      dateLong: fmtLong.format(date),
      dateShort: fmtShort.format(date),
      readingTime: readingTime(html),
      html,
      postDir,
    })
  }
  posts.sort((a, b) => b.date - a.date) // newest first
  return posts
}

async function loadPage(name) {
  const raw = await readFile(join(SRC, 'pages', `${name}.md`), 'utf8')
  const { data, content } = matter(raw)
  return { ...data, html: md.render(content) }
}

async function loadJson(name) {
  return JSON.parse(await readFile(join(SRC, name), 'utf8'))
}

async function loadMicro() {
  const dir = join(SRC, 'micro')
  const files = (await readdir(dir)).filter((f) => f.endsWith('.md'))
  files.sort().reverse() // newest first by filename
  const entries = []
  for (const file of files) {
    const raw = await readFile(join(dir, file), 'utf8')
    const { data, content } = matter(raw)
    const date = new Date(data.date)
    const bodyHtml = md.render(content).trim()
    const y = date.getFullYear()
    const month = date.toLocaleString('en-US', { month: 'short' })
    const d = date.getDate()
    const hh = String(date.getHours()).padStart(2, '0')
    const mm = String(date.getMinutes()).padStart(2, '0')
    entries.push({
      anchor: `m-${String(date.getMonth() + 1).padStart(2, '0')}${String(d).padStart(2, '0')}`,
      time: `${y} / ${month} ${d} · ${hh}:${mm}`,
      date,
      bodyHtml,
      image: data.image || null,
    })
  }
  return entries
}

// ----------------------------------------------------------------------
// 3 + 4 + 5. Build everything.
// ----------------------------------------------------------------------
import { layout } from './templates/layout.mjs'
import {
  renderHome, renderPost, renderPage, renderGallery, renderMicro,
} from './templates/pages.mjs'

function atomFeed(posts, micro) {
  // Merge posts and micro into a single feed, newest first.
  const microAsEntries = micro.map((m) => ({
    title: m.bodyHtml.replace(/<[^>]+>/g, '').replace(/&/g, '&amp;').slice(0, 120),
    url: `${site.baseUrl}/micro/#${m.anchor}`,
    id: `${site.baseUrl}/micro/${m.anchor}`,
    date: m.date,
    summary: m.bodyHtml.replace(/<[^>]+>/g, '').replace(/&/g, '&amp;').slice(0, 200),
  }))
  const postEntries = posts.map((p) => ({
    title: p.title.replace(/&/g, '&amp;'),
    url: `${site.baseUrl}/${p.slug}/`,
    id: `${site.baseUrl}/${p.slug}/`,
    date: p.date,
    summary: (p.description || p.title).replace(/&/g, '&amp;'),
  }))
  const all = [...postEntries, ...microAsEntries].sort((a, b) => b.date - a.date)

  const updated = all[0] ? all[0].date.toISOString() : new Date().toISOString()
  const entries = all
    .slice(0, 20)
    .map(
      (e) => `  <entry>
    <title>${e.title}</title>
    <link href="${e.url}"/>
    <id>${e.id}</id>
    <updated>${e.date.toISOString()}</updated>
    <summary>${e.summary}</summary>
  </entry>`
    )
    .join('\n')

  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${site.title}</title>
  <link href="${site.baseUrl}/"/>
  <link rel="self" href="${site.baseUrl}/feed.xml"/>
  <id>${site.baseUrl}/</id>
  <updated>${updated}</updated>
${entries}
</feed>
`
}

async function build() {
  const start = Date.now()
  await rm(OUT, { recursive: true, force: true })
  await mkdir(OUT, { recursive: true })

  // Load all content.
  const posts = await loadPosts()
  const about = await loadPage('about')
  const gallery = await loadJson('gallery.json')
  const micro = await loadMicro()

  // Home
  await write(
    'index.html',
    layout({
      title: site.title, current: '/', page: 'home', site,
      description: site.intro.bio,
      body: renderHome({ posts, intro: site.intro }),
    })
  )

  // Posts
  for (const post of posts) {
    await write(
      `${post.slug}/index.html`,
      layout({
        title: `${post.title} — ${site.title}`, current: '/', page: 'post', site,
        description: post.description,
        body: renderPost(post),
      })
    )
    // Copy post-local assets (images, etc.) alongside the rendered page.
    if (post.postDir) {
      const assets = (await readdir(post.postDir, { withFileTypes: true }))
        .filter((e) => e.isFile() && e.name !== 'index.md')
      for (const asset of assets) {
        await cp(join(post.postDir, asset.name), join(OUT, post.slug, asset.name))
      }
    }
  }

  // About
  await write(
    'about/index.html',
    layout({ title: `About — ${site.title}`, current: '/about/', page: 'about', site, body: renderPage(about) })
  )

  // Photos
  await write(
    'photos/index.html',
    layout({ title: `Photos — ${site.title}`, current: '/photos/', page: 'photos', site, body: renderGallery(gallery) })
  )

  // Micro
  await write(
    'micro/index.html',
    layout({
      title: `Micro — ${site.title}`, current: '/micro/', page: 'micro', site,
      body: renderMicro({ entries: micro, intro: site.microIntro }),
    })
  )

  // Feed + static assets. Copy everything in static/ (style.css, quiz.js, and
  // any future fonts/images) rather than naming files one by one.
  await write('feed.xml', atomFeed(posts, micro))
  await cp('static', OUT, { recursive: true })

  const pages = posts.length + 5
  console.log(`Built ${pages} pages + feed in ${Date.now() - start}ms → ${OUT}/`)
}

build()
