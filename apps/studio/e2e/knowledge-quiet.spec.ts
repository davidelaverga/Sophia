import { expect, test, type Page } from '@playwright/test'
import { lowContrast } from './contrast.ts'
import { typeSizes } from './type-sizes.ts'

// Knowledge's third pass (docs/plans/knowledge-quiet.md, K3): one quiet foot per tile, Sophia's credit as her mark,
// More reports as a button. On the fixture page; only the API is faked, and each check ends by asking the page whether
// anything reached for the API beyond what it answers.

test.afterEach(async ({ page }) => {
  const unexpected = await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])
  expect(unexpected, 'requests the fixture did not expect').toEqual([])
})

const tile = (page: Page, title: string) =>
  page.locator('.report-card').filter({ has: page.getByRole('button', { name: title, exact: true }) })

test('quiet · History and Edit share one line at the tile’s foot, not underlined at rest', async ({ page }) => {
  await page.goto('/room.html?place=knowledge')
  const card = tile(page, 'Fixture report')
  const history = card.getByRole('button', { name: 'History and changes' })
  const edit = card.getByRole('button', { name: 'Edit description', exact: true })
  await expect(history).toHaveText('History')
  const [h, e] = await Promise.all([history.boundingBox(), edit.boundingBox()])
  expect(h && e && Math.abs(h.y + h.height / 2 - (e.y + e.height / 2)) <= 1, 'one line').toBe(true)
  expect(h && e && h.x < e.x, 'History first').toBe(true)
  for (const b of [history, edit]) {
    expect(await b.evaluate((el) => getComputedStyle(el).textDecorationLine)).toBe('none')
  }
})

test('quiet · Sophia’s description opens with her mark, which says so; no line of credit in words', async ({
  page,
}) => {
  await page.goto('/room.html?place=knowledge')
  const card = tile(page, 'Fixture report')
  await expect(card.getByText('A labelled fixture report, as Sophia described it.')).toBeVisible()
  await expect(card.getByText('Description by Sophia', { exact: true })).toBeHidden()
  await expect(card.getByText(/Edited by a member/)).toHaveCount(0) // hers is never said to be a member's
  await expect(card.locator('.report-summary .umbral')).toBeVisible()
  expect(await card.locator('.report-summary').first().ariaSnapshot()).toContain('Description by Sophia')
  // The tile's press lies over her mark too: pressed there, the report opens.
  const box = await card.locator('.report-by').boundingBox()
  if (!box) throw new Error('her mark is missing')
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await expect(page.getByRole('complementary', { name: 'Fixture report' })).toBeVisible()
})

test('quiet · a member’s edit is said in words', async ({ page }) => {
  await page.goto('/room.html?place=knowledge')
  await page.evaluate(() => window.fixture?.describeElsewhere('A teammate’s description'))
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  const card = tile(page, 'Fixture report')
  await expect(card.getByText('A teammate’s description')).toBeVisible()
  await expect(card.getByText(/^Edited by a member/)).toBeVisible()
  await expect(card.locator('.report-summary .umbral')).toHaveCount(0)
})

test('quiet · More reports is a button under the tiles, in their middle, narrower than a tile', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/room.html?place=knowledge')
  const more = page.getByRole('button', { name: 'More reports' })
  const [button, tiles, one] = await Promise.all([
    more.boundingBox(),
    page.locator('.report-cards').boundingBox(),
    page.locator('.report-card').first().boundingBox(),
  ])
  if (!button || !tiles || !one) throw new Error('nothing to measure')
  expect(button.width).toBeLessThan(one.width)
  expect(Math.abs(button.x + button.width / 2 - (tiles.x + tiles.width / 2))).toBeLessThanOrEqual(1)
})

test('quiet · the tiles keep to the four type sizes', async ({ page }) => {
  await page.goto('/room.html?place=knowledge&designed=on')
  await expect(tile(page, 'Fixture report').locator('.report-cover iframe')).toBeAttached()
  const sizes = await typeSizes(page, '.report-cards')
  for (const s of sizes) expect(['10.5px', '12px', '13px', '15px'], sizes.join(' ')).toContain(s)
})

test('quiet · every word on the tiles reads: no contrast under 4.5:1', async ({ page }) => {
  await page.goto('/room.html?place=knowledge')
  await page.getByRole('button', { name: 'More reports' }).click()
  await expect(page.locator('.report-cover[data-cover="lines"]')).toHaveCount(2)
  expect(await lowContrast(page, '.report-cards')).toEqual([])
})

// Seam #9 (docs/plans/description-reply-lost.md): a save whose reply was lost is said as saved once the cards read back
// the words sent, never blamed on a teammate; only other words are a conflict, and the typed ones stay.
const SAVED = 'Saved. The reply was lost on the way, but the description reads as you wrote it.'

/** Every line a description says from the page's start, kept as said: one replaced before an assertion still counts. */
const recordLines = (page: Page) =>
  page.addInitScript(() => {
    const said: string[] = []
    Reflect.set(window, 'linesSaid', said)
    new MutationObserver(() => {
      for (const line of document.querySelectorAll('.report-problem, .report-saved')) said.push(line.textContent)
    }).observe(document, { childList: true, subtree: true, characterData: true })
  })

/** The lines said so far that blamed someone else for the description (null when nothing recorded them). */
const blamed = (page: Page) =>
  page.evaluate(() => {
    const said: unknown = Reflect.get(window, 'linesSaid')
    if (!Array.isArray(said)) return null
    return said.filter((line): line is string => typeof line === 'string' && line.includes('Someone changed'))
  })

test('quiet · a save whose reply was lost says it was saved, once, never that someone changed it', async ({ page }) => {
  await recordLines(page)
  await page.goto('/room.html?place=knowledge&summary=lost')
  const card = tile(page, 'Fixture report')
  const edit = card.getByRole('button', { name: 'Edit description', exact: true })
  const field = card.getByRole('textbox', { name: 'Description' })
  await edit.click()
  await field.fill('My sharper description')
  await card.getByRole('button', { name: 'Save' }).click()
  // No reply came, but the cards read again bring back the words sent: the form closes, said as saved, politely.
  await expect(card.getByText(SAVED)).toHaveAttribute('role', 'status')
  await expect(card.getByRole('alert')).toHaveCount(0)
  await expect(field).toHaveCount(0)
  await expect(card.getByText('My sharper description', { exact: true })).toBeVisible()
  await expect(edit).toBeFocused() // the form had it: it comes back to Edit, nothing takes it elsewhere
  // Once: the next Edit takes the line away, and a Save with no change is saved, never refused as someone else's.
  await edit.click()
  await expect(card.getByText(SAVED)).toHaveCount(0)
  await card.getByRole('button', { name: 'Save' }).click()
  await expect(field).toHaveCount(0)
  await expect(card.getByText('My sharper description', { exact: true })).toBeVisible()
  await expect(card.getByText(SAVED)).toHaveCount(0)
  expect(await blamed(page)).toEqual([])
})

test('quiet · a stale save whose words are the description already says it was saved, not someone else’s', async ({
  page,
}) => {
  await recordLines(page)
  await page.goto('/room.html?place=knowledge')
  const card = tile(page, 'Fixture report')
  await card.getByRole('button', { name: 'Edit description', exact: true }).click()
  const field = card.getByRole('textbox', { name: 'Description' })
  await field.fill('My sharper description')
  // The same words landed meanwhile, as a save whose reply this page never heard: unread here until Save is refused.
  await page.evaluate(() => window.fixture?.describeElsewhere('My sharper description'))
  await card.getByRole('button', { name: 'Save' }).click()
  await expect(card.getByText(SAVED)).toHaveAttribute('role', 'status')
  await expect(field).toHaveCount(0)
  // Never, not even for a moment before the cards read again: a stale refusal says nothing until it is settled.
  expect(await blamed(page)).toEqual([])
})

test('quiet · other words saved meanwhile are a conflict: the typed words stay, and Save puts them in place', async ({
  page,
}) => {
  await page.goto('/room.html?place=knowledge')
  const card = tile(page, 'Fixture report')
  await card.getByRole('button', { name: 'Edit description', exact: true }).click()
  const field = card.getByRole('textbox', { name: 'Description' })
  await field.fill('My own description')
  await page.evaluate(() => window.fixture?.describeElsewhere('A teammate’s description'))
  await card.getByRole('button', { name: 'Save' }).click()
  // Theirs is named before Save can replace it: never chosen blind.
  await expect(card.getByRole('alert')).toHaveText(
    'Someone changed this description to “A teammate’s description” since you opened it. Save to use yours instead.',
  )
  await expect(field).toHaveValue('My own description')
  await expect(card.getByText(SAVED)).toHaveCount(0)
  // Told, the person saves theirs over the description now read.
  await card.getByRole('button', { name: 'Save' }).click()
  await expect(field).toHaveCount(0)
  await expect(card.getByText('My own description', { exact: true })).toBeVisible()
  await expect(card.getByRole('alert')).toHaveCount(0)
})

test('quiet · a second Save before the cards read again is still the person’s own, never someone else’s', async ({
  page,
}) => {
  await recordLines(page)
  await page.goto('/room.html?place=knowledge&summary=lost')
  const card = tile(page, 'Fixture report')
  const field = card.getByRole('textbox', { name: 'Description' })
  await card.getByRole('button', { name: 'Edit description', exact: true }).click()
  await field.fill('My sharper description')
  // The cards read slowly: the first save lands and its reply is lost, and nothing has read it back yet.
  await page.evaluate(() => window.fixture?.holdReports())
  await card.getByRole('button', { name: 'Save' }).click()
  await expect(card.getByRole('alert')).toContainText('No reply from Sophia')
  // A word changed and saved again, against the revision the first already moved on: refused as stale, unsaid.
  await field.fill('My sharper description, again')
  await card.getByRole('button', { name: 'Save' }).click()
  await expect(card.getByRole('alert')).toHaveCount(0)
  await page.evaluate(() => window.fixture?.releaseReports())
  await expect(card.locator('.report-problem, .report-saved')).toHaveText(SAVED)
  await expect(field).toHaveValue('My sharper description, again') // the words typed since stay, offered over it
  await card.getByRole('button', { name: 'Save' }).click()
  await expect(field).toHaveCount(0)
  await expect(card.getByText('My sharper description, again', { exact: true })).toBeVisible()
  expect(await blamed(page)).toEqual([])
})

test('quiet · Cancel and Edit while a save is unheard start from the words sent, and saving them is the person’s own', async ({
  page,
}) => {
  await recordLines(page)
  await page.goto('/room.html?place=knowledge&summary=lost')
  const card = tile(page, 'Fixture report')
  const edit = card.getByRole('button', { name: 'Edit description', exact: true })
  const field = card.getByRole('textbox', { name: 'Description' })
  await edit.click()
  await field.fill('My sharper description')
  await page.evaluate(() => window.fixture?.holdReports())
  await card.getByRole('button', { name: 'Save' }).click()
  await expect(card.getByRole('alert')).toContainText('No reply from Sophia')
  await card.getByRole('button', { name: 'Cancel' }).click()
  await expect(card.getByRole('alert')).toContainText('No reply from Sophia') // it still waits to be heard
  await edit.click()
  await expect(field).toHaveValue('My sharper description') // the words sent, not the card's older ones
  await card.getByRole('button', { name: 'Save' }).click() // refused as stale: the first one landed
  await page.evaluate(() => window.fixture?.releaseReports())
  await expect(card.getByText(SAVED)).toHaveAttribute('role', 'status')
  await expect(field).toHaveCount(0)
  await expect(card.getByText('My sharper description', { exact: true })).toBeVisible()
  expect(await blamed(page)).toEqual([])
})

test('quiet · the saved line goes once the description reads otherwise', async ({ page }) => {
  await page.goto('/room.html?place=knowledge&summary=lost')
  const card = tile(page, 'Fixture report')
  await card.getByRole('button', { name: 'Edit description', exact: true }).click()
  await card.getByRole('textbox', { name: 'Description' }).fill('My sharper description')
  await card.getByRole('button', { name: 'Save' }).click()
  await expect(card.getByText(SAVED)).toHaveAttribute('role', 'status')
  // A teammate edits it since, and the cards read again (the window's focus comes back): no longer as written.
  await page.evaluate(() => window.fixture?.describeElsewhere('A teammate’s description'))
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await expect(card.getByText('A teammate’s description', { exact: true })).toBeVisible()
  await expect(card.getByText(SAVED)).toHaveCount(0)
})
