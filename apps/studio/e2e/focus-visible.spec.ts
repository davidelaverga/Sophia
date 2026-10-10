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

/** Each stop Tab reaches whose look, with the three rows around it, is the same focused as at rest. */
async function unseenStops(page: Page): Promise<string[]> {
  const unseen: string[] = []
  const passed = new Set<string>()
  for (let i = 0; i < STOPS; i++) {
    await page.keyboard.press('Tab')
    const stop = await page.evaluate(() => {
      const el = document.activeElement
      if (!(el instanceof HTMLElement) || el === document.body) return null
      const look = () => {
        const parts: string[] = []
        for (let up: Element | null = el, n = 0; up && n < 4; up = up.parentElement, n++) {
          for (const pseudo of [null, '::before', '::after']) {
            const s = getComputedStyle(up, pseudo)
            parts.push(
              `${s.outline}|${s.boxShadow}|${s.backgroundColor}|${s.borderColor}|${s.textDecorationLine}|${s.color}`,
            )
          }
        }
        return parts.join('/')
      }
      const words = (el.getAttribute('aria-label') ?? el.textContent).trim().replace(/\s+/g, ' ')
      const name = words || (el.getAttribute('placeholder') ?? '')
      const focused = look()
      el.blur()
      const rest = look()
      el.focus({ preventScroll: true })
      return { name: `${el.tagName.toLowerCase()} «${name.slice(0, 40)}»`, same: focused === rest }
    })
    if (!stop) continue
    if (passed.has(stop.name)) break // round again
    passed.add(stop.name)
    if (stop.same) unseen.push(stop.name)
  }
  return unseen
}

for (const [name, url, parts] of PAGES) {
  test(`focus · on ${name}, every stop Tab reaches shows it has the focus`, async ({ page }) => {
    await page.goto(url)
    await drawn(page, parts)
    await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; }' })
    expect(await unseenStops(page)).toEqual([])
  })
}
