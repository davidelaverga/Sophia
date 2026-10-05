import { expect, test, type Page } from '@playwright/test'

// A passage of the open report, asked about or kept (docs/plans/room-passage.md): selecting text in the report shows
// «Ask Sophia» and «Keep»; asking puts it in the chat's message, keeping writes it to the brief with Undo. Every word is
// synthetic: the fixture report's.

const REPORT = '00000000-0000-4000-8000-0000000000b1'
const HOLDS = '“The fixture holds.”'

const pane = (page: Page) => page.getByRole('complementary', { name: 'Fixture report' })
const bar = (page: Page) => page.getByRole('toolbar', { name: 'The selected passage' })
const ask = (page: Page) => bar(page).getByRole('button', { name: 'Ask Sophia' })
const keep = (page: Page) => bar(page).getByRole('button', { name: 'Keep' })
const paragraph = (page: Page, text: string) => pane(page).locator('.md p', { hasText: text })
const kept = (page: Page) => page.evaluate(() => window.fixture?.notes() ?? [])
const status = (page: Page) => pane(page).locator('.passage-kept')

async function open(page: Page, query = 'call=on&exchange=open') {
  await page.goto(`/room.html?${query}&report=${REPORT}`)
  await expect(paragraph(page, 'The fixture holds.')).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

test('passage · a selection in the report shows the bar; one in its head shows none; it goes with the selection', async ({
  page,
}) => {
  await open(page)
  await expect(bar(page)).toHaveCount(0)
  await pane(page).locator('#report-pane-title').selectText()
  // The bar follows the selection a frame later: two frames on, a bar for the head would be there.
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('Fixture report')
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))
  await expect(bar(page)).toHaveCount(0)
  await paragraph(page, 'The fixture holds.').selectText()
  await expect(bar(page)).toBeVisible()
  await expect(bar(page).getByRole('button')).toHaveText(['Ask Sophia', 'Keep', 'Link'])
  // Above the selection, inside the pane, once it has risen into place.
  await bar(page).evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)))
  const sel = await paragraph(page, 'The fixture holds.').boundingBox()
  const b = await bar(page).boundingBox()
  const p = await pane(page).boundingBox()
  if (!sel || !b || !p) throw new Error('no boxes')
  expect(b.y + b.height).toBeLessThanOrEqual(sel.y + 1)
  expect(b.x).toBeGreaterThanOrEqual(p.x)
  expect(b.x + b.width).toBeLessThanOrEqual(p.x + p.width)
  await page.evaluate(() => window.getSelection()?.removeAllRanges())
  await expect(bar(page)).toHaveCount(0)
})

test('passage · Esc takes the bar away first, and the report stays', async ({ page }) => {
  await open(page)
  await paragraph(page, 'The fixture holds.').selectText()
  await expect(bar(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(bar(page)).toHaveCount(0)
  await expect(pane(page)).toBeVisible()
})

test('passage · Ask Sophia puts it in the chat’s message with its source, the caret after it', async ({ page }) => {
  await open(page)
  await paragraph(page, 'The fixture holds.').selectText()
  await ask(page).click()
  const field = page.locator('#converse-draft')
  await expect(field).toBeFocused()
  await expect(field).toHaveValue(`${HOLDS} (Fixture report, v1)\n`)
  const caret = await field.evaluate((el: HTMLTextAreaElement) => [el.selectionStart, el.value.length])
  expect(caret[0]).toBe(caret[1])
  // The report gave way to Chat, as one pane at a time asks; nothing was sent.
  await expect(pane(page)).toHaveCount(0)
})

test('passage · what was written in the chat stays, after the quote', async ({ page }) => {
  await page.goto('/room.html?call=on&exchange=open')
  await page.getByRole('button', { name: /^Chat/ }).first().click()
  const field = page.locator('#converse-draft')
  await field.fill('Is that so?')
  // The report opens from a link followed in the page, as a notice's Open does; Chat gives way to it.
  await page.evaluate((report) => {
    window.history.pushState(null, '', `/room.html?call=on&exchange=open&report=${report}`)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, REPORT)
  await paragraph(page, 'The fixture holds.').selectText()
  await ask(page).click()
  await expect(field).toHaveValue(`${HOLDS} (Fixture report, v1)\nIs that so?`)
})

test('passage · Keep writes it to the brief with its source, and Undo takes it out', async ({ page }) => {
  await open(page)
  await paragraph(page, 'The fixture holds.').selectText()
  await keep(page).click()
  await expect.poll(() => kept(page)).toEqual([`${HOLDS} — Fixture report, v1`])
  await expect(status(page)).toContainText('Kept in the brief')
  await expect(bar(page)).toHaveCount(0)
  await status(page).getByRole('button', { name: 'Undo' }).click()
  await expect.poll(() => kept(page)).toEqual([])
  await expect(status(page)).toContainText('Taken out of the brief')
})

test('passage · a passage across two paragraphs keeps a space between them', async ({ page }) => {
  await open(page)
  await page.evaluate(() => {
    const paragraphs = [...document.querySelectorAll('.report-pane .md p')]
    const first = paragraphs.find((p) => p.textContent === 'The fixture holds.')
    const last = paragraphs.find((p) => p.textContent === 'Read it once.')
    if (!first || !last) throw new Error('no paragraphs')
    const range = document.createRange()
    range.setStart(first, 0)
    range.setEnd(last, last.childNodes.length)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
  })
  await keep(page).click()
  await expect
    .poll(() => kept(page))
    .toEqual(['“The fixture holds. Recommendations Read it once.” — Fixture report, v1'])
})

test('passage · a Keep whose reply is lost says so, and Try again sends the same write: one note', async ({ page }) => {
  await open(page)
  await page.evaluate(() => window.fixture?.loseNextReply())
  await paragraph(page, 'The fixture holds.').selectText()
  await keep(page).click()
  await expect(status(page)).toContainText('Not confirmed it was kept.')
  // No other Keep while this one is open: a retry must never carry another note's key.
  await paragraph(page, 'Read it once.').selectText()
  await expect(bar(page).getByRole('button')).toHaveText(['Ask Sophia', 'Link'])
  await status(page).getByRole('button', { name: 'Try again' }).click()
  await expect(status(page)).toContainText('Kept in the brief.')
  expect(await kept(page)).toEqual([`${HOLDS} — Fixture report, v1`])
})

test('passage · a citation’s number is not part of what is kept', async ({ page }) => {
  await open(page)
  await paragraph(page, 'It cites one page').selectText()
  await keep(page).click()
  await expect.poll(() => kept(page)).toEqual(['“It cites one page.” — Fixture report, v1'])
})

test('passage · Undo refuses when something was built on the note, and the brief is where to forget it', async ({
  page,
}) => {
  await open(page)
  await paragraph(page, 'The fixture holds.').selectText()
  await keep(page).click()
  await expect(status(page)).toContainText('Kept in the brief')
  await page.evaluate(() => window.fixture?.buildOnNotes())
  await status(page).getByRole('button', { name: 'Undo' }).click()
  await expect(status(page)).toContainText('Something was built on it')
  expect(await kept(page)).toHaveLength(1)
})

test('passage · Keep is absent when the brief allows no note', async ({ page }) => {
  await open(page, 'call=on&exchange=open&notes=off')
  await paragraph(page, 'The fixture holds.').selectText()
  await expect(bar(page).getByRole('button')).toHaveText(['Ask Sophia', 'Link'])
})

test('passage · when the brief can’t be read, Keep is still offered: the write says why if it is refused', async ({
  page,
}) => {
  await open(page, 'call=on&exchange=open&notes=unread')
  await paragraph(page, 'The fixture holds.').selectText()
  await expect(bar(page).getByRole('button')).toHaveText(['Ask Sophia', 'Keep', 'Link'])
})

test('passage · outside the room, the chat isn’t there: Keep only', async ({ page }) => {
  await open(page, 'place=knowledge')
  await paragraph(page, 'The fixture holds.').selectText()
  await expect(bar(page).getByRole('button')).toHaveText(['Keep', 'Link'])
})

test('made · Esc puts it away with the focus on the page, not only inside it', async ({ page }) => {
  await page.goto('/room.html?call=on&people=2&floor=1&sophia=listening')
  await expect(page.getByRole('button', { name: 'Leave the room' })).toBeVisible()
  await page.evaluate(() => window.fixture?.notice())
  const made = page.getByRole('group', { name: 'Made by Sophia' })
  await expect(made).toBeVisible()
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined))
  await page.keyboard.press('Escape')
  await expect(made).toHaveCount(0)
})

test('work · under a video stage, her line isn’t there, so the task’s record isn’t read again', async ({ page }) => {
  const reads = () => page.evaluate(() => (window.fixture?.served ?? []).filter((s) => s.startsWith('task:')).length)
  await page.clock.install()
  await page.goto('/room.html?call=on&people=1&floor=1&research=running&video=camera')
  await expect(page.getByRole('button', { name: 'Leave the room' })).toBeVisible()
  await expect(page.locator('.sophia-line')).toHaveCount(0)
  // At most the read made before the cameras came; none after, though two polls' time goes by. Without the cameras
  // the record is read every 15 s (room-work.spec.ts).
  const before = await reads()
  await page.clock.fastForward(31_000)
  expect(await reads()).toBe(before)
})

test('work · in a room kept out of sight, the task’s record isn’t read again', async ({ page }) => {
  const reads = () => page.evaluate(() => (window.fixture?.served ?? []).filter((s) => s.startsWith('task:')).length)
  await page.clock.install()
  await page.goto('/room.html?call=on&people=1&floor=1&research=running')
  await expect(page.locator('.sophia-line .line-note')).toHaveText('Researching')
  // In sight, it is read again at the next poll: the check below would see a read.
  const first = await reads()
  await page.clock.fastForward(16_000)
  await expect.poll(reads).toBeGreaterThan(first)
  await page.evaluate(() => window.fixture?.away())
  const before = await reads()
  await page.clock.fastForward(31_000)
  expect(await reads()).toBe(before)
})
