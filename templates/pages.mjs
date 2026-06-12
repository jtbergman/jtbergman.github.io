// templates/pages.mjs
// One function per page type. Each returns the <main>/<article> body;
// layout() wraps it in the full HTML shell.

import { escapeHtml, escapeAttr } from './layout.mjs'

export function renderHome({ posts, intro }) {
  // Group posts by year, newest year first.
  const byYear = new Map()
  for (const p of posts) {
    const y = p.date.getUTCFullYear()
    if (!byYear.has(y)) byYear.set(y, [])
    byYear.get(y).push(p)
  }

  const sections = [...byYear.keys()]
    .sort((a, b) => b - a)
    .map((year) => {
      const items = byYear
        .get(year)
        .map(
          (p) =>
            `      <li><time datetime="${p.dateISO}">${p.dateShort}</time> <a href="/${p.slug}/">${escapeHtml(p.title)}</a></li>`
        )
        .join('\n')
      return `  <h2>${year}</h2>\n  <ul>\n${items}\n  </ul>`
    })
    .join('\n\n')

  return `<main>
  <h1>${escapeHtml(intro.name)}</h1>
  <p class="lede">${intro.bio}</p>
${sections}
</main>
`
}

export function renderPost(post) {
  return `<article>
  <h1>${escapeHtml(post.title)}</h1>
  <p class="post-meta">${post.dateLong} · ${post.readingTime} min read</p>
  ${post.html}
</article>
`
}

export function renderPage(page) {
  const lede = page.subtitle
    ? `<p class="lede">${escapeHtml(page.subtitle)}</p>\n  `
    : ''
  const meta = page.metaText
    ? `<p class="post-meta">${escapeHtml(page.metaText)}</p>\n  `
    : ''
  return `<main>
  <h1>${escapeHtml(page.title)}</h1>
  ${lede}${meta}${page.html}
</main>
`
}

export function renderGallery(data) {
  // The grid <img> uses ph.src (small thumbnail); the <a> links ph.full
  // (large). RESPONSIVE IMAGES (deferred): once real image files live under
  // static/, add `srcset`/`sizes` to the <img> below (e.g. from a per-photo
  // `srcset` field, or a build-time sharp step that emits WebP/AVIF widths).
  const sections = data.sections
    .map((s) => {
      const figs = s.photos
        .map(
          (ph) =>
            `      <figure><a href="${escapeAttr(ph.full)}"><img src="${escapeAttr(ph.src)}" alt="${escapeAttr(ph.alt)}" loading="lazy" decoding="async"></a><figcaption>${escapeHtml(ph.caption)}</figcaption></figure>`
        )
        .join('\n')
      return `  <section>
    <h2>${escapeHtml(s.title)} <span>${escapeHtml(s.when)}</span></h2>
    <div class="gallery-grid">
${figs}
    </div>
  </section>`
    })
    .join('\n\n')

  return `<main>
  <h1>Photos</h1>
  <p class="lede">${escapeHtml(data.intro)}</p>

${sections}
</main>
`
}

export function renderMicro({ entries, intro }) {
  const items = entries
    .map((e) => {
      const img = e.image
        ? `\n      <img src="${escapeAttr(e.image.src)}" alt="${escapeAttr(e.image.alt || '')}" loading="lazy" decoding="async">`
        : ''
      return `    <li id="${e.anchor}">
      <span><a href="#${e.anchor}">${escapeHtml(e.time)}</a></span>
      ${e.bodyHtml}${img}
    </li>`
    })
    .join('\n\n')

  return `<main>
  <h1>Micro</h1>
  <p class="lede">${intro}</p>

  <ul>
${items}
  </ul>
</main>
`
}
