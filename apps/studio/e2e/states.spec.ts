import { expect, test, type Page } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

// The states are one (docs/plans/states.md): while a view reads, a skeleton stands in (shapes with a light passing
// over them once per 1.6 s, each 80 ms after the last; busy; said to a screen reader); when a view has nothing, an
// empty state says so where its first row would be, in the third ink at the body type, its way forward under the
// sentence; a lane with nothing is a slot, the sentence centred in a dashed edge. Measured on a desktop.

const INK = 'rgba(236, 235, 241, 0.52)'

/** Every empty state on screen, as the page sees it. */
function readEmpties() {
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- page.evaluate sends only this function to the page
  const seen = (el: Element) => {
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  }
  return [...document.querySelectorAll<HTMLElement>('.empty')].filter(seen).map((e) => {
    const cs = getComputedStyle(e)
    const kids = [...e.children]
    return {
      name: e.className.replace(/\b(empty-slot|empty)\b/g, '').trim() || 'empty',
      slot: e.classList.contains('empty-slot'),
      inPulse: e.closest('.pulse') !== null,
      ink: cs.color,
      type: cs.fontSize,
      pad: cs.padding,
      edge: `${cs.borderTopWidth} ${cs.borderTopStyle}`,
      sentenceFirst: kids.at(0)?.tagName === 'P' && (kids.at(0)?.textContent ?? '').trim().length > 0,
      wayAfter: kids.slice(1).every((k) => k.classList.contains('control-row')),
    }
  })
}

/** The empty states off the look, said; a page measures one at least. */
async function offLook(page: Page) {
  const empties = await page.evaluate(readEmpties)
  expect(empties.length).toBeGreaterThan(0)
  return empties
    .filter((e) => {
      const pad = e.slot ? '0px 12px' : e.inPulse ? '7px 0px' : '18px 0px 24px'
      return (
        e.ink !== INK ||
        e.type !== (e.slot ? '12px' : '13px') ||
        e.pad !== pad ||
        e.edge !== (e.slot ? '1px dashed' : '0px none') ||
        !e.sentenceFirst ||
        !e.wayAfter
      )
    })
    .map((e) => `${e.name}: ${e.ink} · ${e.type} · ${e.pad} · ${e.edge} · sentence ${String(e.sentenceFirst)}`)
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

test('states · while Resources reads: six tiles’ shapes, busy, said; the light passes, each shape after the last; still under less motion', async ({
  page,
}) => {
  await page.goto('/resources.html?loading=1')
  const busy = page.locator('.skeleton')
  await expect(busy).toHaveAttribute('aria-busy', 'true')
  await expect(busy.getByRole('status')).toHaveText('Reading the resources…')
  const shapes = busy.locator('.skeleton-shape')
  await expect(shapes).toHaveCount(6)
  const light = await shapes.evaluateAll((all) =>
    all.map((shape) => {
      const first = shape.firstElementChild
      if (!first) return 'no bar'
      const bar = getComputedStyle(first)
      return `${bar.animationName} ${bar.animationDuration} ${bar.animationDelay}`
    }),
  )
  expect(light).toEqual([0, 80, 160, 240, 320, 400].map((ms) => `skeleton-light 1.6s ${String(ms / 1000)}s`))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(shapes.first().locator('span').first()).toHaveCSS('animation-name', 'none')
})

test('states · Goals with none yet: the sentence where the first row would be, its way forward under it', async ({
  page,
}) => {
  await page.goto('/room.html')
  await page.getByRole('link', { name: 'Goals' }).first().click()
  await expect(page.getByText(/No goals yet/)).toBeVisible()
  expect(await offLook(page)).toEqual([])
  await expect(page.locator('.empty .control-row').getByRole('button', { name: 'Open the Studio' })).toBeVisible()
})

test('states · a board lane with nothing: a slot, the sentence centred in a dashed edge', async ({ page }) => {
  await page.goto('/work.html?case=closed')
  await expect(page.locator('.board').first().locator('.lane-empty').first()).toBeVisible()
  expect(await offLook(page)).toEqual([])
})

test('states · Knowledge with nothing matching: the sentence, the way back inside it', async ({ page }) => {
  await page.goto('/room.html?demo=1&place=knowledge')
  await drawn(page, DRAWN.knowledge)
  await page.getByPlaceholder(/Search titles/).fill('zzzz')
  await expect(page.getByText('No reports match these filters.')).toBeVisible()
  expect(await offLook(page)).toEqual([])
})

test('states · the personal space with no notes: the same sentence’s look', async ({ page }) => {
  await page.goto('/personal.html?demo=1&notes=none')
  await page.getByRole('button', { name: 'No notes' }).click()
  await expect(page.locator('.ps-empty')).toBeVisible()
  expect(await offLook(page)).toEqual([])
})
