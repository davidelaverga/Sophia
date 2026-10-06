import { expect, test, type Page } from '@playwright/test'

// A passage becomes a task (docs/plans/room-passage-task.md): a proposed A17, behind the vision flag the fixture pages
// set. Three others are in the call: Marco and Lucía, members, and Noor, a guest. Every word is synthetic.

const REPORT = '00000000-0000-4000-8000-0000000000b1'

const pane = (page: Page) => page.getByRole('complementary', { name: 'Fixture report' })
const bar = (page: Page) => page.getByRole('toolbar', { name: 'The selected passage' })
const form = (page: Page) => pane(page).getByRole('form', { name: 'New task' })
const what = (page: Page) => form(page).getByRole('textbox', { name: 'What needs doing?' })
const forWhom = (page: Page) => form(page).getByRole('combobox', { name: 'For' })
const added = (page: Page) => pane(page).locator('.task-added')
const tasksTab = (page: Page) => pane(page).getByRole('tab', { name: /^Tasks/ })
const rows = (page: Page) => pane(page).getByRole('list', { name: 'Tasks' }).getByRole('listitem')
const served = (page: Page) => page.evaluate(() => [...(window.fixture?.served ?? [])])
const writes = async (page: Page) => (await served(page)).filter((s) => s.startsWith('task:'))
const reads = async (page: Page) => (await served(page)).filter((s) => s === 'tasks:read').length

async function open(page: Page, query = '') {
  await page.goto(`/room.html?call=on&exchange=open&people=3&guest&report=${REPORT}${query}`)
  await expect(pane(page).locator('.md p', { hasText: 'The fixture holds.' })).toBeVisible()
}

async function startTask(page: Page) {
  await pane(page).locator('.md p', { hasText: 'The fixture holds.' }).selectText()
  await bar(page).getByRole('button', { name: 'Task' }).click()
  await expect(form(page)).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

test('task · the form quotes the passage and its source, and Create needs words', async ({ page }) => {
  await open(page)
  await startTask(page)
  await expect(form(page).locator('.task-quote')).toHaveText('“The fixture holds.” — Fixture report, v1')
  await expect(what(page)).toBeFocused()
  await form(page).getByRole('button', { name: 'Create' }).click()
  await expect(form(page).getByRole('alert')).toHaveText('Say what needs doing first.')
  await what(page).fill('Check it')
  await expect(form(page).getByRole('alert')).toHaveCount(0)
  expect(await writes(page)).toEqual([])
})

test('task · For offers me, anyone and the members in the call, never a guest', async ({ page }) => {
  await open(page)
  await startTask(page)
  await expect(forWhom(page).locator('option')).toHaveText(['Me', 'Anyone', 'Marco', 'Lucía'])
  await expect(forWhom(page)).toHaveValue('me')
})

test('task · Create records it once, says for whom, and See tasks opens the tab with its row', async ({ page }) => {
  await open(page)
  await startTask(page)
  await what(page).fill('Check the March figure')
  await forWhom(page).selectOption({ label: 'Lucía' })
  await form(page).getByRole('button', { name: 'Create' }).click()
  await expect(form(page)).toHaveCount(0)
  await expect(added(page)).toContainText('Task added for Lucía.')
  await expect(added(page)).toBeFocused()
  expect(await writes(page)).toEqual(['task:create'])
  await added(page).getByRole('button', { name: 'See tasks' }).click()
  await expect(tasksTab(page)).toHaveAttribute('aria-selected', 'true')
  await expect(added(page)).toBeEmpty()
  await expect(tasksTab(page)).toHaveText('Tasks 1')
  await expect(rows(page)).toHaveCount(1)
  await expect(rows(page).first()).toContainText('Check the March figure')
  await expect(rows(page).first()).toContainText('For Lucía')
})

test('task · Done records once and says so; the tab counts only the open ones', async ({ page }) => {
  await open(page)
  await startTask(page)
  await what(page).fill('Name the sources')
  await form(page).getByRole('button', { name: 'Create' }).click()
  await added(page).getByRole('button', { name: 'See tasks' }).click()
  await expect(rows(page).first()).toContainText('For you')
  await rows(page).first().getByRole('button', { name: 'Done' }).click()
  await expect(rows(page).first()).toContainText('Done by you.')
  await expect(rows(page).first().getByRole('button')).toHaveCount(0)
  await expect(tasksTab(page)).toHaveText('Tasks 0')
  expect(await writes(page)).toEqual(['task:create', 'task:done'])
})

test('task · a row’s passage is a link to its place in its version, with none of its words', async ({ page }) => {
  await open(page)
  await startTask(page)
  await what(page).fill('Check it')
  await form(page).getByRole('button', { name: 'Create' }).click()
  await added(page).getByRole('button', { name: 'See tasks' }).click()
  const link = rows(page).first().getByRole('link', { name: '“The fixture holds.”' })
  const href = (await link.getAttribute('href')) ?? ''
  const q = new URL(href, 'http://127.0.0.1:5199').searchParams
  expect(q.get('report')).toBe(REPORT)
  expect(q.get('version')).not.toBeNull()
  expect(q.get('passage')).toMatch(/^\d+\.\d+\.\d+$/)
  expect(href).not.toContain('fixture')
  // A tab of its own: following it in the room would reload it, and leave the call.
  await expect(link).toHaveAttribute('target', '_blank')
})

test('task · Esc and Cancel close the form, the pane stays, and the focus goes back to the report’s title', async ({
  page,
}) => {
  await open(page)
  await startTask(page)
  // From a button, where the pane would take Esc as its own: the form's Esc is the form's.
  await form(page).getByRole('button', { name: 'Create' }).focus()
  const at = page.url()
  await page.keyboard.press('Escape')
  await expect(form(page)).toHaveCount(0)
  await expect(pane(page).locator('#report-pane-title')).toBeFocused()
  // A step down would take the pane a moment later: it is still there after one.
  await page.evaluate(() => new Promise((done) => setTimeout(done, 500)))
  await expect(pane(page)).toHaveCount(1)
  // A step down is a step back in the history: the address would have moved.
  expect(page.url()).toBe(at)
  await startTask(page)
  await form(page).getByRole('button', { name: 'Cancel' }).click()
  await expect(form(page)).toHaveCount(0)
  await expect(pane(page).locator('#report-pane-title')).toBeFocused()
})

test('task · with no reply, only Try again, and it records once', async ({ page }) => {
  await open(page)
  await page.evaluate(() => window.fixture?.loseNextTaskReply())
  await startTask(page)
  await what(page).fill('Check it')
  await form(page).getByRole('button', { name: 'Create' }).click()
  await expect(form(page).getByRole('status')).toHaveText('Not sent. Try again.')
  await expect(form(page).getByRole('button', { name: 'Create' })).toHaveCount(0)
  await form(page).getByRole('button', { name: 'Try again' }).click()
  await expect(added(page)).toContainText('Task added for you.')
  expect(await writes(page)).toEqual(['task:create'])
})

test('task · a viewer sees the tasks, with no Task in the bar and no Done on another’s', async ({ page }) => {
  await open(page, '&role=viewer')
  await page.evaluate(() => window.fixture?.taskBy(2))
  await tasksTab(page).click()
  await expect(rows(page)).toHaveCount(1)
  await expect(rows(page).first()).toContainText('For Lucía')
  await expect(rows(page).first().getByRole('button')).toHaveCount(0)
  await pane(page).getByRole('tab', { name: 'Document' }).click()
  await pane(page).locator('.md p', { hasText: 'The fixture holds.' }).selectText()
  await expect(bar(page)).toBeVisible()
  await expect(bar(page).getByRole('button', { name: 'Task' })).toHaveCount(0)
})

test('task · another member’s task shows as the feed moves', async ({ page }) => {
  await open(page)
  await tasksTab(page).click()
  await expect(tasksTab(page)).toHaveText('Tasks 0')
  const before = await reads(page)
  await page.evaluate(() => window.fixture?.taskBy(null))
  await expect.poll(() => reads(page)).toBeGreaterThan(before)
  await expect(rows(page)).toHaveCount(1)
  await expect(rows(page).first()).toContainText('For anyone')
  await expect(rows(page).first().getByRole('button', { name: 'Done' })).toBeVisible()
})

test('task · a Done with no reply says so, and Try again records it once', async ({ page }) => {
  await open(page)
  await page.evaluate(() => window.fixture?.taskBy(null))
  await tasksTab(page).click()
  await page.evaluate(() => window.fixture?.loseNextTaskReply())
  await rows(page).first().getByRole('button', { name: 'Done' }).click()
  await expect(rows(page).first()).toContainText('Not sent. Try again.')
  await rows(page).first().getByRole('button', { name: 'Try again' }).click()
  await expect(rows(page).first()).toContainText('Done by you.')
  expect(await writes(page)).toEqual(['task:done'])
})

test('task · while a Create has no reply, no other Task is offered; closed, the foot keeps its Try again', async ({
  page,
}) => {
  await open(page)
  await page.evaluate(() => window.fixture?.loseNextTaskReply())
  await startTask(page)
  await what(page).fill('Check it')
  await form(page).getByRole('button', { name: 'Create' }).click()
  await expect(form(page).getByRole('status')).toHaveText('Not sent. Try again.')
  await pane(page).locator('.md p', { hasText: 'Read it once.' }).selectText()
  await expect(bar(page)).toBeVisible()
  await expect(bar(page).getByRole('button', { name: 'Task' })).toHaveCount(0)
  await page.evaluate(() => window.getSelection()?.removeAllRanges())
  await form(page).getByRole('button', { name: 'Cancel' }).click()
  await expect(form(page)).toHaveCount(0)
  await expect(added(page)).toContainText('Not sent. Try again.')
  await added(page).getByRole('button', { name: 'Try again' }).click()
  await expect(added(page)).toContainText('Task added for you.')
  expect(await writes(page)).toEqual(['task:create'])
})
