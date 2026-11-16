import { expect, test, type Page } from '@playwright/test'

// Personal with messages kept without asking Sophia (A52 `recorded`; fixtures/personal-recorded.tsx): the Studio's own
// PersonalSpace over a space read by the canonical parser. Each kept message shows the person's own words, and under
// it, quietly, that it is kept and she was not asked: no "writing", no Ask again, no ways to arrive, no answer of hers
// made up, nothing to press, and nothing written. The focus stays where the person puts it; an erasure takes the words
// and their state together. Desktop, and `@phone` at 390×844 on a touch screen.
// The page's clock is fixed (Date only; timers run) at the moment the fixture's turns describe, noon today, so a
// welcome back is due only when a case says so: it reads the real clock, as the product does.

const PAGE = '/personal-recorded.html'
const KEPT = 'Kept — not asked yet'

/** Noon today plus `minutes`, in the browser's (the host's) zone: the fixture stamps its turns before noon. */
function atNoon(minutes = 0): Date {
  const at = new Date()
  at.setHours(12, minutes, 0, 0)
  return at
}

const writes = (page: Page) => page.evaluate(() => window.recordedFixture?.writes ?? [])

async function open(page: Page, minutesAfterNoon = 0) {
  await page.clock.setFixedTime(atNoon(minutesAfterNoon))
  await page.goto(PAGE)
  await expect.poll(() => page.evaluate(() => window.recordedFixture?.parsed)).toBe(true)
  await expect(page.locator('.msg').filter({ hasText: 'And one more, kept too.' })).toBeVisible()
}

async function heldShownQuietly(page: Page) {
  await open(page)
  // The person's own words, exactly, on their side.
  for (const words of ['A thought to keep for later: the Thursday plan.', 'And one more, kept too.']) {
    await expect(page.locator('.msg.me .body').filter({ hasText: words })).toHaveText(words)
  }
  // Under each, the quiet line: once per kept message, in the status line's quiet type, nothing to press in it.
  const said = page.locator('[data-recorded]')
  await expect(said).toHaveCount(2)
  await expect(said.first()).toHaveText(KEPT)
  await expect(said.locator('button, a, [tabindex]')).toHaveCount(0)
  expect(await said.first().evaluate((p) => getComputedStyle(p).fontSize)).toBe('13px')
  await expect(page.getByText(KEPT, { exact: true })).toHaveCount(2)
  // Nothing waits or is offered for them, and Sophia says nothing she did not say.
  await expect(page.getByText('Sophia is writing…')).toHaveCount(0)
  await expect(page.locator('.msg.typing')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Ask again|Asking/ })).toHaveCount(0)
  await expect(page.getByText('Sophia couldn’t answer this one.')).toHaveCount(0)
  await expect(page.getByRole('group', { name: 'How you arrive today' })).toHaveCount(0)
  await expect(page.getByRole('group', { name: 'Ways to start' })).toHaveCount(0)
  // Her one turn is her one reply; her introduction leads a conversation begun today, and is no turn of hers.
  await expect(page.locator('.msg.sophia[data-turn] .body')).toHaveText(['Of course. Where would you like to start?'])
  // The line sits inside the page, under its message.
  const box = await said.last().boundingBox()
  const width = await page.evaluate(() => document.documentElement.clientWidth)
  expect(box && box.x >= 0 && box.x + box.width <= width).toBe(true)
  const message = await page.locator('.msg.me').last().boundingBox()
  expect((box?.y ?? 0) >= (message?.y ?? Number.POSITIVE_INFINITY)).toBe(true)
}

async function focusAndErasure(page: Page) {
  await open(page)
  // The field takes the focus and keeps it: nothing kept pulls it away or writes anything.
  const field = page.locator('#c-input')
  await field.focus()
  await expect(field).toBeFocused()
  await expect(field).toBeFocused()
  expect(await writes(page)).toEqual([])
  // An erasure takes the kept words and their line together; nothing is written by the page for it.
  await page.evaluate(() => window.recordedFixture?.erase?.())
  await expect(page.locator('[data-recorded]')).toHaveCount(0)
  await expect(page.getByText('A thought to keep for later: the Thursday plan.')).toHaveCount(0)
  await expect(page.getByText(KEPT)).toHaveCount(0)
  expect(await writes(page)).toEqual([])
}

test('personal recorded · your kept words, then quietly kept and not asked: no wait, retry, arrival or answer', async ({
  page,
}) => {
  await heldShownQuietly(page)
  expect(await writes(page)).toEqual([])
})

test('personal recorded · the focus stays with the field, and an erasure takes the kept words with their line', async ({
  page,
}) => {
  await focusAndErasure(page)
})

test('personal recorded · a welcome back is due an hour after her last asked turn, the kept words set aside', async ({
  page,
}) => {
  // Her last answered exchange is at 11:20 and 11:21; the kept words at 11:40 and 11:55 do not count (as 0099).
  await open(page, 20)
  await expect(page.locator('.msg.sophia[data-turn] .body')).toHaveText(['Of course. Where would you like to start?'])
  expect(await writes(page)).toEqual([])
  await open(page, 22)
  // One welcome is asked for (and refused by the fixture); the kept words and their line stay as they were.
  await expect.poll(() => writes(page)).toEqual(['resume'])
  await expect(page.locator('.msg.me .body').filter({ hasText: 'And one more, kept too.' })).toBeVisible()
  await expect(page.locator('[data-recorded]')).toHaveCount(2)
})

test('@phone · personal recorded · your kept words and their quiet line fit the phone, with nothing to press', async ({
  page,
}) => {
  await heldShownQuietly(page)
  expect(await writes(page)).toEqual([])
})

test('@phone · personal recorded · the focus stays, and an erasure takes the kept words with their line', async ({
  page,
}) => {
  await focusAndErasure(page)
})
