// Live states on paper (docs/plans/light-live.md): where the room lights a live piece with a glow, paper rings a large
// one in its accent and lets a small light be its own fill; a halo of colour only darkened the paper around it. In the
// room the glows stay as they were.
import { expect, test, type Locator, type Page } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

/** A call on camera, Marco speaking: his tile is a dark picture in the gallery (fake-people.ts). */
const CALL = '/room.html?call=on&people=2&video=camera&speaking=1'

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
const channel = (c: number) => {
  const v = c / 255
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
const lum = ([r = 0, g = 0, b = 0]: readonly number[]) =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
const ratio = (a: readonly number[], b: readonly number[]) =>
  (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05)

/** What is arriving (a tile's entrance, a ring's transition) is waited for; what loops for ever is not. */
const settled = (page: Page) =>
  page.evaluate(async () => {
    const arriving = document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity)
    await Promise.all(arriving.map((a) => a.finished.catch(() => null)))
  })

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('not on screen')
  return box
}

/** The page's pixels as drawn at each point, [r, g, b]. Decoded as an image: the fixture answers every fetch. */
async function pixels(page: Page, points: readonly (readonly [number, number])[]): Promise<number[][]> {
  const png = (await page.screenshot({ animations: 'disabled' })).toString('base64')
  return page.evaluate(
    async ([data, at]) => {
      const img = new Image()
      img.src = `data:image/png;base64,${data}`
      await img.decode()
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      ctx?.drawImage(img, 0, 0)
      return at.map(([x, y]) => Array.from(ctx?.getImageData(x, y, 1, 1).data.slice(0, 3) ?? []))
    },
    [png, points] as const,
  )
}

test('light · on camera, who speaks is ringed: two solid pixels of the warm, 3:1 or more on the stage', async ({
  page,
}) => {
  await page.goto(`${CALL}&theme=light`)
  const tile = page.locator('.gallery .tile[data-speaking]')
  await expect(tile.locator('video')).toBeVisible()
  await settled(page)
  const box = await boxOf(tile)
  // At each side's middle: the ring a pixel out, the stage six out (the gallery's gap is 8).
  const [left, right, y] = [Math.floor(box.x), Math.ceil(box.x + box.width), Math.round(box.y + box.height / 2)]
  const [ringL = [], stageL = [], ringR = [], stageR = []] = await pixels(page, [
    [left - 1, y],
    [left - 6, y],
    [right, y],
    [right + 5, y],
  ])
  expect(ratio(ringL, stageL)).toBeGreaterThanOrEqual(3)
  expect(ratio(ringR, stageR)).toBeGreaterThanOrEqual(3)
  await expect(tile).toHaveCSS('box-shadow', 'rgb(150, 83, 40) 0px 0px 0px 2px')
})

test('the room on camera: who speaks keeps the warm ring and its glow', async ({ page }) => {
  await page.goto(CALL)
  const tile = page.locator('.gallery .tile[data-speaking]')
  await expect(tile.locator('video')).toBeVisible()
  await expect(tile).toHaveCSS(
    'box-shadow',
    'rgba(241, 220, 199, 0.6) 0px 0px 0px 1px, rgba(241, 220, 199, 0.16) 0px 0px 28px 0px',
  )
})

/** Points of the page around a box, 2 to 8 px out from each side's middle. */
function around(box: { x: number; y: number; width: number; height: number }): [number, number][] {
  const [cx, cy] = [Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2)]
  const [l, r, t, b] = [
    Math.floor(box.x),
    Math.ceil(box.x + box.width),
    Math.floor(box.y),
    Math.ceil(box.y + box.height),
  ]
  return [2, 3, 4, 6, 8].flatMap((d): [number, number][] => [
    [l - 1 - d, cy],
    [r + d, cy],
    [cx, t - 1 - d],
    [cx, b + d],
  ])
}

test('light · Home: the small light by Continue is its own fill, with no blotch on the paper around it', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/home.html?theme=light')
  await drawn(page, DRAWN.home)
  const dot = page.locator('.hw-you .hw-her:not(.locked)')
  await expect(dot).toHaveCSS('background-color', 'rgb(85, 70, 184)')
  await settled(page)
  const points = around(await boxOf(dot))
  // The same points drawn with the dot and without it: the paper around it is the paper.
  const shown = await pixels(page, points)
  await page.addStyleTag({ content: '.hw-her { visibility: hidden !important }' })
  const bare = await pixels(page, points)
  const worst = Math.max(...shown.map((px, i) => ratio(px, bare[i] ?? px)))
  expect(worst).toBeLessThanOrEqual(1.03)
})

test('Home in the room: the small light by Continue keeps its glow', async ({ page }) => {
  await page.goto('/home.html')
  await drawn(page, DRAWN.home)
  await expect(page.locator('.hw-you .hw-her:not(.locked)')).toHaveCSS(
    'box-shadow',
    'rgba(156, 130, 245, 0.55) 0px 0px 10px 2px',
  )
})
