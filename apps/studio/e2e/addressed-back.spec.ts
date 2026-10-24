import { expect, test, type Page } from '@playwright/test'

// What the address names follows Back without reopening what was closed (docs/plans/addressed-follows-back.md): a move
// through the history that lands on the record a view last followed, or on none, leaves what is on screen as it is.
// Every message and address here is synthetic.

const MENTIONED_IN = '00000000-0000-4000-8000-00000000003a'
const HERE = 'http://127.0.0.1:5199'

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== HERE,
    (route) => route.abort(),
  )
})

const chatToggle = (page: Page) => page.getByRole('button', { name: 'Chat', exact: true })

test('back · Chat opened by a mention’s address stays closed after a report opened from it closes', async ({
  page,
}) => {
  await page.goto(`/room.html?call=on&exchange=open&people=2&floor=1&discussion=mentioned#message-${MENTIONED_IN}`)
  const entry = page.locator(`[data-message="${MENTIONED_IN}"]`)
  await expect(entry).toBeInViewport()
  await page.evaluate(() => window.fixture?.notice())
  await page
    .getByRole('group', { name: 'Research report ready' })
    .getByRole('button', { name: 'Open', exact: true })
    .click()
  const pane = page.getByRole('complementary').filter({ has: page.locator('#report-pane-title') })
  await expect(pane).toBeVisible()
  await expect(entry).toBeHidden() // the chat gave way to the report
  // Close steps Back over the report's entry, onto the same `#message-…`: the record Chat already followed.
  await pane.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(pane).toHaveCount(0)
  expect(new URL(page.url()).hash).toBe(`#message-${MENTIONED_IN}`)
  await expect(chatToggle(page)).toBeFocused()
  await expect(entry).toBeHidden()
})

test('back · a goal chosen in Tasks’ rail stays chosen when Back lands where no task is named', async ({ page }) => {
  // The address names a task of the first goal: its goal is chosen and its sheet opens.
  await page.goto('/work.html?two=1#task-work-1')
  const chosen = page.getByRole('tab', { selected: true })
  await expect(chosen).toContainText('Reports export to PDF reliably')
  await page.keyboard.press('Escape') // closing takes the task out of the address
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('tab', { name: /pane/ }).click()
  await expect(chosen).toContainText('pane')
  // Tasks pressed again pushes its path (as the router does); Back lands on the entry the task was closed in.
  await page.getByRole('navigation', { name: 'Project views' }).getByRole('link', { name: 'Tasks' }).click()
  await page.goBack()
  expect(new URL(page.url()).hash).toBe('')
  await page.waitForTimeout(300) // nothing to wait for: what follows is that nothing moved
  await expect(chosen).toContainText('pane')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
