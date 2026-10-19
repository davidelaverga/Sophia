// The surfaces by level on paper (docs/plans/light-surfaces.md, informe-claro D6): what painted the plane stood 1.07:1
// under the page, so a list, a panel, a sheet and a cover sank where the room raises them. Now a well stands a step over
// the page and a step under a raised white: Conversations' list over its bar on a phone, the room's chat over the stage
// beside it. In the room (the control) every one keeps the plane it has today.
import { expect, test, type Page } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

const PLANE = 'rgb(11, 10, 15)' // the room's plane, kept
/** A box's own fill, opaque: a missing box or a clear one would read as white and pass for a step up. */
const OPAQUE = /^rgb\(\d+, \d+, \d+\)$/
const CALL = '/room.html?demo=1&call=on&people=2&floor=1&sophia=listening'
const PLACES = [
  [
    'Conversations',
    '/room.html?demo=1&conversations=1&place=conversations',
    DRAWN.conversations,
    ['.conv-list', '.conv-context'],
  ],
  ['Knowledge', '/room.html?demo=1&place=knowledge', DRAWN.knowledge, ['.report-card-cover']],
] as const

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
/** A colour's share of the light, laid over an opaque ground when it lets some through (a bar's glass). */
function lum(s: string, under = 'rgb(255, 255, 255)'): number {
  const [r = 0, g = 0, b = 0, a = 1] = parts(s)
  const [ur = 0, ug = 0, ub = 0] = parts(under)
  const mix = (c: number, u: number) => channel(c * a + u * (1 - a))
  return 0.2126 * mix(r, ur) + 0.7152 * mix(g, ug) + 0.0722 * mix(b, ub)
}
const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)

/** The page's ground and the fill of the first box each selector names. */
const fills = (page: Page, selectors: readonly string[]) =>
  page.evaluate(
    (sels) => ({
      page: getComputedStyle(document.body).backgroundColor,
      boxes: sels.map((sel) => {
        const el = document.querySelector(sel)
        return el ? getComputedStyle(el).backgroundColor : 'none'
      }),
    }),
    selectors,
  )

/** The colour drawn at one point of the window, read from a screenshot of that pixel. */
async function pixel(page: Page, x: number, y: number): Promise<string> {
  const png = (await page.screenshot({ clip: { x, y, width: 1, height: 1 } })).toString('base64')
  return page.evaluate(async (data) => {
    const img = new Image()
    img.src = `data:image/png;base64,${data}`
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return 'none'
    ctx.drawImage(img, 0, 0)
    const [r = 0, g = 0, b = 0] = ctx.getImageData(0, 0, 1, 1).data
    return `rgb(${r}, ${g}, ${b})`
  }, png)
}

/** Opens the room's chat beside the stage, once its slide has finished. */
async function openChat(page: Page) {
  const panel = page.getByRole('complementary', { name: 'Chat' })
  if (!(await panel.isVisible())) await page.getByRole('button', { name: 'Chat', exact: true }).click()
  await expect(panel).toBeVisible()
  await panel.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)))
  return panel
}

for (const [name, url, drawnParts, wells] of PLACES) {
  test(`light · ${name}: a well stands a step over the page, never under it`, async ({ page }) => {
    await page.goto(`${url}&theme=light`)
    await drawn(page, drawnParts)
    const seen = await fills(page, wells)
    for (const [i, fill] of seen.boxes.entries()) {
      const said = `${wells[i] ?? ''}: ${fill} on ${seen.page}`
      expect(fill, said).toMatch(OPAQUE)
      expect(lum(fill), said).toBeGreaterThan(lum(seen.page))
      expect(ratio(lum(fill), lum(seen.page)), said).toBeGreaterThanOrEqual(1.02)
    }
  })

  test(`${name}: the room keeps its plane under each well`, async ({ page }) => {
    await page.goto(url)
    await drawn(page, drawnParts)
    expect((await fills(page, wells)).boxes).toEqual(wells.map(() => PLANE))
  })
}

test('light · Knowledge: a cover sits a step under its white card and a step over the page', async ({ page }) => {
  await page.goto('/room.html?demo=1&place=knowledge&theme=light')
  await drawn(page, DRAWN.knowledge)
  const seen = await fills(page, ['.report-card-cover', '.card.report-card'])
  const [cover = 'none', card = 'none'] = seen.boxes
  expect(card).toBe('rgb(255, 255, 255)')
  expect(cover).toMatch(OPAQUE)
  expect(lum(seen.page), `page ${seen.page} under cover ${cover}`).toBeLessThan(lum(cover))
  expect(lum(cover), `cover ${cover} under card ${card}`).toBeLessThan(lum(card))
})

test('light · a sheet (Invite) stands over the page, its head with it', async ({ page }) => {
  await page.goto('/room.html?demo=1&theme=light')
  await drawn(page, DRAWN.room)
  await page.getByRole('button', { name: 'Invite' }).click()
  await expect(page.getByRole('tab', { name: 'Guests' })).toBeVisible()
  const seen = await fills(page, ['.sheet', '.sheet-top'])
  const [sheet = 'none', top = 'none'] = seen.boxes
  expect(sheet).toMatch(OPAQUE)
  expect(top).toBe(sheet)
  expect(lum(sheet), `${sheet} on ${seen.page}`).toBeGreaterThan(lum(seen.page))
})

test('light @phone · Conversations: the list stands at or over its bar, not 1.07:1 under it', async ({ page }) => {
  await page.goto('/room.html?demo=1&conversations=1&place=conversations&theme=light')
  await expect(page.getByRole('region', { name: 'All conversations' }).getByRole('listitem').first()).toBeVisible()
  const seen = await fills(page, ['.conv-list', '.topbar'])
  const [list = 'none', bar = 'none'] = seen.boxes
  // The bar is glass over the page: its colour there is what the eye compares the list with.
  expect(list).toMatch(OPAQUE)
  expect(bar).not.toBe('none')
  expect(lum(list), `list ${list}, bar ${bar} over ${seen.page}`).toBeGreaterThanOrEqual(lum(bar, seen.page))
})

test('light · the room’s chat stands 1.08:1 or more over the stage beside it', async ({ page }) => {
  await page.goto(`${CALL}&theme=light`)
  await drawn(page, DRAWN.room.slice(0, 1))
  const box = await (await openChat(page)).boundingBox()
  if (!box) throw new Error('the chat has no box')
  // The panel's gutter, and the stage 24 px left of the panel, above the people and clear of the lens bar.
  const panel = await pixel(page, box.x + 8, box.y + box.height / 2)
  const stage = await pixel(page, box.x - 24, 200)
  expect(lum(panel), `panel ${panel}, stage ${stage}`).toBeGreaterThan(lum(stage))
  expect(ratio(lum(panel), lum(stage)), `panel ${panel}, stage ${stage}`).toBeGreaterThanOrEqual(1.08)
})

test('the room’s chat keeps its plane beside the stage', async ({ page }) => {
  await page.goto(CALL)
  await drawn(page, DRAWN.room.slice(0, 1))
  await openChat(page)
  expect((await fills(page, ['.side-panel'])).boxes).toEqual([PLANE])
})
