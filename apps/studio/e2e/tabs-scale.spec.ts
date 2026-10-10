import { expect, test, type Page } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

// A tab strip is one piece (docs/plans/tabs-scale.md): the Invite sheet's, the room's side panel's and the report
// viewer's strips are 36 px tall, the tab that is on wears its line and the others none, and the arrows move the
// choice and the focus with it, the row one Tab stop.

/**
 * In the page: every visible tab strip (`.tabs`) with its tabs' heights (distinct), which tab wears a line (an ::after
 * with a height and an ink), and which is on.
 */
function readStrips() {
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- page.evaluate sends only this function to the page
  const seen = (el: Element) => {
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'
  }
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- page.evaluate sends only this function to the page
  const lined = (el: Element) => {
    const after = getComputedStyle(el, '::after')
    const alpha = /rgba\((?:\s*[\d.]+,){3}\s*([\d.]+)\)/.exec(after.backgroundColor)
    return after.content !== 'none' && parseFloat(after.height) > 0 && (alpha === null || Number(alpha[1]) > 0)
  }
  return [...document.querySelectorAll('.tabs')].filter(seen).map((strip) => {
    const tabs = [...strip.querySelectorAll(':scope > [role="tab"]')].filter(seen)
    return {
      label: strip.getAttribute('aria-label') ?? '',
      heights: [...new Set(tabs.map((t) => Math.round(t.getBoundingClientRect().height)))],
      on: tabs.filter((t) => t.getAttribute('aria-selected') === 'true').map((t) => t.textContent.trim()),
      linedTabs: tabs.filter(lined).map((t) => t.textContent.trim()),
      stops: tabs.map((t) => t.getAttribute('tabindex')).join(','),
    }
  })
}

async function offScale(page: Page) {
  const strips = await page.evaluate(readStrips)
  expect(strips.length).toBeGreaterThan(0)
  return strips
    .filter(
      (s) =>
        s.heights.some((h) => h !== 36) ||
        s.on.length !== 1 ||
        s.linedTabs.join() !== s.on.join() ||
        s.stops.split(',').filter((t) => t === '0').length !== 1,
    )
    .map(
      (s) =>
        `${s.label}: ${s.heights.join(',')} px · on ${s.on.join()} · lined ${s.linedTabs.join()} · stops ${s.stops}`,
    )
}

test.afterEach(async ({ page }) => {
  // Each fixture page keeps its own list of requests it didn't expect.
  const unexpected = await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])
  expect(unexpected).toEqual([])
})

test('tabs · the room’s side panel: 36 px, the line under the tab that is on, the arrows move both', async ({
  page,
}) => {
  await page.goto('/room.html?demo=1')
  await drawn(page, DRAWN.room)
  await page.getByRole('button', { name: 'Chat', exact: true }).click()
  const strip = page.getByRole('tablist', { name: 'Side panel' })
  await expect(strip).toBeVisible()
  expect(await offScale(page)).toEqual([])
  await strip.getByRole('tab', { name: 'Chat' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(strip.getByRole('tab', { name: 'Brief' })).toHaveAttribute('aria-selected', 'true')
  await expect(strip.getByRole('tab', { name: 'Brief' })).toBeFocused()
  await expect(page.getByRole('tabpanel', { name: 'Brief' })).toBeVisible()
  expect(await offScale(page)).toEqual([])
})

test('tabs · the Invite sheet: 36 px, one line, one stop', async ({ page }) => {
  await page.goto('/room.html?demo=1')
  await drawn(page, DRAWN.room)
  await page.getByRole('button', { name: 'Invite' }).click()
  const strip = page.getByRole('tablist', { name: 'Invite' })
  await expect(strip).toBeVisible()
  expect(await offScale(page)).toEqual([])
  await strip.getByRole('tab', { name: 'Guests' }).focus()
  await page.keyboard.press('End')
  await expect(strip.getByRole('tab', { name: 'Calendar' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tabpanel', { name: 'Calendar' })).toBeVisible()
  expect(await offScale(page)).toEqual([])
})

test('tabs · the report viewer: 36 px beside its format switch, on one line', async ({ page }) => {
  await page.goto('/room.html?demo=1&place=knowledge')
  await drawn(page, DRAWN.knowledge)
  await page.getByRole('button', { name: /^Open Pilot readout/ }).click()
  const strip = page.getByRole('tablist', { name: 'Report' })
  await expect(strip).toBeVisible()
  expect(await offScale(page)).toEqual([])
  // The strip and the format switch share one line: the row holds them at one height.
  const row = await page.evaluate(() => {
    // oxlint-disable-next-line unicorn/consistent-function-scoping -- page.evaluate sends only this function to the page
    const h = (sel: string) => Math.round(document.querySelector(sel)?.getBoundingClientRect().height ?? 0)
    return { tabs: h('.report-tabs .tabs'), row: h('.report-tabs'), format: h('.report-format') }
  })
  expect(row.tabs).toBe(36)
  expect(row.row).toBe(row.tabs + 2)
  expect(row.format).toBe(32)
  await strip.getByRole('tab', { name: 'Document' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(strip.getByRole('tab', { name: /^Sources/ })).toHaveAttribute('aria-selected', 'true')
  await expect(strip.getByRole('tab', { name: /^Sources/ })).toBeFocused()
})
