import { expect, test, type Page } from '@playwright/test'
import { contrastOf, lowContrast } from './contrast.ts'
import { DRAWN, drawn } from './drawn.ts'

// A light mode on the report's paper (docs/plans/light-mode.md, informe-30 §2.5): asked for in the account menu (or by
// a fixture's address), the page's root carries `data-theme="light"`, the room becomes paper, the grain goes, every
// word still reads at 4.5:1 or more, and nothing keeps a dark plane of its own. The choice is kept on the browser;
// «system» follows the system.

const PAGES = [
  ['sign-in', '/signin.html?theme=light', DRAWN.signin],
  ['home', '/home.html?demo=1&theme=light', DRAWN.home],
  ['personal', '/personal.html?demo=1&theme=light', DRAWN.personal],
  ['the room', '/room.html?demo=1&theme=light', DRAWN.room],
  ['Conversations', '/room.html?demo=1&conversations=1&place=conversations&theme=light', DRAWN.conversations],
  ['Tasks', '/room.html?demo=1&place=work&theme=light', DRAWN.tasks],
  ['Knowledge', '/room.html?demo=1&place=knowledge&theme=light', DRAWN.knowledge],
  ['Resources', '/resources.html?theme=light', DRAWN.resources],
] as const

/** The dark room's planes: none may stay under a light page. */
const DARK = ['rgb(5, 4, 8)', 'rgb(11, 10, 15)', 'rgb(18, 17, 24)', 'rgb(12, 11, 17)']

/** In the page: visible boxes still painted with one of the dark room's planes. */
function darkLeft(dark: readonly string[]) {
  return [...document.querySelectorAll<HTMLElement>('body *')]
    .filter((el) => {
      const r = el.getBoundingClientRect()
      return (
        r.width > 0 &&
        r.height > 0 &&
        !el.closest('.fixture-label') &&
        dark.includes(getComputedStyle(el).backgroundColor)
      )
    })
    .map((el) => `${el.tagName.toLowerCase()}.${el.className.split(' ')[0]}`)
    .slice(0, 8)
}

test.afterEach(async ({ page }) => {
  // Each fixture page keeps its own list of requests it didn't expect.
  const unexpected = await page.evaluate(() => [
    ...(window.fixture?.unexpected ?? []),
    ...(window.resourcesFixture?.unexpected ?? []),
  ])
  expect(unexpected).toEqual([])
})

for (const [name, url, parts] of PAGES) {
  test(`light · ${name}: paper, no grain, every word at 4.5:1, no dark plane left`, async ({ page }) => {
    await page.goto(url)
    await drawn(page, parts)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(251, 248, 243)')
    expect(await page.evaluate(() => getComputedStyle(document.body, '::after').display)).toBe('none')
    expect(await page.evaluate(darkLeft, DARK)).toEqual([])
    expect(await lowContrast(page, 'body', '.fixture-label')).toEqual([])
  })
}

test('light · chosen in the account menu, kept on the browser; «system» follows the system', async ({ page }) => {
  await page.goto('/room.html?demo=1')
  await drawn(page, DRAWN.room)
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'light')
  await page.getByRole('button', { name: 'Account' }).click()
  await page.getByRole('menuitemradio', { name: 'Light' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  // On paper a shadow is one of its levels, in the ink (light-shadows.md): a menu's is the third, contact and ambient.
  await expect(page.getByRole('menu')).toHaveCSS(
    'box-shadow',
    'rgba(29, 27, 34, 0.1) 0px 1px 3px 0px, rgba(29, 27, 34, 0.14) 0px 12px 32px -6px',
  )
  await expect(page.getByRole('menuitemradio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true')
  expect(await page.evaluate(() => localStorage.getItem('sophia.theme'))).toBe('light')
  await page.getByRole('menuitemradio', { name: 'Dark' }).click()
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'light')
  await page.emulateMedia({ colorScheme: 'light' })
  await page.getByRole('menuitemradio', { name: 'Follow the system' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'light')
  // Kept: the next visit opens as chosen.
  await page.reload()
  await drawn(page, DRAWN.room)
  expect(await page.evaluate(() => localStorage.getItem('sophia.theme'))).toBe('system')
})

/** The contrast of an element's ink over one ground, as the page computes them. */
const ratio = async (page: Page, selector: string, ground: string) => {
  const [ink, bg] = await page
    .locator(selector)
    .first()
    .evaluate((el) => {
      // At rest: a state's transition is finished before its colours are read.
      el.getAnimations().forEach((a) => a.finish())
      return [getComputedStyle(el).color, getComputedStyle(el).backgroundColor] as const
    })
  // Grounds are named nearest first (as lowContrast collects them): the press's own plane, then the page's.
  return contrastOf({ words: selector, size: 13, ink, opacity: 1, grounds: [bg, ground] })
}

test('light · the states the at-rest scan does not see read on paper: a note that is soon, the send ready, a primary press hovered', async ({
  page,
}) => {
  await page.goto('/home.html?theme=light')
  await drawn(page, DRAWN.home)
  expect(await ratio(page, '.hw-row[data-tone="soon"] .hw-m', 'rgb(251, 248, 243)')).toBeGreaterThanOrEqual(4.5)
  await page.goto('/room.html?demo=1&place=conversations&theme=light')
  await drawn(page, DRAWN.conversations)
  await page.getByPlaceholder('Continue this question with the team').fill('hi')
  const send = page.locator('.conv-send[data-ready]')
  await expect(send).toHaveCount(1)
  expect(await ratio(page, '.conv-send[data-ready]', 'rgb(251, 248, 243)')).toBeGreaterThanOrEqual(4.5)
  await page.goto('/signin.html?theme=light')
  await drawn(page, DRAWN.signin)
  // An address that is not one: the field's boundary says so in an ink the paper shows (3:1 or more, as a boundary).
  await page.locator('.field input').first().fill('nope')
  await page.keyboard.press('Enter')
  const invalid = page.locator('.field:has(input[aria-invalid="true"])')
  await expect(invalid).toHaveCount(1)
  const edge = await invalid.evaluate((el) => {
    el.getAnimations().forEach((a) => a.finish()) // the edge's transition from the focus ink, finished before the read
    return [getComputedStyle(el).borderTopColor, getComputedStyle(el).backgroundColor]
  })
  expect(
    contrastOf({
      words: 'invalid edge',
      size: 13,
      ink: edge[0] ?? '',
      opacity: 1,
      grounds: [edge[1] ?? '', 'rgb(251, 248, 243)'],
    }),
    edge.join(' on '),
  ).toBeGreaterThanOrEqual(3)
  const primary = page.getByRole('button', { name: 'Email me a link' })
  await primary.hover()
  await expect(primary).toHaveCSS('background-color', 'rgb(74, 60, 166)') // the brand's violet, hovered (light-fills.md)
  expect(await ratio(page, '.pill.primary', 'rgb(251, 248, 243)')).toBeGreaterThanOrEqual(4.5)
})

test('light · a kept choice is on the root before the app runs (entry.js), so the first paint is paper', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('sophia.theme', 'light'))
  // The app's shell (the app's own server, not the fixtures'): entry.js in its head, read before the body is drawn.
  await page.goto('http://127.0.0.1:5198/', { waitUntil: 'commit' })
  await page.waitForFunction(() => document.head.querySelector('script[src="/entry.js"]') !== null)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(251, 248, 243)')
})

/** A colour's contrast on a ground, as the words' checks read it (an RGB string). */
const edgeRatio = (ink: string, ground: string) =>
  contrastOf({ words: 'edge', size: 13, ink, opacity: 1, grounds: [ground, 'rgb(251, 248, 243)'] })

test('light · the browser’s chrome follows the theme, and a choice made in another tab is shown here', async ({
  page,
}) => {
  // The Studio's own page carries the chrome's colour (the opening's page is index.html).
  await page.goto('/opening.html?theme=light')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#fbf8f3')
  await page.goto('/home.html')
  await drawn(page, DRAWN.home)
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'light')
  await page.evaluate(() => {
    localStorage.setItem('sophia.theme', 'light')
    window.dispatchEvent(new StorageEvent('storage', { key: 'sophia.theme', newValue: 'light' }))
  })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})

test('light · on paper no WebGL frame is drawn: the halo is CSS', async ({ page }) => {
  await page.addInitScript(() => {
    // Every WebGL draw counted, on either context's prototype.
    const counted = { n: 0 }
    Reflect.set(window, 'webglDraws', counted)
    const wrap = (proto: WebGLRenderingContext | WebGL2RenderingContext) => {
      const draw: unknown = Reflect.get(proto, 'drawArrays')
      if (typeof draw !== 'function') return
      Reflect.set(proto, 'drawArrays', function (this: unknown, ...args: unknown[]) {
        counted.n++
        Reflect.apply(draw, this, args)
      })
    }
    wrap(WebGLRenderingContext.prototype)
    wrap(WebGL2RenderingContext.prototype)
  })
  await page.goto('/signin.html?theme=light')
  await drawn(page, DRAWN.signin)
  await page.waitForTimeout(600)
  expect(await page.evaluate(() => JSON.stringify(Reflect.get(window, 'webglDraws')))).toBe('{"n":0}')
})

test('light · the controls’ cues read on paper: the magnifier, the chevron, the focus edge, a primary press’s tip key', async ({
  page,
}) => {
  await page.goto('/resources.html?theme=light')
  await drawn(page, DRAWN.resources)
  const glyph = await page
    .locator('.search > input')
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundImage)
  expect(glyph).toContain('6b6874')
  await page.goto('/signin.html?theme=light')
  await drawn(page, DRAWN.signin)
  await page.keyboard.press('Tab')
  const field = page.locator('.field:focus-within, input:focus-visible').first()
  await expect(field).toHaveCount(1)
  const edge = await field.evaluate((el) => {
    el.getAnimations().forEach((a) => a.finish())
    return [getComputedStyle(el).borderTopColor, getComputedStyle(el).backgroundColor]
  })
  expect(edgeRatio(edge[0] ?? '', edge[1] ?? ''), edge.join(' on ')).toBeGreaterThanOrEqual(3)
  await page.goto('/room.html?demo=1&theme=light')
  await drawn(page, DRAWN.room)
  const join = page.getByRole('button', { name: /^Join the room/ }).first()
  await join.hover()
  const key = join.locator('.tip kbd')
  if ((await key.count()) > 0) {
    const [ink, bg] = await key.evaluate((el) => [
      getComputedStyle(el).color,
      getComputedStyle(el.closest('.tip') ?? el).backgroundColor,
    ])
    expect(
      contrastOf({ words: 'tip key', size: 11, ink, opacity: 1, grounds: [bg, 'rgb(255, 255, 255)'] }),
    ).toBeGreaterThanOrEqual(4.5)
  }
})

test('light · a dependency drawn on the board is in the halo’s ink on paper', async ({ page }) => {
  await page.goto('/work.html?theme=light')
  await page.locator('.task-tile').first().waitFor()
  const stroke = await page.evaluate(() => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('class', 'thread')
    const svg =
      document.querySelector('svg.threads') ??
      document.body.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'svg'))
    svg.appendChild(path)
    const read = getComputedStyle(path).stroke
    path.remove()
    return read
  })
  expect(stroke).toBe('rgb(85, 70, 184)')
})

test('light · Personal’s ready session note reads on paper', async ({ page }) => {
  await page.goto('/personal.html?talk=new&ready=1&theme=light')
  const note = page.locator('.c3-way-note').first()
  await expect(note).toBeVisible()
  expect(await ratio(page, '.c3-way-note', 'rgb(251, 248, 243)')).toBeGreaterThanOrEqual(4.5)
})

test('light · the opening on paper: the brand’s paper inks, its words readable', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sophia.theme', 'light'))
  await page.goto('/opening.html')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  const read = await page.evaluate(() => ({
    her: getComputedStyle(document.querySelector('#entry-her-ink stop') ?? document.body).stopColor,
    you: getComputedStyle(document.querySelector('#entry-you-ink stop') ?? document.body).stopColor,
    step: getComputedStyle(document.querySelector('.entry-step') ?? document.body).color,
  }))
  expect(read.her).toBe('rgb(132, 104, 238)')
  expect(read.you).toBe('rgb(22, 21, 27)')
  expect(
    contrastOf({ words: 'step', size: 13, ink: read.step, opacity: 1, grounds: ['rgb(251, 248, 243)'] }),
  ).toBeGreaterThanOrEqual(4.5)
})

test('light @phone · held sideways, the account menu stays inside the screen, its last row reachable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 844, height: 390 })
  await page.goto('/room.html?demo=1&theme=light')
  await drawn(page, DRAWN.room)
  await page.getByRole('button', { name: 'Account' }).first().click()
  const menu = page.getByRole('menu')
  await expect(menu).toBeVisible()
  const box = await menu.boundingBox()
  expect((box?.y ?? 0) + (box?.height ?? 999)).toBeLessThanOrEqual(390)
  const last = menu.getByRole('menuitem').last()
  await last.scrollIntoViewIfNeeded()
  await expect(last).toBeInViewport()
})

test('light · Home’s light on paper is not screened into the page (Codex on #234)', async ({ page }) => {
  await page.goto('/home.html?demo=1&theme=light')
  await drawn(page, DRAWN.home)
  await expect(page.locator('.hw-light .light')).toHaveCSS('mix-blend-mode', 'normal')
  // In the room the light still adds itself to the void.
  await page.goto('/home.html?demo=1')
  await drawn(page, DRAWN.home)
  await expect(page.locator('.hw-light .light')).toHaveCSS('mix-blend-mode', 'screen')
})

test('light · the line to Sophia and the personal composer draw their hairline on paper (Codex P2 on #234)', async ({
  page,
}) => {
  const paper = 'rgb(251, 248, 243)'
  for (const [url, selector, side] of [
    ['/home.html?demo=1&theme=light', '.places .hw-say', 'borderBottomColor'],
    ['/personal.html?demo=1&theme=light', '.places .ps-composer .message-bar', 'borderTopColor'],
  ] as const) {
    await page.goto(url)
    const line = page.locator(selector).first()
    await expect(line).toBeVisible()
    const ink = await line.evaluate((el, s) => getComputedStyle(el)[s], side)
    // White over paper was 1.01:1, no line at all; the ink's hairline is one the eye finds.
    const contrast = contrastOf({ words: 'hairline', size: 1, ink, opacity: 1, grounds: [paper] })
    expect(contrast, `${url} ${ink}`).toBeGreaterThanOrEqual(1.1)
  }
})
