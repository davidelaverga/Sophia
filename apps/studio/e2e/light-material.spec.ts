// The room's material on paper (docs/plans/light-material.md, informe-claro D8): the primary's bevel took the void and
// on paper turned lighter below it (1.42:1), as if lit from underneath; the glass composed the page's own colour, so the
// sign-in's field stood 1.00:1 apart from the page; the lift was white over white. Now the bevel is darker below in both
// themes, the field is white over paper with an ink bevel under it, and the glass stays glass only over the stage. In
// the room (the control) the glass is the room's, on and off the stage.
import { expect, test, type Page } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

const SIGN_IN = '/signin.html'
const CALL = '/room.html?demo=1&call=on&people=2&floor=1&sophia=listening'
const ROOM_GLASS = 'rgba(12, 11, 17, 0.74)' // the room's glass, kept

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
const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)

/** The light of each row down one column of the window, from y0 to y1, read from a screenshot of it. */
async function column(page: Page, x: number, y0: number, y1: number): Promise<number[]> {
  const clip = { x: Math.round(x), y: Math.round(y0), width: 1, height: Math.round(y1) - Math.round(y0) }
  const png = (await page.screenshot({ clip })).toString('base64')
  const rows = await page.evaluate(async (data) => {
    const img = new Image()
    img.src = `data:image/png;base64,${data}`
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return []
    ctx.drawImage(img, 0, 0)
    const px = ctx.getImageData(0, 0, 1, img.naturalHeight).data
    return Array.from({ length: img.naturalHeight }, (_, i) => Array.from(px.slice(i * 4, i * 4 + 3)))
  }, png)
  return rows.map(([r = 0, g = 0, b = 0]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b))
}

/** The sign-in drawn and at rest: its words arrived, nothing focused, the pointer away. */
async function signIn(page: Page, theme: string) {
  await page.goto(`${SIGN_IN}?theme=${theme}`)
  await drawn(page, DRAWN.signin)
  await page.evaluate(async () => {
    const arriving = document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity)
    await Promise.all(arriving.map((a) => a.finished.catch(() => null)))
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  })
  await page.mouse.move(0, 0)
}

const box = async (page: Page, selector: string) => {
  const b = await page.locator(selector).first().boundingBox()
  if (!b) throw new Error(`${selector} is not drawn`)
  return b
}

for (const theme of ['dark', 'light']) {
  test(`sign-in · ${theme} · the primary's bevel is darker below its face, as light from above`, async ({ page }) => {
    await signIn(page, theme)
    const b = await box(page, '.screen-body .pill.primary')
    // Down its left padding, clear of the words and the corner: the face, then its last rows (the bevel, the border).
    const rows = await column(page, b.x + 8, b.y + b.height / 2, b.y + b.height)
    const face = rows[0] ?? NaN
    const below = Math.min(...rows.slice(-3))
    expect(below, `face ${face.toFixed(4)}, below ${below.toFixed(4)}`).toBeLessThan(face)
    expect(ratio(face, below)).toBeGreaterThanOrEqual(1.15)
  })
}

test('light · sign-in: the field stands apart from the page, white over paper, its lift an ink bevel below', async ({
  page,
}) => {
  await signIn(page, 'light')
  const field = page.locator('.screen-body .field').first()
  const b = await box(page, '.screen-body .field')
  const mid = b.y + b.height / 2
  // Inside its padding, before the words; and the page 12 px to its left.
  const [inside = NaN] = await column(page, b.x + 7, mid, mid + 1)
  const [outside = NaN] = await column(page, b.x - 12, mid, mid + 1)
  expect(ratio(inside, outside), `inside ${inside.toFixed(4)}, page ${outside.toFixed(4)}`).toBeGreaterThanOrEqual(1.04)
  await expect(field).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  // The lift under the face in the paper's ink, as the room's sheen is over it: no white line on top.
  await expect(field).toHaveCSS('box-shadow', 'rgba(29, 27, 34, 0.04) 0px -1px 0px 0px inset')
})

/** Opens the room's chat beside the stage, once its slide has finished. */
async function openChat(page: Page) {
  const panel = page.getByRole('complementary', { name: 'Chat' })
  if (!(await panel.isVisible())) await page.getByRole('button', { name: 'Chat', exact: true }).click()
  await expect(panel).toBeVisible()
  await panel.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)))
  return panel
}

const fill = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor)

for (const [theme, overStage, offStage] of [
  ['light', 'rgba(251, 248, 243, 0.8)', 'rgb(255, 255, 255)'],
  ['dark', ROOM_GLASS, ROOM_GLASS],
] as const) {
  test(`room · ${theme} · glass over the stage; off it, on paper, an opaque sheet`, async ({ page }) => {
    await page.goto(`${CALL}&theme=${theme}`)
    // In a call the stage shows the people, not «The room is ready»: the page is drawn once its bar is.
    await drawn(page, DRAWN.room.slice(0, 1))
    await expect(page.locator('.dock')).toBeVisible()
    // Over her orb and the tiles' video the dock and the panel toggles let the stage through.
    expect(await fill(page, '.dock')).toBe(overStage)
    expect(await fill(page, '.panel-toggles')).toBe(overStage)
    // The chat's message bar sits in the panel, off the stage.
    await openChat(page)
    expect(await fill(page, '.side-panel .message-bar')).toBe(offStage)
  })
}
