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

async function enter(page: Page, url = PAGE) {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(url)
  await expect(stillOpen(page)).toContainText('Map first, list second')
}

test('decide · «Accept» in Still open makes it an accepted decision, at the revision read', async ({ page }) => {
  await enter(page)
  const asked = page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/decision'))
  await stillOpen(page).getByRole('button', { name: 'Accept' }).click()
  expect((await asked).postDataJSON()).toEqual({ decision: 'accept', expectedRevision: 1 })
  await expect(context(page).locator('.conv-decisions:not(.open) li').first()).toHaveText('Map first, list second')
  await expect(context(page).getByText('Nothing waits for a decision.')).toBeVisible()
  await expect(context(page).getByRole('status')).toHaveText('Accepted: Map first, list second')
})

test('decide · «Not now» takes it out of Still open, and nothing is accepted', async ({ page }) => {
  await enter(page)
  await stillOpen(page).getByRole('button', { name: 'Not now' }).click()
  await expect(context(page).getByText('Nothing waits for a decision.')).toBeVisible()
  await expect(context(page).locator('.conv-decisions:not(.open)')).not.toContainText('Map first, list second')
})

test('decide · someone decided first: the context says so and shows the brief as it is now', async ({ page }) => {
  await enter(page, `${PAGE}&decide=stale`)
  await stillOpen(page).getByRole('button', { name: 'Accept' }).click()
  await expect(context(page).getByRole('status')).toHaveText(
    'Someone decided it first. This is the brief as it is now.',
  )
  // Read again: still waiting, now at its newer revision, and accepted at that one.
  const asked = page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/decision'))
  await stillOpen(page).getByRole('button', { name: 'Accept' }).click()
  expect((await asked).postDataJSON()).toEqual({ decision: 'accept', expectedRevision: 2 })
  await expect(context(page).getByText('Nothing waits for a decision.')).toBeVisible()
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
  const sent = page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/mission/proposals'))
  await open(page).getByRole('button', { name: 'Propose', exact: true }).click()
  expect((await sent).postDataJSON()).toEqual({ kind: 'constraint', statement: 'Briefs stay on one page' })
  await expect(stillOpen(page)).toContainText('Briefs stay on one page')
  await expect(marco.getByRole('status')).toHaveText('Proposed · it’s in Still open')
  // Back on its press, the focus where the form was opened from.
  await expect(marco.getByRole('button', { name: 'Propose as decision' })).toBeFocused()
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
