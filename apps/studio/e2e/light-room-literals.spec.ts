// The room's colours written by hand, on paper (docs/plans/light-room-literals.md): the models' dots, a plain effort
// bar in its tool's ink, Claude's bar below its top, Ultracode's dots and sparks and a waiting request's dot hold 3:1
// where they sit; the newcomer's welcome casts the paper's shadow; the lights that fly keep a core that shows. The room
// keeps every one as it was.
import { expect, test, type Locator, type Page } from '@playwright/test'
import { colourOf, contrastOf } from './contrast.ts'
import { DRAWN, drawn } from './drawn.ts'

const RESOURCES = '/resources.html?more=1&viewer=davide'
const FAMILIES = ['opus', 'sonnet', 'haiku', 'gpt', 'gemini-pro', 'gemini-flash', 'grok'] as const
const TOOLS = ['claude-code', 'gemini-cli', 'codex', 'grok', 'github-copilot', 'cursor'] as const

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

/** The grounds a mark is painted over: `ground`'s own background and each one up the tree from it. */
const groundsOf = (ground: Locator) =>
  ground.evaluate((el) => {
    const grounds: string[] = []
    for (let up: Element | null = el; up; up = up.parentElement) grounds.push(getComputedStyle(up).backgroundColor)
    return grounds
  })
/** The contrast of a mark in `ink` over `ground` (composited up the tree to its first opaque plane). */
const markOn = async (ink: string, ground: Locator) =>
  contrastOf({ words: '', ink, opacity: 1, grounds: await groundsOf(ground), size: 0 })
/** The opaque colours a box paints in its background image (a gradient's stops). */
const stopsOf = (box: Locator, pseudo = '') =>
  box
    .evaluate((el, p) => getComputedStyle(el, p || null).backgroundImage, pseudo)
    .then((image) => (image.match(/(?:rgba?|color)\([^()]*\)/g) ?? []).filter((c) => colourOf(c).a >= 1))
const background = (box: Locator) => box.evaluate((el) => getComputedStyle(el).backgroundColor)

const sheet = (page: Page, name: string) => page.getByRole('dialog', { name })
async function openSheet(page: Page, name: string) {
  await page.getByRole('list', { name: 'Resources' }).getByRole('button', { name, exact: true }).click()
  await expect(sheet(page, name)).toBeVisible()
  return sheet(page, name)
}

/** Each family's dot on `chip` (its family set in turn), with its contrast over the chip and what is under it. */
async function familyDots(chip: Locator) {
  const seen: [string, number][] = []
  for (const family of FAMILIES) {
    await chip.evaluate((el, f) => el.setAttribute('data-family', f), family)
    seen.push([family, await markOn(await background(chip.locator('.model-dot')), chip)])
  }
  return seen
}
/** What holds less than 3:1, by name. */
const low = (seen: [string, number][]) => seen.filter(([, ratio]) => ratio < 3)

test('light · Resources: every model family’s dot holds 3:1 on its chip, on a tile and in a sheet', async ({
  page,
}) => {
  await page.goto(`${RESOURCES}&theme=light`)
  const onTile = page.locator('.resource-tile .model-chip').first()
  await expect(onTile).toBeVisible()
  expect(low(await familyDots(onTile)), 'on a white tile').toEqual([])
  const codex = await openSheet(page, 'Davide · Codex')
  expect(low(await familyDots(codex.locator('.model-chip').first())), 'on the sheet’s plane').toEqual([])
})

test('light · Resources: a plain effort bar holds 3:1 on its track, in every tool’s ink', async ({ page }) => {
  await page.goto(`${RESOURCES}&theme=light`)
  const gemini = await openSheet(page, 'Luis · Gemini CLI')
  const bar = gemini.locator('.effort[data-look="plain"]').first()
  await expect(bar).toBeVisible()
  const seen: [string, number][] = []
  for (const tool of TOOLS) {
    // The sheet takes its tool's ink from its own `data-tool`: each tool's, in turn, on the same bar.
    await gemini.evaluate((el, t) => el.setAttribute('data-tool', t), tool)
    seen.push([tool, await markOn(await background(bar.locator('.effort-fill')), bar.locator('.effort-track'))])
  }
  expect(low(seen)).toEqual([])
})

test('light · Resources: Claude’s bar below its top holds 3:1 on its track', async ({ page }) => {
  await page.goto(`${RESOURCES}&theme=light`)
  const claude = await openSheet(page, 'Davide · Claude Code')
  // The fixture's Claude runs in ultracode; below its top the same bar is plain, as a lower level draws it.
  const bar = claude.locator('.effort[data-look="claude"]').first()
  await bar.evaluate((el) => el.removeAttribute('data-alive'))
  expect(
    await markOn(await background(bar.locator('.effort-fill')), bar.locator('.effort-track')),
  ).toBeGreaterThanOrEqual(3)
})

test('light · Resources: Ultracode’s dots, its glint and its sparks hold 3:1 on their track', async ({ page }) => {
  await page.goto(`${RESOURCES}&theme=light`)
  const claude = await openSheet(page, 'Davide · Claude Code')
  const ultra = claude.locator('.effort[data-look="claude"][data-alive]').first()
  const track = ultra.locator('.effort-track')
  const dots = await stopsOf(ultra.locator('.effort-fill'))
  const sparks = await stopsOf(track, '::after')
  expect(dots.length, 'the dots and their glint').toBeGreaterThanOrEqual(2)
  expect(sparks.length, 'the sparks').toBe(3)
  const seen: [string, number][] = []
  for (const ink of [...dots, ...sparks]) seen.push([ink, await markOn(ink, track)])
  expect(low(seen)).toEqual([])
})

test('light · Resources: a waiting effort request’s dot holds 3:1', async ({ page }) => {
  await page.goto(`${RESOURCES}&theme=light`)
  const claude = await openSheet(page, 'Davide · Claude Code')
  const worker = claude.locator('.resource-session').filter({ hasText: 'worker' })
  await worker.getByRole('button', { name: 'Effort: Ultracode. Change it' }).click()
  await page.keyboard.press('ArrowLeft')
  await claude.getByRole('button', { name: 'Restart now with Max…' }).click()
  await claude.getByRole('button', { name: 'Restart', exact: true }).click()
  const asked = worker.locator('.effort-asked[data-tone="asked"]')
  await expect(asked).toBeVisible()
  expect(await markOn(await background(asked.locator('.effort-asked-dot')), asked)).toBeGreaterThanOrEqual(3)
})

test('light · the newcomer’s welcome casts the paper’s shadow, not black', async ({ page }) => {
  await page.goto('/room.html?demo=1&welcome=1&theme=light')
  await drawn(page, DRAWN.room)
  const band = page.getByRole('region', { name: 'Welcome' })
  const shadow = colourOf(await band.evaluate((el) => getComputedStyle(el).boxShadow))
  expect([shadow.r, shadow.g, shadow.b], 'the paper’s ink').toEqual([29, 27, 34])
  expect(shadow.a, 'lighter than the room’s').toBeLessThan(0.32)
})

/** The core of each light that flies, set where it would fly: a note kept, and the glow that leaves Home's light. */
const flyingCores = (page: Page) =>
  page.evaluate(() => {
    const note = document.createElement('div')
    note.className = 'c3-noteflight'
    document.body.append(note)
    const glow = document.createElement('div')
    glow.className = 'c3-glowfly'
    document.querySelector('.places')?.append(glow)
    return [note, glow].map((el) => /(?:rgba?|color)\([^()]*\)/.exec(getComputedStyle(el).backgroundImage)?.[0] ?? '')
  })

test('light · Personal: the lights that fly keep a core that shows on paper, 3:1 or more', async ({ page }) => {
  await page.goto('/personal.html?demo=1&theme=light')
  await drawn(page, DRAWN.personal)
  const body = page.locator('body')
  const cores = await flyingCores(page)
  expect(
    cores.filter((core) => !core),
    'each paints a core',
  ).toEqual([])
  for (const core of cores) expect(await markOn(core, body), core).toBeGreaterThanOrEqual(3)
})

test('the room keeps its own: the same dots, bars, Ultracode, welcome shadow and flying lights', async ({ page }) => {
  await page.goto(RESOURCES)
  const chip = page.locator('.resource-tile .model-chip').first()
  await chip.evaluate((el) => el.setAttribute('data-family', 'opus'))
  expect(await background(chip.locator('.model-dot'))).toBe('rgb(217, 119, 87)')
  const accent = (tool: string) =>
    page.evaluate((t) => {
      const el = document.createElement('span')
      el.dataset['tool'] = t
      document.body.append(el)
      return getComputedStyle(el).getPropertyValue('--tool-accent').trim()
    }, tool)
  expect(await Promise.all(['claude-code', 'gemini-cli', 'codex', 'grok'].map(accent))).toEqual([
    '#d97757',
    '#8e75b2',
    '#6f8cff',
    '#c3c7d4',
  ])
  const claude = await openSheet(page, 'Davide · Claude Code')
  const ultra = claude.locator('.effort[data-look="claude"][data-alive]').first()
  expect(await stopsOf(ultra.locator('.effort-fill'))).toEqual([
    'rgb(179, 163, 245)',
    'rgb(244, 240, 255)',
    'rgb(179, 163, 245)',
  ])
  const spark = 'rgb(228, 220, 255)'
  expect(await stopsOf(ultra.locator('.effort-track'), '::after')).toEqual([spark, spark, spark])
  const plain = claude.locator('.effort[data-look="claude"]').first()
  await plain.evaluate((el) => el.removeAttribute('data-alive'))
  expect(await background(plain.locator('.effort-fill'))).toBe('rgba(236, 235, 241, 0.32)')
  await page.goto('/room.html?demo=1&welcome=1')
  await expect(page.getByRole('region', { name: 'Welcome' })).toHaveCSS(
    'box-shadow',
    'rgba(0, 0, 0, 0.32) 0px 12px 32px 0px',
  )
  await page.goto('/personal.html?demo=1')
  await drawn(page, DRAWN.personal)
  expect(await flyingCores(page)).toEqual(['rgba(250, 248, 255, 0.95)', 'rgba(250, 248, 255, 0.95)'])
})
