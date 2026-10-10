import { expect, test, type Page } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

// A segmented control stands on the field scale (docs/plans/segmented-scale.md): on each page that has one, once
// drawn, every visible `.segmented` box is 36 px with 28 px presses, or 32 with 24 when small; its thumb lies under
// the press that is on; and, as tabs or radios, the arrows move the choice and the focus with it.

const PAGES = [
  ['home', '/home.html?demo=1', DRAWN.home],
  ['the room', '/room.html?demo=1', DRAWN.room],
  ['Tasks', '/room.html?demo=1&place=work', DRAWN.tasks],
  ['Knowledge', '/room.html?demo=1&place=knowledge', DRAWN.knowledge],
  ['Resources', '/resources.html', DRAWN.resources],
  ['the work space', '/work.html', DRAWN.work],
] as const

/**
 * In the page: every visible segmented box with its height, its presses' heights (distinct), its size, and whether its
 * thumb lies under the press that is on (the thumb's offsets and size are the press's, within a pixel: on the press's
 * row when the box wraps, not a column through every row).
 */
function readSegmented() {
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- page.evaluate sends only this function to the page
  const seen = (el: Element) => {
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && r.top < innerHeight
  }
  return [...document.querySelectorAll('.segmented')].filter(seen).map((box) => {
    const presses = [...box.querySelectorAll(':scope > button')].filter(seen)
    const on = presses.find((p) =>
      ['aria-selected', 'aria-checked', 'aria-pressed'].some((a) => p.getAttribute(a) === 'true'),
    )
    const style = getComputedStyle(box)
    const x = parseFloat(style.getPropertyValue('--thumb-x'))
    const y = parseFloat(style.getPropertyValue('--thumb-y'))
    const w = parseFloat(style.getPropertyValue('--thumb-w'))
    const h = parseFloat(style.getPropertyValue('--thumb-h'))
    const under =
      on instanceof HTMLElement &&
      Math.abs(on.offsetLeft - x) <= 1 &&
      Math.abs(on.offsetTop - y) <= 1 &&
      Math.abs(on.offsetWidth - w) <= 1 &&
      Math.abs(on.offsetHeight - h) <= 1
    return {
      label: box.getAttribute('aria-label') ?? '',
      small: box.classList.contains('sz-sm'),
      height: Math.round(box.getBoundingClientRect().height),
      presses: [...new Set(presses.map((p) => Math.round(p.getBoundingClientRect().height)))],
      thumbUnderOn: under,
    }
  })
}

async function offScale(page: Page) {
  const boxes = await page.evaluate(readSegmented)
  expect(boxes.length).toBeGreaterThan(0)
  return boxes
    .filter((b) => {
      const want = b.small ? { box: 32, press: 24 } : { box: 36, press: 28 }
      return b.height !== want.box || b.presses.some((h) => h !== want.press) || !b.thumbUnderOn
    })
    .map((b) => `${b.label}: ${String(b.height)} / ${b.presses.join(',')}${b.thumbUnderOn ? '' : ' · thumb astray'}`)
}

test.afterEach(async ({ page }) => {
  // Each fixture page keeps its own list of requests it didn't expect.
  const unexpected = await page.evaluate(() => [
    ...(window.fixture?.unexpected ?? []),
    ...(window.resourcesFixture?.unexpected ?? []),
    ...(window.workFixture?.unexpected ?? []),
  ])
  expect(unexpected).toEqual([])
})

for (const [name, url, parts] of PAGES) {
  test(`segmented · on ${name}, every box is 36 with 28 presses, its thumb under the one that is on`, async ({
    page,
  }) => {
    await page.goto(url)
    // The page has drawn: each of its reads (drawn.ts), never «the network is idle».
    await drawn(page, parts)
    expect(await offScale(page)).toEqual([])
  })
}

test('segmented · the report viewer’s format switch is the small one: 32 with 24', async ({ page }) => {
  await page.goto('/room.html?demo=1&place=knowledge')
  await drawn(page, DRAWN.knowledge)
  await page.getByRole('button', { name: /^Open Pilot readout/ }).click()
  await expect(page.getByRole('group', { name: 'Format' }).last()).toBeVisible()
  const boxes = await page.evaluate(readSegmented)
  expect(boxes.some((b) => b.small && b.height === 32 && b.presses.every((h) => h === 24))).toBe(true)
  expect(await offScale(page)).toEqual([])
})

test('segmented · on Resources, the arrows move the choice and the focus with it', async ({ page }) => {
  await page.goto('/resources.html')
  await drawn(page, DRAWN.resources)
  const tabs = page.getByRole('tablist', { name: 'Show' })
  await tabs.getByRole('tab', { name: /^All/ }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(tabs.getByRole('tab', { name: /^Waiting/ })).toHaveAttribute('aria-selected', 'true')
  await expect(tabs.getByRole('tab', { name: /^Waiting/ })).toBeFocused()
  await page.keyboard.press('End')
  await expect(tabs.getByRole('tab', { name: /^Mine/ })).toHaveAttribute('aria-selected', 'true')
  // One stop for the row: the others step out of the Tab order.
  await expect(tabs.getByRole('tab', { name: /^All/ })).toHaveAttribute('tabindex', '-1')
})
