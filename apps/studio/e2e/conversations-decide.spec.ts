import { expect, test, type Page } from '@playwright/test'
import { lowContrast } from './contrast.ts'
import { typeSizes } from './type-sizes.ts'

// Conversations: decide here (docs/plans/conversations-decide.md, C7). A proposal waiting is accepted or put off in the
// context, at the revision read; a message is proposed as a decision from the thread. The brief's own writes (A08), as
// the fixture answers them; only the API is faked.

test.use({ timezoneId: 'UTC', locale: 'en-US' })

const PAGE = '/room.html?place=conversations&demo=1'
const context = (page: Page) => page.locator('.conv-context')
const open = (page: Page) => page.getByRole('region', { name: 'Open conversation' })
const stillOpen = (page: Page) => context(page).locator('.conv-decisions.open')

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

/** The bodies of the writes that reached the brief at a path ending so: the page's fetch is faked, none leaves it. */
const writes = (page: Page, ending: string) =>
  page.evaluate(
    (end) => (window.fixture?.missionWrites ?? []).filter((w) => w.path.endsWith(end)).map((w) => w.body),
    ending,
  )

async function enter(page: Page, url = PAGE) {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(url)
  await expect(stillOpen(page)).toContainText('Map first, list second')
}

/** Another conversation opened, then the one titled `back` again: its messages are mounted anew. */
async function away(page: Page, back: string) {
  const rows = page.getByRole('region', { name: 'All conversations' }).getByRole('button')
  await rows.filter({ hasText: 'Short or long briefs?' }).click()
  await expect(open(page).getByRole('heading').first()).toHaveText('Short or long briefs?')
  await rows.filter({ hasText: back }).click()
  await expect(open(page).getByRole('heading').first()).toHaveText(back)
}

test('decide · «Accept» in Still open makes it an accepted decision, at the revision read', async ({ page }) => {
  await enter(page)
  await stillOpen(page).getByRole('button', { name: 'Accept' }).click()
  await expect.poll(() => writes(page, '/decision')).toEqual([{ decision: 'accept', expectedRevision: 1 }])
  await expect(context(page).locator('.conv-decisions:not(.open) li').first()).toHaveText('Map first, list second')
  await expect(context(page).getByText('Nothing waits for a decision.')).toBeVisible()
  await expect(context(page).getByRole('status')).toHaveText('Accepted: Map first, list second')
  // The press answered is gone with its line: the focus is on what it says, not lost.
  await expect(context(page).getByRole('status')).toBeFocused()
})

test('decide · «Decline» takes it out of Still open, and nothing is accepted', async ({ page }) => {
  await enter(page)
  await stillOpen(page).getByRole('button', { name: 'Decline' }).click()
  await expect(context(page).getByText('Nothing waits for a decision.')).toBeVisible()
  await expect(context(page).locator('.conv-decisions:not(.open)')).not.toContainText('Map first, list second')
})

test('decide · someone decided first: the context says so and shows the brief as it is now', async ({ page }) => {
  await enter(page, `${PAGE}&decide=stale`)
  await stillOpen(page).getByRole('button', { name: 'Accept' }).click()
  await expect(context(page).getByRole('status')).toHaveText(
    'Someone decided it first. This is the brief as it is now.',
  )
  // Read again: no longer waiting, among the accepted decisions, as whoever decided it left it.
  await expect(context(page).getByText('Nothing waits for a decision.')).toBeVisible()
  await expect(context(page).locator('.conv-decisions:not(.open) li').first()).toHaveText('Map first, list second')
})

test('decide · a message proposed as a decision: its words in, sent as a constraint, then in Still open', async ({
  page,
}) => {
  await enter(page)
  await page
    .getByRole('region', { name: 'All conversations' })
    .getByRole('button', { name: /Short or long briefs/ })
    .click()
  const marco = open(page).locator('.conv-messages > li').filter({ hasText: 'Anything longer, nobody reads.' })
  await marco.hover()
  await marco.getByRole('button', { name: 'Propose as decision' }).click()
  const field = open(page).getByRole('textbox', { name: 'Decision to propose' })
  await expect(field).toBeFocused()
  await expect(field).toHaveValue('One page. Anything longer, nobody reads.')
  await field.fill('Briefs stay on one page')
  await open(page).getByRole('button', { name: 'Propose', exact: true }).click()
  await expect
    .poll(() => writes(page, '/mission/proposals'))
    .toEqual([{ kind: 'constraint', statement: 'Briefs stay on one page' }])
  await expect(stillOpen(page)).toContainText('Briefs stay on one page')
  await expect(marco.getByRole('status')).toHaveText('Proposed · it’s in Still open')
  // Back on its press, the focus where the form was opened from.
  await expect(marco.getByRole('button', { name: 'Propose as decision' })).toBeFocused()
})

test('decide · with no reply, Cancel keeps the proposal’s words and key: reopened, Propose sends the same one, never a second', async ({
  page,
}) => {
  await enter(page, `${PAGE}&propose=lost`)
  const mine = open(page).locator('.conv-messages > li').last()
  await mine.hover()
  await mine.getByRole('button', { name: 'Propose as decision' }).click()
  const field = open(page).getByRole('textbox', { name: 'Decision to propose' })
  await field.fill('Briefs stay on one page')
  await open(page).getByRole('button', { name: 'Propose', exact: true }).click()
  await expect(open(page).getByRole('alert')).toContainText('No reply yet')
  await open(page).getByRole('button', { name: 'Cancel' }).click()
  await mine.hover()
  await mine.getByRole('button', { name: 'Propose as decision' }).click()
  await expect(field).toHaveValue('Briefs stay on one page')
  await open(page).getByRole('button', { name: 'Propose', exact: true }).click()
  await expect(mine.getByRole('status')).toHaveText('Proposed · it’s in Still open')
  // The first one had landed: the same key answers it, and Still open holds it once.
  await expect(stillOpen(page).locator('li').filter({ hasText: 'Briefs stay on one page' })).toHaveCount(1)
})

test('decide · with no reply, another conversation and back: the proposal is still held, sent again under its key', async ({
  page,
}) => {
  await enter(page, `${PAGE}&propose=lost`)
  const first = (await open(page).getByRole('heading').first().textContent()) ?? ''
  const mine = open(page).locator('.conv-messages > li').last()
  await mine.hover()
  await mine.getByRole('button', { name: 'Propose as decision' }).click()
  await open(page).getByRole('textbox', { name: 'Decision to propose' }).fill('Briefs stay on one page')
  await open(page).getByRole('button', { name: 'Propose', exact: true }).click()
  await expect(open(page).getByRole('alert')).toContainText('No reply yet')
  // Away to another conversation, and back to this one: the message is mounted anew.
  await away(page, first)
  const again = open(page).locator('.conv-messages > li').last()
  await again.hover()
  await again.getByRole('button', { name: 'Propose as decision' }).click()
  await expect(open(page).getByRole('textbox', { name: 'Decision to propose' })).toHaveValue('Briefs stay on one page')
  await open(page).getByRole('button', { name: 'Propose', exact: true }).click()
  await expect(again.getByRole('status')).toHaveText('Proposed · it’s in Still open')
  await expect(stillOpen(page).locator('li').filter({ hasText: 'Briefs stay on one page' })).toHaveCount(1)
})

test('decide · on its way, another conversation and back: the words sent are shown, and its landing closes the form', async ({
  page,
}) => {
  await enter(page, `${PAGE}&propose=slow`)
  const first = (await open(page).getByRole('heading').first().textContent()) ?? ''
  const mine = open(page).locator('.conv-messages > li').last()
  await mine.hover()
  await mine.getByRole('button', { name: 'Propose as decision' }).click()
  await open(page).getByRole('textbox', { name: 'Decision to propose' }).fill('Briefs stay on one page')
  await open(page).getByRole('button', { name: 'Propose', exact: true }).click()
  await away(page, first)
  const again = open(page).locator('.conv-messages > li').last()
  await again.hover()
  await again.getByRole('button', { name: 'Propose as decision' }).click()
  // Still on its way: the words it was sent with, which can't change, and no second press.
  await expect(open(page).getByRole('textbox', { name: 'Decision to propose' })).toHaveValue('Briefs stay on one page')
  await expect(open(page).getByRole('button', { name: 'Proposing…' })).toBeVisible()
  // It lands: the form goes, the press says so, and Still open holds it once.
  await expect(again.getByRole('status')).toHaveText('Proposed · it’s in Still open')
  await expect(open(page).getByRole('textbox', { name: 'Decision to propose' })).toHaveCount(0)
  await expect(stillOpen(page).locator('li').filter({ hasText: 'Briefs stay on one page' })).toHaveCount(1)
})

test('decide @phone · on a touch screen the press is a finger’s 40 px, and a keyboard reaches it unpressed', async ({
  page,
}) => {
  await page.goto(PAGE)
  // A phone shows the list first: the first conversation, opened.
  await page
    .getByRole('region', { name: 'All conversations' })
    .getByRole('listitem')
    .getByRole('button')
    .first()
    .click()
  const mine = open(page).locator('.conv-messages > li').last()
  const press = mine.getByRole('button', { name: 'Propose as decision' })
  // Out of sight until the message is pressed, it is still in reach of a keyboard and a screen reader.
  await expect(press).toHaveCSS('opacity', '0')
  await press.focus()
  await expect(press).toBeFocused()
  await expect(press).toHaveCSS('opacity', '1')
  const box = await press.boundingBox()
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(40)
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(40)
})

test('decide · Esc closes the form and gives the focus back to its press; nothing is sent', async ({ page }) => {
  await enter(page)
  const mine = open(page).locator('.conv-messages > li').last()
  await mine.hover()
  await mine.getByRole('button', { name: 'Propose as decision' }).click()
  await page.keyboard.press('Escape')
  await expect(open(page).getByRole('textbox', { name: 'Decision to propose' })).toHaveCount(0)
  await expect(mine.getByRole('button', { name: 'Propose as decision' })).toBeFocused()
})

test('decide · the presses keep to the app’s sizes and read at 4.5:1', async ({ page }) => {
  await enter(page)
  expect(await lowContrast(page, '.conv-decisions.open')).toEqual([])
  const sizes = await typeSizes(page, '.conv-context')
  for (const s of sizes) expect(['10.5px', '12px', '13px', '14px'], sizes.join(' ')).toContain(s)
})
