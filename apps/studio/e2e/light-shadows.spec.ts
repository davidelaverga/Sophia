// Shadows on paper (docs/plans/light-shadows.md): every piece casts one of paper's three levels, a crisp contact under
// its edge and a soft ambient a negative spread keeps under it. In a call on a phone the dock and the panel toggles
// float with no grey blotch around them (1.15:1 or less four pixels out), yet still cast their contact; a card rests on
// the page on a contact edge the eye sees; the room keeps its shadows to the value.
import { expect, test, type Locator, type Page } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

interface Box {
  x: number
  y: number
  width: number
  height: number
}

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  // Each fixture page keeps its own list of requests it didn't expect.
  const unexpected = await page.evaluate(() => [
    ...(window.fixture?.unexpected ?? []),
    ...(window.resourcesFixture?.unexpected ?? []),
  ])
  expect(unexpected).toEqual([])
})

/** Only `selector`'s own boxes painted over the bare page, their contents hidden too: what darkens the paper around
 *  them is their shadow alone. */
async function alone(page: Page, selector: string) {
  await page.addStyleTag({
    content: `body * { visibility: hidden !important } ${selector} { visibility: visible !important }`,
  })
}

/**
 * In the page: how much darker than the bare paper a shot gets around `box`, as a contrast. `blotch`: the darkest
 * pixel `gap` px or more outside it. `contact`: the darker of the two rows wholly under its bottom edge (an edge on a
 * half pixel leaves its own line in the row it ends in), across its middle half.
 */
async function darkest(args: { png: string; clip: Box; box: Box; gap: number; kind: 'blotch' | 'contact' }) {
  const img = new Image()
  img.src = `data:image/png;base64,${args.png}`
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return 0
  ctx.drawImage(img, 0, 0)
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  const { box, clip, gap } = args
  const scale = canvas.width / clip.width
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- page.evaluate sends only this function to the page
  const linear = (c = 0) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4)
  const light = (rgb: ArrayLike<number>, i = 0) =>
    0.2126 * linear(rgb[i]) + 0.7152 * linear(rgb[i + 1]) + 0.0722 * linear(rgb[i + 2])
  const paper = light((getComputedStyle(document.body).backgroundColor.match(/\d+/g) ?? []).map(Number))
  const out = (x: number, y: number) =>
    Math.hypot(Math.max(box.x - x, 0, x - box.x - box.width), Math.max(box.y - y, 0, y - box.y - box.height))
  const edge = Math.ceil(box.y + box.height)
  const under = (x: number, y: number) =>
    y >= edge && y < edge + 2 && x >= box.x + box.width / 4 && x <= box.x + (box.width * 3) / 4
  let lowest = paper
  const rows = new Map<number, number[]>()
  for (let n = 0; n < canvas.width * canvas.height; n++) {
    const row = Math.floor(n / canvas.width)
    const x = clip.x + ((n % canvas.width) + 0.5) / scale
    const y = clip.y + (row + 0.5) / scale
    if (args.kind === 'blotch' && out(x, y) >= gap) lowest = Math.min(lowest, light(data, n * 4))
    if (args.kind === 'contact' && under(x, y)) rows.set(row, [...(rows.get(row) ?? []), light(data, n * 4)])
  }
  for (const values of rows.values()) lowest = Math.min(lowest, values.reduce((sum, v) => sum + v, 0) / values.length)
  return (paper + 0.05) / (lowest + 0.05)
}

/** `target` alone over the page, shot with `pad` px around it (within the view): how dark its shadow gets. */
async function shadowOf(page: Page, target: Locator, kind: 'blotch' | 'contact', pad = 48) {
  await target.scrollIntoViewIfNeeded()
  const box = await target.boundingBox()
  const view = page.viewportSize()
  if (!box || !view) throw new Error('nothing to measure')
  const x = Math.max(0, Math.floor(box.x - pad))
  const y = Math.max(0, Math.floor(box.y - pad))
  const clip = {
    x,
    y,
    width: Math.min(view.width, Math.ceil(box.x + box.width + pad)) - x,
    height: Math.min(view.height, Math.ceil(box.y + box.height + pad)) - y,
  }
  const png = (await page.screenshot({ clip, animations: 'disabled' })).toString('base64')
  return page.evaluate(darkest, { png, clip, box, gap: 4, kind })
}

test('@phone · light · in a call the dock and the panel toggles float with no blotch, on a contact still', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/room.html?demo=1&call=on&people=3&floor=1&theme=light')
  await drawn(page, DRAWN.room.slice(0, 1))
  const dock = page.locator('.dock')
  const toggles = page.locator('.room-stage .panel-toggles')
  await expect(dock.getByRole('button', { name: 'Leave the room' })).toBeVisible()
  await expect(toggles).toBeVisible()
  await alone(page, '.dock, .room-stage .panel-toggles')
  for (const [name, part] of [
    ['the dock', dock],
    ['the panel toggles', toggles],
  ] as const) {
    // A third of the room's shadow left about 1.26:1 here, four pixels under them (the evaluation saw ~1.4 on the
    // stage: docs/plans/light-shadows.md).
    expect(await shadowOf(page, part, 'blotch'), `${name}: four pixels out`).toBeLessThanOrEqual(1.15)
    expect(await shadowOf(page, part, 'contact'), `${name}: their contact`).toBeGreaterThanOrEqual(1.06)
  }
})

for (const [name, address, ready, card] of [
  [
    'a task tile',
    '/room.html?demo=1&place=work&theme=light',
    DRAWN.tasks,
    ".task-tile:not([data-mark='free'], [data-mark='complete'])",
  ],
  ['a resource tile', '/resources.html?theme=light', DRAWN.resources, '.resource-tile:not([data-waiting])'],
  ['a Knowledge card', '/room.html?demo=1&place=knowledge&theme=light', DRAWN.knowledge, '.report-card'],
] as const) {
  test(`light · ${name} rests on the page on a contact edge the eye sees`, async ({ page }) => {
    await page.goto(address)
    await drawn(page, ready)
    const first = page.locator(card).first()
    await expect(first).toBeVisible()
    await first.evaluate((el) => el.setAttribute('data-measured', ''))
    await alone(page, '[data-measured]')
    expect(await shadowOf(page, first, 'contact')).toBeGreaterThanOrEqual(1.06)
  })
}

test('the room keeps its shadows to the value: a task tile, the dock, a flat Knowledge card', async ({ page }) => {
  await page.goto('/room.html?demo=1&place=work')
  await drawn(page, DRAWN.tasks)
  await expect(page.locator(".task-tile:not([data-mark='free'], [data-mark='complete'])").first()).toHaveCSS(
    'box-shadow',
    /rgba\(0, 0, 0, 0\.3\) 0px 1px 2px 0px$/,
  )
  await page.goto('/room.html?demo=1&place=knowledge')
  await drawn(page, DRAWN.knowledge)
  // Flat, as it was: paper's contact is paper's rule alone.
  await expect(page.locator('.report-card').first()).toHaveCSS('box-shadow', 'none')
  await page.goto('/room.html?demo=1&call=on&people=3&floor=1')
  await drawn(page, DRAWN.room.slice(0, 1))
  await expect(page.locator('.dock')).toHaveCSS('box-shadow', /rgba\(0, 0, 0, 0\.5\) 0px 16px 48px 0px$/)
})
