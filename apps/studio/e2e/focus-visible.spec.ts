import { expect, test, type Page } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

// Where the keyboard is, a person sees (docs/plans/focus-visible.md, WCAG 2.4.7): every stop Tab reaches looks
// different focused than at rest, itself or the row it sits in (a field draws its focus on its row, :focus-within).
// On the fixture pages, once drawn; transitions off, so what is read is the end state, not a frame on its way.

const PAGES = [
  ['sign-in', '/signin.html', DRAWN.signin],
  ['the door', '/join.html?demo=1', DRAWN.join],
  ['home', '/home.html?demo=1', DRAWN.home],
  ['personal', '/personal.html?demo=1', DRAWN.personal],
  ['the room', '/room.html?demo=1', DRAWN.room],
  ['Conversations', '/room.html?demo=1&conversations=1&place=conversations', DRAWN.conversations],
  ['Goals', '/room.html?demo=1&place=goals', DRAWN.goals],
  ['Tasks', '/room.html?demo=1&place=work', DRAWN.tasks],
  ['Knowledge', '/room.html?demo=1&place=knowledge', DRAWN.knowledge],
  ['Updates', '/room.html?demo=1&place=updates', DRAWN.updates],
  ['Resources', '/resources.html', DRAWN.resources],
  ['the work space', '/work.html', DRAWN.work],
] as const

/** How many stops each page is walked through: past its bar, into its content. */
const STOPS = 40

/**
 * In the page: the stop Tab has reached; whether the walk has met it before (it has gone round); and whether it, with
 * the three rows around it, shows anything a person sees more focused than at rest. What doesn't show isn't counted:
 * an outline with no width or no ink, a transparent ground or border. Read by CSS alone: a state set by a script on
 * blur lands after both reads, so it can only fail a stop, never pass one.
 */
function readStop() {
  const el = document.activeElement
  if (!(el instanceof HTMLElement) || el === document.body) return null
  // Met by element, not by name: two «Copy» presses are two stops.
  if (el.dataset.walked !== undefined) return { again: true, name: '', shows: true }
  el.dataset.walked = ''
  // A colour's alpha as Chromium computes it: `rgba(r, g, b, a)`, or `… / a)` (color(srgb …), oklch …); else opaque.
  const ALPHA = /rgba\((?:\s*[\d.]+,){3}\s*([\d.]+)\)|\/\s*([\d.]+)\)$/
  const alpha = (c: string) => {
    const found = ALPHA.exec(c)
    return found ? Number(found[1] ?? found[2]) : 1
  }
  const shown = (s: CSSStyleDeclaration) =>
    [
      s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 1 && alpha(s.outlineColor) > 0
        ? `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`
        : '',
      s.boxShadow === 'none' ? '' : s.boxShadow,
      // Each edge drawn (a line field's focus is its bottom edge).
      ...(['Top', 'Right', 'Bottom', 'Left'] as const).map((side) =>
        parseFloat(s[`border${side}Width`]) > 0 && alpha(s[`border${side}Color`]) > 0 ? s[`border${side}Color`] : '',
      ),
      alpha(s.backgroundColor) > 0 ? s.backgroundColor : '',
      s.textDecorationLine,
      s.color,
    ].join('|')
  const look = () => {
    const parts: string[] = []
    for (let up: Element | null = el, n = 0; up && n < 4; up = up.parentElement, n++) {
      for (const pseudo of [null, '::before', '::after']) parts.push(shown(getComputedStyle(up, pseudo)))
    }
    return parts.join('/')
  }
  const words = (el.getAttribute('aria-label') ?? el.textContent).trim().replace(/\s+/g, ' ')
  const name = `${el.tagName.toLowerCase()} «${(words || (el.getAttribute('placeholder') ?? '')).slice(0, 40)}»`
  const focused = look()
  el.blur()
  const rest = look()
  // Given back where it was: the next Tab goes on from here, as a person's would.
  el.focus({ preventScroll: true })
  return { again: false, name, shows: focused !== rest }
}

/** Walks a page by Tab: the stops it measured, and those that show nothing focused. */
async function walk(page: Page) {
  const unseen: string[] = []
  let measured = 0
  for (let i = 0; i < STOPS; i++) {
    await page.keyboard.press('Tab')
    const stop = await page.evaluate(readStop)
    if (!stop) continue
    if (stop.again) break // round again
    measured += 1
    if (!stop.shows) unseen.push(stop.name)
  }
  return { measured, unseen }
}

for (const [name, url, parts] of PAGES) {
  test(`focus · on ${name}, every stop Tab reaches shows it has the focus`, async ({ page }) => {
    await page.goto(url)
    await drawn(page, parts)
    await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; }' })
    const { measured, unseen } = await walk(page)
    expect(measured).toBeGreaterThan(0)
    expect(unseen).toEqual([])
  })
}
