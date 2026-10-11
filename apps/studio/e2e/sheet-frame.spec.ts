import { expect, test, type Page } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

// One sheet (docs/plans/sheet-frame.md): every sheet the Studio opens wears the kit's frame, 420 px beside the page,
// 12 · 20 · 28 of padding, a head of 36 with the title at 15/600 and Close a 28 px square 20 px from the edge, under
// a veil at half; it is a modal dialog that takes the focus, closes on Escape and on the veil, and gives the focus back
// to what opened it. Measured on a desktop.

/** The frame of every open sheet, as the page sees it. */
function readSheets() {
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- page.evaluate sends only this function to the page
  const seen = (el: Element) => {
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  }
  return [...document.querySelectorAll<HTMLElement>('.sheet-backdrop > .sheet')].filter(seen).map((sheet) => {
    const cs = getComputedStyle(sheet)
    const r = sheet.getBoundingClientRect()
    const head = sheet.querySelector('.sheet-head')
    const title = sheet.querySelector('.sheet-head h2')
    const close = [...sheet.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Close')
    const cr = close?.getBoundingClientRect()
    return {
      role: sheet.getAttribute('role'),
      modal: sheet.getAttribute('aria-modal'),
      named: !!(sheet.getAttribute('aria-labelledby') ?? sheet.getAttribute('aria-label')),
      width: Math.round(r.width),
      padding: [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].join(' '),
      head: head ? Math.round(head.getBoundingClientRect().height) : 0,
      title: title ? `${getComputedStyle(title).fontSize}/${getComputedStyle(title).fontWeight}` : 'own',
      close: cr
        ? `${String(Math.round(cr.width))}×${String(Math.round(cr.height))} at ${String(Math.round(r.right - cr.right))}`
        : 'none',
      veil: sheet.parentElement ? getComputedStyle(sheet.parentElement).backgroundColor : '',
      focused: sheet.contains(document.activeElement),
    }
  })
}

const FRAME = {
  role: 'dialog',
  modal: 'true',
  named: true,
  width: 420,
  padding: '12px 20px 28px 20px',
  head: 36,
  close: '28×28 at 20',
  veil: 'rgba(5, 4, 8, 0.5)',
  focused: true,
}

async function oneSheet(page: Page) {
  // A sheet may arrive as its own chunk (the Invite sheet is lazy) and take the focus a frame later: polled until it
  // is the one sheet, in the frame, focused (CI on #224 read it before it was there).
  await expect.poll(() => page.evaluate(readSheets)).toEqual([{ ...FRAME, title: expect.any(String) }])
  const [sheet] = await page.evaluate(readSheets)
  return sheet?.title ?? ''
}

test.afterEach(async ({ page }) => {
  // Each fixture page keeps its own list of requests it didn't expect.
  const unexpected = await page.evaluate(() => [
    ...(window.fixture?.unexpected ?? []),
    ...(window.resourcesFixture?.unexpected ?? []),
  ])
  expect(unexpected).toEqual([])
})

test('sheet · Invite: the frame, Escape gives the focus back, the veil closes', async ({ page }) => {
  await page.goto('/room.html?demo=1')
  await drawn(page, DRAWN.room)
  const opener = page.getByRole('button', { name: 'Invite' })
  await opener.click()
  expect(await oneSheet(page)).toBe('15px/600')
  await expect(page.getByRole('tablist', { name: 'Invite' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(opener).toBeFocused()
  await opener.click()
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await page.locator('.sheet-backdrop').click({ position: { x: 20, y: 400 } })
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('sheet · Search: the frame', async ({ page }) => {
  await page.goto('/room.html?demo=1')
  await drawn(page, DRAWN.room)
  await page.getByRole('button', { name: 'Search' }).click()
  expect(await oneSheet(page)).toBe('15px/600')
})

test('sheet · a task: the frame', async ({ page }) => {
  await page.goto('/room.html?demo=1&place=work')
  await drawn(page, DRAWN.tasks)
  await page.getByText('Translate the checklist for the second region').first().click()
  expect(await oneSheet(page)).toBe('15px/600')
})

test('sheet · a resource: the frame with a head of its own, its steps before Close', async ({ page }) => {
  await page.goto('/resources.html')
  await drawn(page, DRAWN.resources)
  await page.getByText('Implement the PDF retry').first().click()
  expect(await oneSheet(page)).toBe('15px/600')
  const acts = page.getByRole('dialog').locator('.sheet-acts button')
  await expect(acts.last()).toHaveAccessibleName('Close')
  await expect(page.getByRole('dialog')).toHaveAttribute('aria-label', /Claude Code/)
})

test('sheet · the meeting’s recap, after leaving: the frame', async ({ page }) => {
  await page.goto('/room.html?demo=1&call=on&people=2&floor=1&sophia=listening')
  await drawn(page, DRAWN.room.slice(0, 1))
  await page.getByRole('button', { name: 'Leave the room' }).click()
  await expect(page.getByRole('dialog', { name: 'This meeting' })).toBeVisible()
  expect(await oneSheet(page)).toBe('15px/600')
})

test('sheet · the report viewer’s head presses are a sheet’s: 28 px squares, Close 20 from the edge', async ({
  page,
}) => {
  await page.goto('/room.html?demo=1&place=knowledge')
  await drawn(page, DRAWN.knowledge)
  await page.getByRole('button', { name: /^Open Pilot readout/ }).click()
  await expect(page.getByRole('button', { name: 'Close' })).toBeVisible()
  const head = await page.evaluate(() => {
    const pane = document.querySelector('.report-pane')
    const r = pane?.getBoundingClientRect()
    return [...(pane?.querySelectorAll('.report-pane-head .round') ?? [])].map((b) => {
      const c = b.getBoundingClientRect()
      return `${b.getAttribute('aria-label') ?? ''} ${String(Math.round(c.width))}×${String(Math.round(c.height))}${b.getAttribute('aria-label') === 'Close' ? ` at ${String(Math.round((r?.right ?? 0) - c.right))}` : ''}`
    })
  })
  expect(head).toEqual(['Enlarge 28×28', 'Close 28×28 at 20'])
})
