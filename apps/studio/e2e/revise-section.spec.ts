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
  // Not yet askable, and still in reach: a press that waits stays focusable (Codex P1 on #359).
  const ask = sheet(page).getByRole('button', { name: 'Ask Sophia' })
  await expect(ask).toHaveAttribute('aria-disabled', 'true')
  await expect(ask).not.toHaveAttribute('disabled')
  await sheet(page).getByRole('checkbox', { name: 'A labelled fixture designed page' }).check()
  await sheet(page).getByLabel('What to change').fill('Make the opening shorter')
  await ask.focus()
  await page.keyboard.press('Enter')
  await expect(sheet(page).getByRole('status')).toHaveText(
    'Sophia is revising the page. Its next version will appear here.',
  )
  // The press went with the request: the focus goes on to Done, never to the page.
  await expect(sheet(page).getByRole('button', { name: 'Done' })).toBeFocused()
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

test('revise · while it is asked, the words stand still and a long wait is said; closed, its outcome is said beside the button', async ({
  page,
}) => {
  await openPage(page)
  await page.evaluate(() => window.fixture?.holdEdit(true))
  await pane(page).getByRole('button', { name: 'Revise with Sophia…' }).click()
  await sheet(page).getByRole('checkbox', { name: 'A labelled fixture designed page' }).check()
  await sheet(page).getByLabel('What to change').fill('Make the opening shorter')
  await sheet(page).getByRole('button', { name: 'Ask Sophia' }).click()
  // What was sent is what stays on screen (Codex P1 on #359).
  await expect(sheet(page).getByLabel('What to change')).toHaveAttribute('readonly', '')
  await expect(sheet(page).getByRole('checkbox', { name: 'A labelled fixture designed page' })).toBeDisabled()
  // A wait past six seconds is said, as every Studio write says it.
  await expect(sheet(page).getByRole('status')).toContainText('Taking longer than usual', { timeout: 9000 })
  // Closed while it goes: the request carries on, and its outcome is said beside the button.
  await sheet(page).getByRole('button', { name: 'Cancel' }).click()
  await expect(sheet(page)).toHaveCount(0)
  await page.evaluate(() => window.fixture?.holdEdit(false))
  await expect(pane(page).locator('.report-revise').getByRole('status')).toHaveText('Sophia is revising the page.')
  // Opened again, the sheet says it was admitted, with the words that went.
  await pane(page).getByRole('button', { name: 'Revise with Sophia…' }).click()
  await expect(sheet(page).getByRole('status')).toHaveText(
    'Sophia is revising the page. Its next version will appear here.',
  )
  await expect(sheet(page).getByLabel('What to change')).toHaveValue('Make the opening shorter')
  expect((await served(page)).filter((s) => s.startsWith('html-edit:'))).toHaveLength(1)
})
