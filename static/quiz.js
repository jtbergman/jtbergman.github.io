// static/quiz.js
// The site's only client-side JavaScript. Two custom elements turn authored
// HTML into an interactive multiple-choice quiz. No dependencies, no build
// step; layout.mjs injects this file only on pages that contain a quiz.
//
// Authoring (raw HTML inside a Markdown post — html:true is already on):
//
//   <quiz-set>
//     <quiz-question idk>
//       <p>Prompt text, may contain <code>markup</code>.</p>
//       <ul>
//         <li>An option</li>
//         <li correct>The right one</li>
//         <li>Another option</li>
//       </ul>
//       <p data-explain>Optional explanation, revealed after answering.</p>
//     </quiz-question>
//     <!-- more <quiz-question> elements -->
//   </quiz-set>
//
//   - `correct` marks the right <li>.
//   - `idk` on <quiz-question> adds an "I don't know" choice that reveals the
//     answer and counts as not-correct.
//   - <p data-explain> is optional.
//   - A lone <quiz-question> works on its own (no pager, no score).
//
// Timing note: this script loads in <head> WITHOUT defer so the elements are
// defined before the parser reaches them (no flash of the no-JS fallback). The
// catch is that connectedCallback runs before an element's children are parsed,
// so we attach an (empty) shadow root immediately — which hides the light-DOM
// answers at once — and defer parsing/rendering until the document is ready.
// <quiz-set> then drives its questions' init directly, so ordering is fixed.

// Run fn now if parsing is done, otherwise once it is.
function whenReady(fn) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn, { once: true })
  } else {
    fn()
  }
}

const QUESTION_STYLE = `
  :host { display: block; --ok: #2f7d4f; --no: #b3261e; }
  :host([hidden]) { display: none; }
  @media (prefers-color-scheme: dark) { :host { --ok: #7fcf9a; --no: #e98b80; } }

  .prompt { margin: 0 0 1rem; }
  .prompt > :first-child { margin-top: 0; }
  .prompt > :last-child { margin-bottom: 0; }
  .prompt:focus { outline: none; }

  .options { display: flex; flex-direction: column; gap: 0.5rem; }
  .option {
    font: inherit; color: inherit; text-align: left;
    display: flex; gap: 0.6rem; align-items: center;
    background: var(--paper); border: 1px solid var(--rule); border-radius: 6px;
    padding: 0.6rem 0.85rem; cursor: pointer;
    transition: border-color 0.12s ease, background 0.12s ease;
  }
  .option:hover:not(:disabled) { border-color: var(--ink-soft); }
  .option:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .option:disabled { cursor: default; opacity: 1; }
  .marker {
    font-family: var(--font-mono); font-size: 0.8rem; color: var(--ink-soft);
    flex: 0 0 1.2em;
  }
  .label { flex: 1; }
  .tag {
    font-family: var(--font-mono); font-size: 0.62rem; letter-spacing: 0.04em;
    text-transform: uppercase; white-space: nowrap;
  }
  .option.correct {
    border-color: var(--ok);
    background: color-mix(in srgb, var(--ok) 12%, transparent);
  }
  .option.correct .marker, .option.correct .tag { color: var(--ok); }
  .option.wrong {
    border-color: var(--no);
    background: color-mix(in srgb, var(--no) 12%, transparent);
  }
  .option.wrong .marker, .option.wrong .tag { color: var(--no); }

  .idk {
    font: inherit; font-size: var(--small); color: var(--ink-soft);
    background: none; border: none; padding: 0.4rem 0; margin-top: 0.7rem;
    cursor: pointer; align-self: flex-start;
    text-decoration: underline; text-underline-offset: 0.12em;
  }
  .idk:hover { color: var(--accent); }
  .idk:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

  .feedback { margin: 0.85rem 0 0; font-size: var(--small); font-weight: 600; }
  .feedback.ok { color: var(--ok); }
  .feedback.no { color: var(--no); }
  .explain {
    margin-top: 0.6rem; padding-top: 0.6rem; border-top: 1px solid var(--rule);
    font-size: 0.95rem; color: var(--ink-soft);
  }
  .explain > :first-child { margin-top: 0; }
  .explain > :last-child { margin-bottom: 0; }
  [hidden] { display: none !important; }
`

const LETTERS = 'ABCDEFGHIJKLMNOP'

class QuizQuestion extends HTMLElement {
  connectedCallback() {
    // Attach the shadow root now (even before children parse) so the raw
    // answers in light DOM never render. Fill it in once content is ready.
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' })
    whenReady(() => this.ensureReady())
  }

  // Idempotent: <quiz-set> may call this before our own whenReady fires.
  ensureReady() {
    if (this._ready) return
    this._ready = true
    this._parse()
    this._render()
  }

  _parse() {
    const list = this.querySelector('ul, ol')
    const items = list ? [...list.querySelectorAll(':scope > li')] : []
    this.options = items.map((li) => ({
      html: li.innerHTML.trim(),
      correct: li.hasAttribute('correct'),
    }))
    this.correctIndex = this.options.findIndex((o) => o.correct)

    const explainEl = this.querySelector('[data-explain]')
    this.explainHtml = explainEl ? explainEl.innerHTML.trim() : ''

    // Prompt = every child element that isn't the options list or explanation.
    this.promptHtml = [...this.children]
      .filter((el) => el !== list && el !== explainEl)
      .map((el) => el.outerHTML)
      .join('')

    this.allowIdk = this.hasAttribute('idk')
    // Inside a <quiz-set>, the set's footer owns the "I don't know" control;
    // a lone question renders its own. Either way it routes to reveal().
    this._inSet = !!this.closest('quiz-set')
    this.answered = false
    this.correct = false

    const n = this.options.filter((o) => o.correct).length
    if (!this.options.length) console.warn('[quiz] question has no <li> options', this)
    else if (n === 0) console.warn('[quiz] question has no option marked `correct`', this)
    else if (n > 1) console.warn('[quiz] question has multiple `correct` options; using the first', this)
  }

  _render() {
    const opts = this.options
      .map(
        (o, i) =>
          `<button type="button" class="option" role="radio" aria-checked="false"` +
          ` data-i="${i}" tabindex="${i === 0 ? 0 : -1}">` +
          `<span class="marker" aria-hidden="true">${LETTERS[i] || i + 1}</span>` +
          `<span class="label">${o.html}</span></button>`
      )
      .join('')

    this.shadowRoot.innerHTML = `
      <style>${QUESTION_STYLE}</style>
      <div class="prompt" tabindex="-1">${this.promptHtml}</div>
      <div class="options" role="radiogroup" aria-label="Answer choices">${opts}</div>
      ${this.allowIdk && !this._inSet ? `<button type="button" class="idk">I don't know</button>` : ''}
      <p class="feedback" role="status" aria-live="polite" hidden></p>
      ${this.explainHtml ? `<div class="explain" hidden>${this.explainHtml}</div>` : ''}
    `

    const root = this.shadowRoot
    this._prompt = root.querySelector('.prompt')
    this._buttons = [...root.querySelectorAll('.option')]
    this._feedback = root.querySelector('.feedback')
    this._explain = root.querySelector('.explain')
    this._idkBtn = root.querySelector('.idk')

    this._buttons.forEach((btn) =>
      btn.addEventListener('click', () => this._commit(Number(btn.dataset.i)))
    )
    root.querySelector('.options').addEventListener('keydown', (e) => this._onKey(e))
    if (this._idkBtn) this._idkBtn.addEventListener('click', () => this._commit(-1))
  }

  // Roving-tabindex arrow navigation within the radiogroup.
  _onKey(e) {
    if (this.answered) return
    const i = this._buttons.indexOf(e.target)
    if (i < 0) return
    const last = this._buttons.length - 1
    let next = null
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = i === last ? 0 : i + 1
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = i === 0 ? last : i - 1
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = last
    if (next === null) return
    e.preventDefault()
    this._buttons.forEach((b, j) => (b.tabIndex = j === next ? 0 : -1))
    this._buttons[next].focus()
  }

  _commit(choice) {
    if (this.answered) return
    this.answered = true
    const idk = choice < 0
    this.correct = !idk && choice === this.correctIndex

    this._buttons.forEach((btn, i) => {
      btn.disabled = true
      btn.tabIndex = -1
      btn.setAttribute('aria-checked', String(i === choice))
      if (i === this.correctIndex) {
        btn.classList.add('correct')
        btn.insertAdjacentHTML('beforeend', '<span class="tag">Correct answer</span>')
      } else if (!idk && i === choice) {
        btn.classList.add('wrong')
        btn.insertAdjacentHTML('beforeend', '<span class="tag">Your choice</span>')
      }
    })
    if (this._idkBtn) this._idkBtn.hidden = true

    const [tone, text] = idk
      ? ['no', 'The correct answer is highlighted.']
      : this.correct
        ? ['ok', 'Correct.']
        : ['no', 'Not quite — the correct answer is highlighted.']
    this._feedback.classList.add(tone)
    this._feedback.textContent = text
    this._feedback.hidden = false
    if (this._explain) this._explain.hidden = false

    this.dispatchEvent(
      new CustomEvent('quiz:answered', {
        bubbles: true,
        composed: true,
        detail: { correct: this.correct, idk },
      })
    )
  }

  // Public: a <quiz-set>'s footer "I don't know" calls this for the active question.
  reveal() {
    this._commit(-1)
  }

  // Called by <quiz-set> when this question becomes the active one.
  focusStart() {
    if (!this._ready) return
    if (!this.answered && this._buttons.length) {
      ;(this._buttons.find((b) => b.tabIndex === 0) || this._buttons[0]).focus()
    } else if (this._prompt) {
      this._prompt.focus()
    }
  }
}

// Minimal inline arrow glyphs; currentColor + a stroke that tracks the type.
const ARROW_PREV = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>`
const ARROW_NEXT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`

const SET_STYLE = `
  :host {
    display: flex; flex-direction: column;
    min-height: 20rem;            /* fixed-feel card; grows if content needs it */
    position: relative;
    margin: var(--space) 0;
    padding: 1.4rem 1.3rem 1.2rem;
    border: 1px solid var(--rule); border-radius: 8px;
  }
  :host([hidden]) { display: none; }

  /* The legend sits on the top border; its paper background masks the line. */
  .legend {
    position: absolute; top: 0; left: 1.1rem; transform: translateY(-50%);
    background: var(--paper); padding: 0 0.5rem;
    font-family: var(--font-mono); font-size: 0.68rem; font-weight: 500;
    letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent);
  }

  .head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; }
  .count {
    font-family: var(--font-mono); font-size: 0.72rem;
    letter-spacing: 0.03em; color: var(--ink-soft);
  }
  .nav { display: flex; gap: 0.2rem; }
  .nav button {
    display: inline-flex; align-items: center; justify-content: center;
    width: 1.85rem; height: 1.85rem; padding: 0;
    background: none; border: none; border-radius: 5px; cursor: pointer;
    color: var(--ink-soft);
  }
  .nav button:hover:not(:disabled) { background: var(--code-bg); color: var(--ink); }
  .nav button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .nav button:disabled { opacity: 0.32; cursor: default; }
  .nav .next:not(:disabled) { color: var(--accent); }   /* the live "advance" pops */
  .nav svg { width: 1.05rem; height: 1.05rem; display: block; }

  .body { flex: 1; }   /* fills the card so the footer pins to the bottom */

  .foot {
    display: flex; align-items: baseline; justify-content: flex-end;
    margin-top: 1.2rem; min-height: 1.4rem;   /* stable height; no jump */
  }
  .idk {
    font: inherit; font-size: var(--small); color: var(--ink-soft);
    background: none; border: none; padding: 0; cursor: pointer;
    text-decoration: underline; text-underline-offset: 0.12em;
  }
  .idk:hover { color: var(--accent); }
  .idk:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

  [hidden] { display: none !important; }
`

class QuizSet extends HTMLElement {
  connectedCallback() {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' })
    whenReady(() => this.ensureReady())
  }

  ensureReady() {
    if (this._ready) return
    this._ready = true
    this.questions = [...this.querySelectorAll(':scope > quiz-question')]
    // Drive the children's init now, so they're rendered before we use them.
    this.questions.forEach((q) => q.ensureReady && q.ensureReady())
    if (!this.questions.length) return

    this.index = 0
    this.label = this.getAttribute('label') || 'Check yourself'
    this.setAttribute('role', 'group')
    this.setAttribute('aria-label', this.label)
    this._render()
    // Any answer (option click, or the footer "I don't know") refreshes chrome.
    this.addEventListener('quiz:answered', () => this._update())
    this._show(0, false)
  }

  _render() {
    this.shadowRoot.innerHTML = `
      <style>${SET_STYLE}</style>
      <span class="legend"></span>
      <div class="head">
        <span class="count"></span>
        <span class="nav">
          <button type="button" class="prev" aria-label="Previous question">${ARROW_PREV}</button>
          <button type="button" class="next" aria-label="Next question">${ARROW_NEXT}</button>
        </span>
      </div>
      <div class="body"><slot></slot></div>
      <div class="foot">
        <button type="button" class="idk" hidden>I don't know</button>
      </div>
    `
    const root = this.shadowRoot
    root.querySelector('.legend').textContent = this.label
    this._count = root.querySelector('.count')
    this._prev = root.querySelector('.prev')
    this._next = root.querySelector('.next')
    this._idk = root.querySelector('.idk')
    this._prev.addEventListener('click', () => this._show(this.index - 1, true))
    this._next.addEventListener('click', () => this._show(this.index + 1, true))
    this._idk.addEventListener('click', () => {
      const cur = this.questions[this.index]
      if (cur && cur.reveal) cur.reveal() // fires quiz:answered -> _update()
    })
  }

  _show(i, focus) {
    if (i < 0 || i >= this.questions.length) return
    this.index = i
    this.questions.forEach((q, j) => (q.hidden = j !== i))
    this._update()
    if (focus) this.questions[i].focusStart()
  }

  // Single source of truth for the chrome, recomputed from question state.
  _update() {
    const n = this.questions.length
    const i = this.index
    const cur = this.questions[i]
    this._count.textContent = `Question ${i + 1} / ${n}`
    this._count.setAttribute('aria-label', `Question ${i + 1} of ${n}`)
    this._prev.disabled = i === 0
    this._next.disabled = !cur.answered || i === n - 1 // can't skip ahead; none past the last

    // Footer: "I don't know" only while the current question is still open.
    this._idk.hidden = !(cur.allowIdk && !cur.answered)
  }
}

customElements.define('quiz-question', QuizQuestion)
customElements.define('quiz-set', QuizSet)
