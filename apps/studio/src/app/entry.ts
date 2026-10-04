// The opening (docs/plans/entry-opening.md), outside React, once, on the way in: index.html draws it (a sign-in's
// return shows it from the first frame) and public/entry.css plays the lockup's arrival. This moves its bar smoothly
// through the real work of getting ready, says that work under it, and once all is ready lets the arrival land and
// flies the lockup into the screen's own corner lockup. Every call is safe without it (the fixture pages have none).
import {
  aimFor,
  exitFor,
  flight,
  follow,
  INTRO_MS,
  laterStage,
  SAID_FROM_MS,
  SAY_AT_LEAST_MS,
  underWay,
  type EntryStage,
  type Exit,
} from './entry-progress.ts'

const EASE = 'cubic-bezier(0.2, 0, 0, 1)'
const GLIDE = 'cubic-bezier(0.65, 0, 0.35, 1)'
const FLIGHT_MS = 780
/** At the end the bar fills quicker than it follows the work, but still never jumps. */
const FILL_LAG_MS = 110
/** Where the lockup lands: the corner lockup of the screen it opens on (the Studio's bar, the sign-in's corner). */
const LANDING = '#root .topbar .mark .umbral, #root .screen-mark .umbral'

interface Parts {
  root: HTMLElement
  ground: Element
  lockup: HTMLElement
  mark: Element
  bar: Element
  fill: HTMLElement
  step: HTMLElement
  slow: Element
}

/** The step shown, and the steps done since that are still to be shown, in order. */
let stage: EntryStage = 'page'
let queued: EntryStage[] = []
/** When this opening began, when the shown step was taken up, and when its words were said (page clock, load at 0). */
let began = 0
let doneAt = 0
let saidAt = 0
let pacing = 0
let drained: (() => void) | null = null
/** Where the bar stands, and whether it is filling now that all is ready. */
let shown = 0
let filling = false
let filled: (() => void) | null = null
let frame = 0
let last = 0
let leaving: Promise<void> | null = null
/** The opening's parts while it is up, and whether less motion is asked for: read once, not every frame. */
let live: Parts | null = null
let still = false

function parts(): Parts | null {
  const root = document.getElementById('entry')
  const pick = (name: string) => root?.querySelector(`.entry-${name}`)
  const [ground, lockup, mark, bar, fill, step, slow] = ['ground', 'lockup', 'mark', 'bar', 'fill', 'step', 'slow'].map(
    pick,
  )
  if (!root || !ground || !(lockup instanceof HTMLElement) || !mark || !bar || !slow) return null
  if (!(fill instanceof HTMLElement) || !(step instanceof HTMLElement)) return null
  return { root, ground, lockup, mark, bar, fill, step, slow }
}

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** One frame of the bar: on towards where the work stands, never back, never a jump. */
function tick(now: number): void {
  const p = live
  if (!p || p.root.hidden) {
    frame = 0
    return
  }
  const aim = filling ? 1 : aimFor(stage, now - doneAt)
  shown = still ? aim : follow(shown, aim, now - last, filling ? FILL_LAG_MS : undefined)
  last = now
  p.fill.style.transform = `scaleX(${String(shown)})`
  if (filling && shown > 0.995) filled?.()
  frame = requestAnimationFrame(tick)
}

/**
 * While it is up, keys go nowhere the person can't see: the app's listeners don't hear them, and Tab stays in the
 * opening (its Start over, once shown), so focus never reaches a control under it. Keys on the opening's own link work.
 */
function guard(event: KeyboardEvent): void {
  if (event.target instanceof Node && live?.root.contains(event.target)) return
  event.stopImmediatePropagation()
  if (event.type !== 'keydown' || event.key !== 'Tab') return
  event.preventDefault()
  const again = live?.root.querySelector('.entry-again')
  if (again instanceof HTMLElement && again.checkVisibility()) again.focus()
}
const KEYS = ['keydown', 'keyup', 'keypress'] as const

/** The bar's own loop takes over from where index.html's arrival left it. */
function run(p: Parts): void {
  live = p
  still = reduced()
  for (const type of KEYS) window.addEventListener(type, guard, true)
  // Nothing under it keeps the focus: Enter or Space can't press what nobody sees.
  if (document.activeElement instanceof HTMLElement && !p.root.contains(document.activeElement)) {
    document.activeElement.blur()
  }
  shown = new DOMMatrix(getComputedStyle(p.fill).transform).a
  // Held where index.html's arrival has it before that arrival stops: not a frame back at nothing.
  p.fill.style.transform = `scaleX(${String(shown)})`
  p.fill.style.animation = 'none'
  last = performance.now()
  if (!frame) frame = requestAnimationFrame(tick)
}

/** The work now under way, said under the bar: the old words fade, the new ones come in. */
function say(p: Parts, words: string): void {
  if (p.step.textContent === words) return
  const out = p.step.animate([{ opacity: 0 }], { duration: reduced() ? 0 : 140, easing: EASE, fill: 'forwards' })
  out.onfinish = () => {
    p.step.textContent = words
    p.step.animate([{ opacity: 0 }, { opacity: 1 }], { duration: reduced() ? 0 : 260, easing: EASE, fill: 'forwards' })
  }
}

/**
 * The shown step catches up with the work done, one step at a time: each one's words stay at least SAY_AT_LEAST_MS,
 * so work done faster than that still reads, one line after another, and the bar moves with them.
 */
function pace(p: Parts): void {
  if (pacing) return
  const next = queued[0]
  if (!next) {
    drained?.()
    return
  }
  const words = underWay(next)
  const hold = words === underWay(stage) ? 0 : Math.max(0, saidAt + SAY_AT_LEAST_MS - performance.now())
  pacing = window.setTimeout(() => {
    pacing = 0
    queued.shift()
    stage = next
    doneAt = performance.now()
    if (words !== p.step.textContent) {
      say(p, words)
      saidAt = doneAt
    }
    pace(p)
  }, hold)
}

const lastAsked = () => queued.at(-1) ?? stage

/** A step done: it joins the steps to show, in order. Never back. */
export function reach(next: EntryStage): void {
  const p = parts()
  if (!p || p.root.hidden || leaving) return
  if (laterStage(lastAsked(), next) === lastAsked()) return
  queued.push(next)
  pace(p)
}

/** Whether the opening is up: the work it shows is still to be done. */
export const showing = (): boolean => {
  const p = parts()
  return p !== null && !p.root.hidden && leaving === null
}

/**
 * The app runs. A sign-in's return marked the page before its first paint (public/entry.js), so the opening it shows
 * is now this one's; any other load has none.
 */
export function begin(): void {
  const p = parts()
  const page = document.documentElement
  if (!p || page.dataset.entering === undefined) return
  delete page.dataset.entering
  p.root.hidden = false
  saidAt = SAID_FROM_MS
  run(p)
  reach('app')
}

/** An in-page sign-in: the opening covers the screen, from where the app already runs. */
export function cover(): void {
  const p = parts()
  if (!p || !p.root.hidden) return
  p.root.dataset.cover = ''
  p.root.hidden = false
  began = performance.now()
  saidAt = began
  stage = 'page'
  p.fill.style.transform = 'scaleX(0)'
  run(p)
  reach('app')
}

const wait = (ms: number) => new Promise<void>((done) => setTimeout(done, ms))

/** Every step done has been shown, the last one for its time. */
function allSaid(p: Parts): Promise<void> {
  if (queued.length === 0 && !pacing) return wait(Math.max(0, saidAt + SAY_AT_LEAST_MS - performance.now()))
  const said = new Promise<void>((done) => (drained = done))
  pace(p)
  return said.then(() => wait(Math.max(0, saidAt + SAY_AT_LEAST_MS - performance.now())))
}

/** The arrival lands whole and every step is said; then the bar fills, before anything leaves. */
async function ready(p: Parts): Promise<void> {
  await Promise.all([wait(INTRO_MS - (performance.now() - began)), allSaid(p)])
  filling = true
  const full = new Promise<void>((done) => (filled = done))
  await Promise.race([full, wait(900)])
}

const animate = (el: Element, frames: Keyframe[], ms: number, delay = 0, easing = EASE) =>
  el.animate(frames, { duration: ms, delay, easing, fill: 'forwards' })

/** To nothing, from wherever it stands (the slow line may not have shown yet). */
const gone: Keyframe[] = [{ opacity: 0 }]

/**
 * The lockup glides into the corner lockup and becomes it: its mark onto that mark, at that size, crossing over to the
 * real one as it lands, so the two never show at once. The void lifts off the screen already drawn under it.
 */
async function fly(p: Parts, to: Element): Promise<void> {
  const from = p.mark.getBoundingClientRect()
  const box = p.lockup.getBoundingClientRect()
  const path = flight(from, to.getBoundingClientRect())
  const landing = to.closest('.mark, .screen-mark') ?? to
  p.lockup.style.transformOrigin = `${String(from.x + from.width / 2 - box.x)}px ${String(from.y + from.height / 2 - box.y)}px`
  const there = `translate(-50%, -50%) translate(${String(path.x)}px, ${String(path.y)}px) scale(${String(path.scale)})`
  const crossing = [
    animate(p.lockup, [{ transform: 'translate(-50%, -50%)' }, { transform: there }], FLIGHT_MS, 0, GLIDE),
    animate(p.lockup, [{ opacity: 1, offset: 0.72 }, { opacity: 0 }], FLIGHT_MS),
    animate(landing, [{ opacity: 0 }, { opacity: 0, offset: 0.66 }, { opacity: 1 }], FLIGHT_MS),
    animate(p.bar, gone, 260),
    animate(p.step, gone, 260),
    animate(p.slow, gone, 260),
    animate(p.ground, gone, 560, 220, GLIDE),
  ]
  try {
    await Promise.all(crossing.map((a) => a.finished))
  } finally {
    crossing[2]?.cancel()
    p.lockup.style.removeProperty('transform-origin')
  }
}

/** Without a corner lockup to land in, the lockup dissolves where the screen appears. */
async function dissolve(p: Parts): Promise<void> {
  await Promise.all(
    [
      animate(p.lockup, [{ opacity: 0, transform: 'translate(-50%, -50%) scale(1.04)' }], 520),
      animate(p.bar, gone, 260),
      animate(p.step, gone, 260),
      animate(p.slow, gone, 260),
      animate(p.ground, gone, 560, 120, GLIDE),
    ].map((a) => a.finished),
  )
}

async function leave(p: Parts, exit: Exit): Promise<void> {
  if (exit === 'none') return
  if (exit !== 'fade') {
    queued.push('ready')
    await ready(p)
  }
  p.root.style.pointerEvents = 'none'
  // Where it lands is looked up now: the screen under it may have changed while it waited.
  const to = exit === 'fly' ? document.querySelector(LANDING) : null
  if (exit === 'fade') await animate(p.root, gone, 160).finished
  else if (to && to.getBoundingClientRect().width > 0) await fly(p, to)
  else await dissolve(p)
}

/** Put away, as index.html drew it, for a later cover. */
function putAway(p: Parts): void {
  p.root.hidden = true
  p.root.style.pointerEvents = ''
  delete p.root.dataset.cover
  for (const el of [p.root, p.ground, p.lockup, p.bar, p.step, p.slow, p.fill]) {
    for (const a of el.getAnimations()) a.cancel()
  }
  for (const type of KEYS) window.removeEventListener(type, guard, true)
  live = null
  cancelAnimationFrame(frame)
  clearTimeout(pacing)
  frame = 0
  pacing = 0
  stage = 'page'
  queued = []
  drained = null
  filling = false
  filled = null
}

/**
 * All is ready: the arrival lands, the bar fills and the opening hands off. `quick`: it opens on anything but the
 * Studio (a link that failed): a short fade, no arrival held in front of it. Once, however often it is called.
 */
export function open(quick = false): Promise<void> {
  if (leaving) return leaving
  const p = parts()
  if (!p || p.root.hidden) return Promise.resolve()
  const flyTo = document.querySelector(LANDING) !== null
  const exit = exitFor({ shownFor: performance.now() - began, reduced: reduced(), flyTo, quick })
  leaving = leave(p, exit)
    .catch(() => undefined)
    .finally(() => {
      putAway(p)
      leaving = null
    })
  return leaving
}
