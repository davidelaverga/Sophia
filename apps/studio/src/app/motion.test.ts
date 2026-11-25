import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

// One motion vocabulary (docs/plans/motion-tokens.md, informe-30 §2.6): every transition and animation runs for one of
// the theme's motion tokens and eases on `--ease` or `--ease-in-out` (or `linear`), so no rule times itself by hand.
// What keeps its own number is listed below with its reason; a listed entry nothing writes any more fails too.

const STUDIO = new URL('../../', import.meta.url)

/** Every sheet the Studio paints with: the app's and its features' (src/), and the opening's (public/). */
function sheets(): { name: string; css: string }[] {
  const under = (dir: string) =>
    readdirSync(new URL(dir, STUDIO), { recursive: true, encoding: 'utf8' })
      .filter((path) => path.endsWith('.css'))
      .map((path) => `${dir}${path.replaceAll('\\', '/')}`)
  return [...under('src/'), ...under('public/')].map((name) => ({
    name,
    css: readFileSync(new URL(name, STUDIO), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''),
  }))
}

/** `text` cut at each `sep` outside parentheses. */
function split(text: string, sep: string): string[] {
  const out = ['']
  let depth = 0
  for (const ch of text) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === sep && depth === 0) out.push('')
    else out[out.length - 1] += ch
  }
  return out.map((part) => part.trim().replace(/\s+/g, ' ')).filter(Boolean)
}

const SHEETS = sheets()
const THEME = SHEETS.find((s) => s.name === 'src/app/theme.css')?.css ?? ''
const ROOT = THEME.slice(THEME.indexOf(':root {'), THEME.indexOf('}', THEME.indexOf(':root {')))
/** The motion and easing tokens the theme's `:root` declares. */
const SCALE = new Set([...ROOT.matchAll(/(--(?:motion|ease)[\w-]*):/g)].map((d) => d[1] ?? ''))

const LITERAL = /^-?[\d.]+m?s$/
const zero = (time: string) => /^-?0*\.?0*m?s$/.test(time)
const EASING = /^(ease(-in|-out|-in-out)?|linear|step-start|step-end|(cubic-bezier|steps|linear)\(.*\))$/
const EASED = /^(linear|var\(--ease[\w-]*\))$/
/** A word that can stand in a time's place: a literal, a calc, or any var() but an easing token. */
const timeLike = (w: string) =>
  LITERAL.test(w) || w.startsWith('calc(') || (w.startsWith('var(') && !/^var\(--ease[\w-]*\)$/.test(w))
/** A duration the fence takes: nothing at all, or one of the theme's motion tokens, bare (no fallback). */
const onScale = (w: string) =>
  (LITERAL.test(w) && zero(w)) || SCALE.has(/^var\((--motion-[\w-]+)\)$/.exec(w)?.[1] ?? '')

/** The opening (index.html links it): it plays before the app's sheets load, so no theme token reaches it yet. */
const OPENING = 'public/entry.css'

/** `file  item` (the item as the rule writes it, spaces collapsed) → why it keeps its own number. */
const ALLOWED = new Map<string, string>([
  // Ambient loops, each its own feel; a breath or a drift is not a step on the scale.
  ['src/app/theme.css  gc-drift 48s linear infinite', 'the glow’s slow drift'],
  ['src/app/theme.css  gc-breathe 6.5s var(--ease-in-out) infinite alternate', 'the glow’s resting breath'],
  ['src/app/theme.css  gc-ponder 11s var(--ease-in-out) infinite alternate', 'the glow’s thinking swirl'],
  [
    'src/app/theme.css  threshold-breathe 4.8s var(--ease-in-out) 1.2s infinite alternate',
    'the threshold’s slow breath',
  ],
  [
    'src/app/theme.css  threshold-glow 4.8s var(--ease-in-out) 1.2s infinite alternate',
    'her light under the mark on paper, on the threshold’s breath',
  ],
  ['src/app/theme.css  var(--motion-sweep) ease', 'the glow’s colour turn eases on the CSS default, kept'],
  ['src/features/personal/personal.css  ps-ambient 7s var(--ease-in-out) infinite', 'Personal’s ambient light'],
  ['src/features/personal/personal.css  1.8s', 'Personal’s ambient light while she speaks, quicker'],
  ['src/features/personal/personal.css  ps-wave 1s var(--ease-in-out) infinite', 'the speaking bars, a beat'],
  ['src/features/conversations/conversations.css  conv-turn 0.9s linear infinite', 'a spinner’s turn'],
  ['src/features/resources/resources.css  effort-glint 2.6s linear infinite', 'the effort meter’s glint'],
  [
    'src/features/resources/resources.css  effort-twinkle 1.8s var(--ease-in-out) infinite alternate',
    'the effort meter’s twinkle',
  ],
  ['src/features/resources/resources.css  effort-sparks 4s linear infinite', 'the ultra effort’s sparks'],
  [
    'src/features/resources/resources.css  effort-twinkle 1.4s var(--ease-in-out) infinite alternate',
    'the ultra effort’s twinkle, quicker',
  ],
  [
    'src/features/resources/resources.css  effort-breathe 1.2s var(--ease-in-out) infinite alternate',
    'the effort meter’s breath',
  ],
  ['src/features/resources/resources.css  waiting-ping 2s var(--ease) infinite', 'the live ring’s ping, quicker'],
  [
    'src/features/work/planning/board.css  thread-spark 1.4s var(--ease) 0.35s infinite',
    'the dependency thread’s spark',
  ],
  // One-shots whose length is what they say.
  ['src/app/theme.css  toast-time 8s linear forwards', 'a toast’s life: Toast.tsx SHOWN_MS'],
  ['src/app/theme.css  reaction-rise 4s var(--ease) both', 'a call reaction’s float and fade'],
  ['src/features/personal/personal.css  ps-pulse 1.2s var(--ease)', 'the padlock’s pulse, between two steps'],
  // One-shots off the scale by more than ~40 ms or ~15 %: kept as they were rather than moved.
  ['src/features/personal/personal.css  hw-draw 700ms var(--ease) both', 'Personal’s line drawing in, 0.1 s past long'],
  ['src/features/resources/resources.css  buddy-hello-right 1.6s var(--ease) 0.3s both', 'the buddies’ wave'],
  ['src/features/resources/resources.css  buddy-hello-left 1.6s var(--ease) 0.3s both', 'the buddies’ wave'],
  ['src/features/resources/resources.css  ultra-sweep 1.6s var(--ease) both', 'the ultra effort’s sweep'],
  ['src/features/resources/resources.css  meter-fill 0.8s var(--ease) 0.15s both', 'a meter filling to its value'],
  ['src/app/theme.css  filter 1s var(--ease)', 'the Umbral mark’s light coming up'],
  // Reduced motion: next to nothing, so the end events still fire.
  ['src/app/theme.css  0.01s', 'reduced motion'],
  ['src/features/personal/personal.css  1ms !important', 'reduced motion'],
])

/** Whether one item of a transition or animation writes its duration or its easing by hand. */
function byHand(item: string, longhand: string | undefined): boolean {
  const words = split(item, ' ')
  const eased = words.some((w) => EASING.test(w) && !EASED.test(w))
  if (longhand === '-timing-function') return eased
  const times = words.filter(timeLike)
  // A shorthand's first time is its duration, the second its delay; a longhand's items are all durations.
  const durations = longhand === '-duration' ? times : times.slice(0, 1)
  return eased || durations.some((t) => !onScale(t))
}

/** Every transition and animation item whose time or easing is written by hand, as `file  item`. */
function handWritten(): string[] {
  return SHEETS.filter(({ name }) => name !== OPENING).flatMap(({ name, css }) =>
    [...css.matchAll(/(?<![\w-])(transition|animation)(-duration|-timing-function)?\s*:\s*([^;}]+)/g)].flatMap((m) =>
      split(m[3] ?? '', ',')
        .filter((item) => byHand(item, m[2]))
        .map((item) => `${name}  ${item}`),
    ),
  )
}

/** Every custom property a sheet declares, or the Studio's code sets on an element (`style={{ '--i': n }}`). */
const SET = new Set([
  ...SHEETS.flatMap(({ css }) => [...css.matchAll(/(--[\w-]+)\s*:/g)].map((d) => d[1] ?? '')),
  ...readdirSync(new URL('src/', STUDIO), { recursive: true, encoding: 'utf8' })
    .filter((path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path))
    .flatMap((path) => [
      ...readFileSync(new URL(`src/${path.replaceAll('\\', '/')}`, STUDIO), 'utf8').matchAll(/['"](--[\w-]+)['"]/g),
    ])
    .map((m) => m[1] ?? ''),
])

/** The custom properties a sheet's transitions and animations read that nothing declares (the scale: only `:root`). */
function undeclaredReads(css: string): string[] {
  const read = [...css.matchAll(/(?<![\w-])(?:transition|animation)[\w-]*\s*:\s*([^;}]+)/g)].flatMap((m) =>
    [...(m[1] ?? '').matchAll(/var\((--[\w-]+)/g)].map((v) => v[1] ?? ''),
  )
  const known = (name: string) => (/^--(motion|ease)/.test(name) ? SCALE.has(name) : SET.has(name))
  return [...new Set(read.filter((name) => !known(name)))]
}

describe('what the fence calls by hand', () => {
  const flagged = (item: string, longhand?: string) => byHand(item, longhand)

  it('a token it does not know, a fallback, a calc or a local property in the duration slot', () => {
    assert.equal(flagged('color var(--fast) var(--ease)'), true)
    assert.equal(flagged('opacity var(--base)'), true)
    assert.equal(flagged('color var(--motion-fast, 999ms) var(--ease)'), true)
    assert.equal(flagged('color calc(300ms) var(--ease)'), true)
    assert.equal(flagged('arrive var(--dur) var(--ease) both'), true)
    assert.equal(flagged('var(--fast)', '-duration'), true)
  })

  it('a linear() curve, a cubic-bezier or a keyword ease', () => {
    assert.equal(flagged('opacity var(--motion-fast) linear(0, 0.5, 1)'), true)
    assert.equal(flagged('opacity var(--motion-fast) cubic-bezier(0.2, 0, 0, 1)'), true)
    assert.equal(flagged('opacity var(--motion-fast) ease-in-out'), true)
  })

  it('not a token on the scale, nothing, a zero, or a delay after the duration', () => {
    assert.equal(flagged('color var(--motion-fast) var(--ease)'), false)
    assert.equal(flagged('spin var(--motion-pulse) linear infinite'), false)
    assert.equal(flagged('visibility 0s var(--motion-base)'), false)
    assert.equal(flagged('hw-in var(--motion-slower) var(--ease) var(--d) both'), false)
    assert.equal(flagged('none'), false)
  })
})

describe('one motion vocabulary', () => {
  const found = handWritten()

  it('no transition or animation times or eases itself outside the tokens', () => {
    assert.deepEqual(
      [...new Set(found)].filter((entry) => !ALLOWED.has(entry)),
      [],
    )
  })

  it('every listed exception is still written somewhere', () => {
    assert.deepEqual(
      [...ALLOWED.keys()].filter((entry) => !found.includes(entry)),
      [],
    )
  })

  it('every property a transition or animation reads is declared, the scale in the theme', () => {
    assert.ok(SCALE.has('--motion-fast') && SCALE.has('--ease'))
    assert.deepEqual(
      SHEETS.flatMap(({ name, css }) => undeclaredReads(css).map((v) => `${name}  ${v}`)),
      [],
    )
  })

  it('a renamed token read again is caught', () => {
    assert.deepEqual(undeclaredReads('a { transition: color var(--fast) var(--ease); }'), ['--fast'])
    assert.deepEqual(undeclaredReads('a { animation: x var(--motion-quick) var(--ease-out) var(--d) both; }'), [
      '--motion-quick',
      '--ease-out',
    ])
  })
})
