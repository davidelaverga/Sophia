import { expect, test, type Page } from '@playwright/test'

// A message's «Proposed» receipt says where its proposal is only while it is there (CON-01 G3, a stale receipt): in
// Still open while it waits; once accepted or declined, only that it was proposed. The brief's own writes (A08) stay
// their own. Every word is synthetic.

test.use({ timezoneId: 'UTC', locale: 'en-US' })

const PAGE = '/room.html?place=conversations&demo=1'
const context = (page: Page) => page.locator('.conv-context')
const open = (page: Page) => page.getByRole('region', { name: 'Open conversation' })
const stillOpen = (page: Page) => context(page).locator('.conv-decisions.open')

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

/** Marco's message proposed as «Briefs stay on one page»: its receipt, and the proposal's line in Still open. */
async function proposed(page: Page) {
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
  const receipt = marco.getByRole('status')
  await expect(receipt).toHaveText('Proposed · it’s in Still open')
  return { receipt, line: stillOpen(page).locator('li').filter({ hasText: 'Briefs stay on one page' }) }
}

for (const decision of ['Accept', 'Decline'] as const) {
  test(`proposed · once ${decision === 'Accept' ? 'accepted' : 'declined'}, the receipt no longer says it is in Still open`, async ({
    page,
  }) => {
    const { receipt, line } = await proposed(page)
    await line.getByRole('button', { name: decision }).click()
    await expect(line).toHaveCount(0)
    await expect(receipt).toHaveText('Proposed')
  })
}
