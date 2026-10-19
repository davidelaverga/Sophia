import { expect, test, type Page } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

// Phone fits (docs/plans/phone-fits.md; informe-25 E5, E6, P-01, V4, H3): Home's rows on one grid and its suggestion
// ending in an ellipsis, every segmented box holding its thumb on touch, Knowledge's filters drawing one plane under
// their choice, and a resource sheet's head holding its presses. Every name here is synthetic.

const id = (n: number) => `00000000-0000-4000-8000-00000000000${String(n)}`

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  const unexpected = await page.evaluate(() => [
    ...(window.fixture?.unexpected ?? []),
    ...(window.resourcesFixture?.unexpected ?? []),
  ])
  expect(unexpected).toEqual([])
})

/** Home's rows: where each title starts, and where each arrow shown ends, with the row's own right edge. */
const homeRows = (page: Page) =>
  page.locator('.hw-index .hw-row').evaluateAll((rows) =>
    rows.map((row) => {
      const go = row.querySelector('.hw-go')
      const arrow = go?.querySelector('[aria-hidden]')
      const shown = go !== null && getComputedStyle(go).opacity === '1'
      return {
        title: row.querySelector('.hw-t')?.getBoundingClientRect().left ?? null,
        arrow: shown && arrow ? arrow.getBoundingClientRect().right : null,
        edge: row.getBoundingClientRect().right,
      }
    }),
  )

test('@phone · home · every row on one grid: titles start together, the arrows shown end together, a row that joins or takes you back too', async ({
  page,
}) => {
  for (const url of ['/home.html', '/home.html?projects=live', `/home.html?call=${id(1)}`]) {
    await page.goto(url)
    await expect(
      page.locator(".hw-index .hw-row[data-act='join'], .hw-index .hw-row[data-act='back']").first(),
    ).toBeVisible()
    const rows = await homeRows(page)
    const titles = rows.flatMap((r) => (r.title === null ? [] : [r.title]))
    const arrows = rows.flatMap((r) => (r.arrow === null ? [] : [r.arrow]))
    const edge = Math.max(...rows.map((r) => r.edge))
    expect(Math.max(...titles) - Math.min(...titles), url).toBeLessThanOrEqual(0.5)
    expect(arrows.length, url).toBeGreaterThanOrEqual(2)
    expect(Math.max(...arrows) - Math.min(...arrows), url).toBeLessThanOrEqual(0.5)
    expect(edge - Math.max(...arrows), url).toBeLessThanOrEqual(0.5)
  }
})

test('@phone · home · a suggestion longer than the line ends in an ellipsis, not through a letter', async ({
  page,
}) => {
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/home.html')
    const line = page.locator('.hw-say input')
    await expect(line).toHaveAttribute('placeholder', /^Help me get ready for Standup in /)
    await page.evaluate(() => document.fonts.ready)
    const fit = await line.evaluate((input: HTMLInputElement) => {
      const s = getComputedStyle(input)
      const canvas = document.createElement('canvas').getContext('2d')
      if (!canvas) return null
      canvas.font = `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`
      canvas.letterSpacing = s.letterSpacing
      const room = input.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight)
      return { longer: canvas.measureText(input.placeholder).width > room, overflow: s.textOverflow }
    })
    expect(fit, String(width)).toEqual({ longer: true, overflow: 'ellipsis' })
  }
})

/**
 * In the page: every visible segmented box under 44 px, or whose thumb hangs out of its inside, said as
 * «label: height / thumb top..bottom against the inside».
 */
function astraySegmented() {
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- page.evaluate sends only this function to the page
  const seen = (el: Element) => {
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'
  }
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- page.evaluate sends only this function to the page
  const thumbOf = (box: HTMLElement) => {
    const s = getComputedStyle(box)
    const top = box.getBoundingClientRect().top + box.clientTop + parseFloat(s.getPropertyValue('--thumb-y'))
    return { top, bottom: top + parseFloat(s.getPropertyValue('--thumb-h')) }
  }
  return [...document.querySelectorAll<HTMLElement>('.segmented')].filter(seen).flatMap((box) => {
    const r = box.getBoundingClientRect()
    const inside = { top: r.top + box.clientTop, bottom: r.top + box.clientTop + box.clientHeight }
    const thumb = thumbOf(box)
    const out = thumb.top < inside.top - 0.5 || thumb.bottom > inside.bottom + 0.5
    if (r.height >= 43.5 && !out) return []
    const label = box.getAttribute('aria-label') ?? box.className
    return [
      `${label}: ${String(Math.round(r.height))} / ${thumb.top.toFixed(1)}..${thumb.bottom.toFixed(1)} in ${inside.top.toFixed(1)}..${inside.bottom.toFixed(1)}`,
    ]
  })
}

test('@phone · segmented · on touch, Personal’s notes eight deep: the order box holds its thumb', async ({ page }) => {
  await page.goto('/personal.html?notes=open&ready=1&notes=lots')
  const notes = page.locator('#c-notes')
  await expect(notes.locator('.c3-order')).toBeVisible()
  expect(await notes.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)
  await expect.poll(() => page.evaluate(astraySegmented)).toEqual([])
})

test('@phone · segmented · on touch, Settings’ theme box holds its thumb', async ({ page }) => {
  await page.goto('/room.html?people=2')
  await page.getByRole('button', { name: 'Account' }).click()
  await page.getByRole('menuitem', { name: 'Settings…' }).click()
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
  await expect.poll(() => page.evaluate(astraySegmented)).toEqual([])
})

for (const [name, url, parts] of [
  ['Knowledge', '/room.html?demo=1&place=knowledge', DRAWN.knowledge],
  ['Resources', '/resources.html', DRAWN.resources],
] as const) {
  test(`@phone · segmented · on touch, ${name}’s boxes hold their thumbs`, async ({ page }) => {
    await page.goto(url)
    await drawn(page, parts)
    await expect.poll(() => page.evaluate(astraySegmented)).toEqual([])
  })
}

/** Knowledge's two filters: how many planes lie under each one's choice (its own fill, and the group's thumb). */
const filterPlanes = (page: Page) =>
  page.locator('.knowledge-filters .segmented').evaluateAll((boxes) =>
    boxes.map((box) => {
      const on = box.querySelector<HTMLElement>('button[aria-pressed="true"]')
      const s = getComputedStyle(box)
      const before = getComputedStyle(box, '::before')
      const own = on !== null && getComputedStyle(on).backgroundColor !== 'rgba(0, 0, 0, 0)'
      const thumb =
        on !== null &&
        before.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
        parseFloat(s.getPropertyValue('--thumb-h')) > 0 &&
        Math.abs(parseFloat(s.getPropertyValue('--thumb-x')) - on.offsetLeft) <= 1 &&
        Math.abs(parseFloat(s.getPropertyValue('--thumb-y')) - on.offsetTop) <= 1
      return { label: box.getAttribute('aria-label'), planes: Number(own) + Number(thumb) }
    }),
  )

test('@phone · knowledge · each filter paints one plane under its choice: the group’s thumb', async ({ page }) => {
  await page.goto('/room.html?place=knowledge')
  await page.getByRole('button', { name: 'More reports' }).click()
  await expect(page.getByRole('group', { name: 'Format' })).toBeVisible()
  await expect
    .poll(() => filterPlanes(page))
    .toEqual([
      { label: 'Project', planes: 1 },
      { label: 'Format', planes: 1 },
    ])
})

/** The resource sheet's head and what lies around it: its presses, Close, the panel's inside, the body under it. */
const sheetHead = (page: Page) =>
  page.getByRole('dialog', { name: 'Davide · Claude Code' }).evaluate((dialog) => {
    const rect = (sel: string) => dialog.querySelector(sel)?.getBoundingClientRect() ?? null
    const panel = dialog.closest('.sheet') ?? dialog
    const s = getComputedStyle(panel)
    const p = panel.getBoundingClientRect()
    const close = dialog.querySelector('[aria-label="Close"]')?.getBoundingClientRect() ?? null
    return {
      head: rect('.sheet-head'),
      acts: rect('.sheet-acts'),
      host: rect('.resource-host'),
      closeGap: close ? p.left + panel.clientLeft + panel.clientWidth - parseFloat(s.paddingRight) - close.right : null,
    }
  })

test('@phone · resources · the sheet’s head holds its presses: Close at the sheet’s edge, nothing under the head', async ({
  page,
}) => {
  for (const width of [390, 360]) {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/resources.html')
    await drawn(page, DRAWN.resources)
    await page.getByRole('button', { name: 'Davide · Claude Code', exact: true }).first().click()
    await expect(page.getByRole('dialog', { name: 'Davide · Claude Code' })).toBeVisible()
    await expect
      .poll(async () => {
        const at = await sheetHead(page)
        if (!at.head || !at.acts || !at.host || at.closeGap === null) return 'not drawn'
        return {
          actsInHead: at.acts.bottom <= at.head.bottom + 0.5,
          closeAtEdge: Math.abs(at.closeGap) <= 1,
          bodyUnderActs: at.host.top >= at.acts.bottom - 0.5,
          bodyUnderHead: at.host.top >= at.head.bottom - 0.5,
        }
      }, String(width))
      .toEqual({ actsInHead: true, closeAtEdge: true, bodyUnderActs: true, bodyUnderHead: true })
  }
})
