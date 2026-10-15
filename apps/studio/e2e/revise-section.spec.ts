import { expect, test, type Page } from '@playwright/test'

// Ask Sophia to revise sections of a report's page (docs/plans/revise-section.md): «Revise with Sophia…» on the current
// version's designed page, for editors and admins; the sections listed from the page, an instruction, and the API's
// requestDesignEdit. Every word is synthetic.

const pane = (page: Page) => page.locator('.report-pane')
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Revise the page' })
const served = (page: Page) => page.evaluate(() => [...(window.fixture?.served ?? [])])

async function openPage(page: Page, query = '') {
  await page.goto(`/room.html?place=work&designed=on${query}`)
  await page.getByRole('button', { name: 'Open fixture-report-v1.html, HTML page' }).click()
  await expect(
    page.frameLocator('iframe.report-html-frame').getByText('A labelled fixture designed page'),
  ).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test('revise · an admin asks Sophia to revise a section of the page, with what to change', async ({ page }) => {
  await openPage(page)
  await pane(page).getByRole('button', { name: 'Revise with Sophia…' }).click()
  await sheet(page).getByRole('checkbox', { name: 'A labelled fixture designed page' }).check()
  await sheet(page).getByLabel('What to change').fill('Make the opening shorter')
  await sheet(page).getByRole('button', { name: 'Ask Sophia' }).click()
  await expect(sheet(page).getByRole('status')).toHaveText(
    'Sophia is revising the page. Its next version will appear here.',
  )
  expect(await served(page)).toContain('html-edit:s1:Make the opening shorter')
})

test('revise · a viewer sees nothing to press', async ({ page }) => {
  await openPage(page, '&role=viewer')
  await expect(pane(page).getByRole('button', { name: 'Revise with Sophia…' })).toHaveCount(0)
})

test('revise · a refusal is said in the API’s words', async ({ page }) => {
  await openPage(page)
  await page.evaluate(() => window.fixture?.failEdit())
  await pane(page).getByRole('button', { name: 'Revise with Sophia…' }).click()
  await sheet(page).getByRole('checkbox', { name: 'A labelled fixture designed page' }).check()
  await sheet(page).getByLabel('What to change').fill('Again')
  await sheet(page).getByRole('button', { name: 'Ask Sophia' }).click()
  await expect(sheet(page).getByRole('alert')).toContainText('A design of this page is under way')
})
