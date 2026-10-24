import { expect, test, type Page } from '@playwright/test'

// What the address names follows Back without reopening what was closed (docs/plans/addressed-follows-back.md): a move
// through the history that lands on the record a view last followed, or on none, leaves what is on screen as it is.
// Every message and address here is synthetic.

const MENTIONED_IN = '00000000-0000-4000-8000-00000000003a'
const PROJECT = '00000000-0000-4000-8000-0000000000aa'
const READING = '00000000-0000-4000-8000-0000000000c1'
const BRIEFS = '00000000-0000-4000-8000-0000000000c2'
const REPORT = '00000000-0000-4000-8000-0000000000b1'
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

test('back · Chat closed after a mention stays closed when Back returns from a link to another view', async ({
  page,
}) => {
  await page.goto(`/room.html?call=on&exchange=open&people=2&floor=1&discussion=mentioned#message-${MENTIONED_IN}`)
  const entry = page.locator(`[data-message="${MENTIONED_IN}"]`)
  await expect(entry).toBeInViewport()
  await chatToggle(page).click() // closing Chat leaves the mention in the address
  await expect(entry).toBeHidden()
  // A link to a task in Tasks, as the router follows one (useProjectRoute.openAt): its path pushed, the task written
  // (showInAddress) and then named. The room's panel stays mounted (the project body), as it does in the Studio.
  await page.evaluate((project) => {
    window.history.pushState(null, '', `/p/${project}/work`)
    window.dispatchEvent(new Event('sophia:address-moved'))
    window.history.replaceState(null, '', `/p/${project}/work#task-t1`)
    window.dispatchEvent(new Event('sophia:address-shown'))
    window.dispatchEvent(new Event('sophia:address-named'))
  }, PROJECT)
  await page.goBack() // across the path: popstate only, onto the mention Chat already followed
  expect(new URL(page.url()).hash).toBe(`#message-${MENTIONED_IN}`)
  await page.waitForTimeout(300) // nothing to wait for: what follows is that nothing moved
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

test('back · a conversation pressed beside a report stays when the report closes, and the address names it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 }) // wide enough for the list beside the thread and report
  await page.goto('/room.html?place=conversations&conversations=1')
  const list = page.getByRole('region', { name: 'All conversations' })
  const open = page.getByRole('region', { name: 'Open conversation' })
  const title = open.getByRole('heading', { level: 3 })
  await list.getByRole('button', { name: /^Short or long briefs\?/ }).click()
  await expect(title).toHaveText('Short or long briefs?')
  // A report opened from a link in its thread: the viewer's own entry, carrying this conversation's address.
  const address = `${HERE}/p/${PROJECT}/conversations?report=${REPORT}`
  const field = open.getByRole('textbox', { name: 'Continue this question with the team' })
  await field.fill(`Look: ${address}`)
  await field.press('Enter')
  await open.getByRole('link', { name: address }).last().click()
  const report = page.getByRole('complementary', { name: 'Fixture report' })
  await expect(report).toBeVisible()
  await list.getByRole('button', { name: /^What makes a report worth reading\?/ }).click()
  await expect(title).toHaveText('What makes a report worth reading?')
  // Close steps Back over the viewer's entry: the report closes, and only the report.
  await report.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(report).toBeHidden()
  await expect(title).toHaveText('What makes a report worth reading?')
  await expect.poll(() => new URL(page.url()).hash).toBe(`#conversation-${READING}`)
  expect(new URL(page.url()).searchParams.has('report')).toBe(false)
})

test('back · Back from a report opened beside a conversation shows the one read then, over one pressed since', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 }) // wide enough for the list beside the thread and report
  await page.goto(`/room.html?place=conversations&conversations=1#conversation-${BRIEFS}`)
  const list = page.getByRole('region', { name: 'All conversations' })
  const open = page.getByRole('region', { name: 'Open conversation' })
  const title = open.getByRole('heading', { level: 3 })
  await expect(title).toHaveText('Short or long briefs?')
  const address = `${HERE}/p/${PROJECT}/conversations?report=${REPORT}`
  const field = open.getByRole('textbox', { name: 'Continue this question with the team' })
  await field.fill(`Look: ${address}`)
  await field.press('Enter')
  await open.getByRole('link', { name: address }).last().click()
  const report = page.getByRole('complementary', { name: 'Fixture report' })
  await expect(report).toBeVisible()
  await list.getByRole('button', { name: /^What makes a report worth reading\?/ }).click()
  await expect(title).toHaveText('What makes a report worth reading?')
  // The browser's Back, not Close: the entry from before the report, and the conversation read there.
  await page.goBack()
  await expect(report).toBeHidden()
  expect(new URL(page.url()).hash).toBe(`#conversation-${BRIEFS}`)
  await expect(title).toHaveText('Short or long briefs?')
})
