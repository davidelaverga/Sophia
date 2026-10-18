import { expect, test, type Page } from '@playwright/test'

// A message's «Proposed» line after its proposal is accepted while the brief can't be read again (CON-01 G3, Codex's
// stale receipt; main #203 decides the words, proposed-truth.md): it never goes on saying the proposal waits in Still
// open. The proposal and the decision stay the brief's own two writes (A08). Every word is synthetic.

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

test('proposed · accepted while the brief can’t be read again: the line stops saying it waits, and each write is its own', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(PAGE)
  await expect(stillOpen(page)).toContainText('Map first, list second')
  await page
    .getByRole('region', { name: 'All conversations' })
    .getByRole('button', { name: /Short or long briefs/ })
    .click()
  const marco = open(page).locator('.conv-messages > li').filter({ hasText: 'Anything longer, nobody reads.' })
  await marco.hover()
  await marco.getByRole('button', { name: 'Propose as decision' }).click()
  await open(page).getByRole('textbox', { name: 'Decision to propose' }).fill('Briefs stay on one page')
  await open(page).getByRole('button', { name: 'Propose', exact: true }).click()
  const line = marco.getByRole('status')
  await expect(line).toHaveText('Proposed · it’s in Still open')
  // Accepted in Still open; every read of the brief after it fails.
  await page.evaluate(() => window.fixture?.failMission(true))
  await stillOpen(page)
    .locator('li')
    .filter({ hasText: 'Briefs stay on one page' })
    .getByRole('button', { name: 'Accept' })
    .click()
  await expect.poll(async () => (await writes(page, '/decision')).length).toBe(1)
  expect(await writes(page, '/decision')).toMatchObject([{ decision: 'accept' }])
  await expect(line).toHaveText('Proposed · Still open couldn’t be read again')
  // Read again once it answers: no longer waiting there.
  await page.evaluate(() => window.fixture?.failMission(false))
  await context(page).getByRole('button', { name: 'Try again' }).first().click()
  await expect(line).toHaveText('Proposed · no longer in Still open')
  // One proposal and one decision, neither made by the other.
  expect(await writes(page, '/mission/proposals')).toEqual([
    { kind: 'constraint', statement: 'Briefs stay on one page' },
  ])
  expect(await writes(page, '/decision')).toHaveLength(1)
})
