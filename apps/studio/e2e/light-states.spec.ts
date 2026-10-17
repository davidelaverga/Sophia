// The states on paper (docs/plans/light-states.md, informe-claro D20): the ink at an alpha sank what is chosen, so the
// lens thumb stood 1.18:1 darker than its track, the dock's squares at rest under the dock and the open conversation a
// slab under its list. Now each is a white piece over what holds it, and a field is white. In the room (the controls)
// each keeps the alpha it has today.
import { expect, test, type Page } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

const CONVERSATIONS = '/room.html?demo=1&conversations=1&place=conversations'
const CALL = '/room.html?demo=1&call=on&people=2&floor=1&sophia=listening'

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

/** One sRGB channel, linear. */
const channel = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4)
const parts = (s: string) => (/rgba?\(([^)]+)\)/.exec(s)?.[1] ?? '0, 0, 0, 0').split(',').map(Number)
/** A colour laid over an opaque ground, as the eye gets it: its alpha composited first. */
function over(top: string, ground: string): string {
  const [r = 0, g = 0, b = 0, a = 1] = parts(top)
  const [gr = 0, gg = 0, gb = 0] = parts(ground)
  const mix = (c: number, u: number) => c * a + u * (1 - a)
  return `rgb(${String(mix(r, gr))}, ${String(mix(g, gg))}, ${String(mix(b, gb))})`
}
/** An opaque colour's share of the light. */
function lum(s: string): number {
  const [r = 0, g = 0, b = 0] = parts(s)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** The fill of a chosen piece and of its track, each as painted over the page (a track of glass lets the page through). */
interface Pair {
  piece: string
  track: string
}
function seen({ piece, track }: Pair, page: string): Pair {
  const ground = over(track, page)
  return { piece: over(piece, ground), track: ground }
}

/** The lens bar's thumb, its track, and the page, once the thumb lies under the lens that is on. */
async function lensThumb(page: Page) {
  const lenses = page.getByRole('tablist', { name: 'Your view' })
  await expect(lenses).toHaveAttribute('data-thumb-ready')
  await expect
    .poll(() => lenses.evaluate((el) => parseFloat(getComputedStyle(el).getPropertyValue('--thumb-w'))))
    .toBeGreaterThan(0)
  return lenses.evaluate((el) => ({
    piece: getComputedStyle(el, '::before').backgroundColor,
    track: getComputedStyle(el).backgroundColor,
    page: getComputedStyle(document.body).backgroundColor,
  }))
}

/** The open conversation's row, its list, the title filter's field, and the page. */
const openRow = (page: Page) =>
  page.evaluate(() => {
    // oxlint-disable-next-line unicorn/consistent-function-scoping -- page.evaluate sends only this function to the page
    const fill = (sel: string) => {
      const el = document.querySelector(sel)
      return el ? getComputedStyle(el).backgroundColor : 'none'
    }
    return {
      piece: fill('.conv-row[aria-pressed="true"]'),
      track: fill('.conv-list'),
      field: fill('.conv-filter > input'),
      page: getComputedStyle(document.body).backgroundColor,
    }
  })

/** The dock's presses at rest (not on, not the primary; a clear one left out), with the dock and the page. */
const dockPresses = (page: Page) =>
  page.evaluate(() => {
    const dock = document.querySelector('.dock')
    const presses = [...(dock?.querySelectorAll('button.round, button.pill') ?? [])].filter(
      (b) =>
        !b.matches('.primary, [aria-pressed="true"], :disabled') &&
        b.getBoundingClientRect().width > 0 &&
        getComputedStyle(b).backgroundColor !== 'rgba(0, 0, 0, 0)',
    )
    return {
      presses: presses.map((b) => ({
        name: b.getAttribute('aria-label') ?? b.textContent.trim(),
        fill: getComputedStyle(b).backgroundColor,
      })),
      track: dock ? getComputedStyle(dock).backgroundColor : 'none',
      page: getComputedStyle(document.body).backgroundColor,
    }
  })

test('light · the room: the lens thumb stands lighter than its track, not 1.18:1 darker', async ({ page }) => {
  await page.goto('/room.html?demo=1&theme=light')
  await drawn(page, DRAWN.room)
  const read = await lensThumb(page)
  const { piece, track } = seen(read, read.page)
  expect(lum(piece), `thumb ${read.piece} over track ${read.track} on ${read.page}`).toBeGreaterThan(lum(track))
})

test('light · a call: the dock’s presses at rest stand lighter than the dock', async ({ page }) => {
  await page.goto(`${CALL}&theme=light`)
  await drawn(page, DRAWN.room.slice(0, 1))
  const read = await dockPresses(page)
  expect(read.presses.length).toBeGreaterThan(0)
  for (const press of read.presses) {
    const { piece, track } = seen({ piece: press.fill, track: read.track }, read.page)
    expect(lum(piece), `${press.name}: ${press.fill} over the dock ${read.track}`).toBeGreaterThan(lum(track))
  }
})

test('light · Conversations: the open row stands lighter than its list, and the title filter is a white field', async ({
  page,
}) => {
  await page.goto(`${CONVERSATIONS}&theme=light`)
  await drawn(page, DRAWN.conversations)
  const read = await openRow(page)
  expect(read.piece).not.toBe('none')
  const { piece, track } = seen(read, read.page)
  expect(lum(piece), `row ${read.piece} over list ${read.track}`).toBeGreaterThan(lum(track))
  expect(read.field).toBe('rgb(255, 255, 255)')
})

test('the room keeps its lens thumb, its dock’s presses at rest and its open row', async ({ page }) => {
  await page.goto('/room.html?demo=1')
  await drawn(page, DRAWN.room)
  expect((await lensThumb(page)).piece).toBe('rgba(236, 235, 241, 0.08)')

  await page.goto(CALL)
  await drawn(page, DRAWN.room.slice(0, 1))
  const dock = await dockPresses(page)
  expect(dock.presses.length).toBeGreaterThan(0)
  for (const press of dock.presses)
    expect(['rgba(236, 235, 241, 0.03)', 'rgba(236, 235, 241, 0.04)']).toContain(press.fill)

  await page.goto(CONVERSATIONS)
  await drawn(page, DRAWN.conversations)
  const row = await openRow(page)
  expect(row.piece).toBe('rgba(236, 235, 241, 0.075)')
  expect(row.field).toBe('rgba(236, 235, 241, 0.03)')
  await expect(page.locator('.conv-row[aria-pressed="true"]')).toHaveCSS('box-shadow', 'none')
})
