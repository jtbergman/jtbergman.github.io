// templates/layout.mjs
// The HTML shell shared by every page. Templates are just functions that
// return strings — no template engine, no second language to learn.

const NAV = [
  ['/', 'Writing'],
  ['/micro/', 'Micro'],
  ['/photos/', 'Photos'],
  ['/about/', 'About'],
]

const THEME_FONTS = {
  default: 'Literata:ital,opsz,wght@0,7..72,300..600;1,7..72,300..500&family=JetBrains+Mono:wght@400;500',
  terminal: 'JetBrains+Mono:wght@400;500;600',
  sans: 'Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500',
}

export function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
export function escapeAttr(s = '') {
  return escapeHtml(s).replace(/"/g, '&quot;')
}

// `page` is the only structural hook the CSS needs: it tags <body> so the
// template-generated pages (home/photos/micro) can be styled by element alone.
export function layout({ title, current = '', page = '', description = '', body, site }) {
  const theme = site.theme || 'default'
  const fontFamily = THEME_FONTS[theme] || THEME_FONTS.default

  const nav = NAV.map(([href, label]) => {
    const active = href === current ? ' aria-current="page"' : ''
    return `<a href="${href}"${active}>${label}</a>`
  }).join('\n    ')

  const desc = description
    ? `<meta name="description" content="${escapeAttr(description)}">\n`
    : ''

  const themeLink = `<link rel="stylesheet" href="/themes/${theme}.css">\n`

  // The quiz component is the one feature that ships client JS. Inject it only
  // on pages whose body actually contains a quiz, detected straight from the
  // rendered HTML — so no other page pays for it. It loads in <head> WITHOUT
  // `defer` on purpose: the custom elements then register before the parser
  // reaches them, so they upgrade in place with no flash of the no-JS fallback.
  const quiz = /<quiz-(set|question)[\s/>]/.test(body)
    ? '<script src="/quiz.js"></script>\n'
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
${desc}<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=${fontFamily}&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/style.css">
${themeLink}<link rel="alternate" type="application/atom+xml" href="/feed.xml" title="${escapeAttr(site.title)}">
${quiz}</head>
<body data-page="${escapeAttr(page)}">
<header>
  <a href="/">${escapeHtml(site.title)}</a>
  <nav>
    ${nav}
  </nav>
</header>
${body}
<footer>
  <p><span>© ${new Date().getFullYear()} ${escapeHtml(site.author)} · Like this site? <a href="https://github.com/jtbergman/jtbergman.github.io">Copy it</a></span><a href="/feed.xml">RSS</a></p>
</footer>
</body>
</html>
`
}
