import { expect, test, type Page } from '@playwright/test'

// A project's human tasks as A39 serves them (docs/handoffs/FND-C5-HUMAN-TASKS-attempt-1.md): the room's fixture page
// built with VITE_SOPHIA_TASKS=1 and without the vision flag (vite.search.config.ts), so the Studio reads and writes
// tasks through its served adapter (api/tasks.ts) and the generated A39 parsers, and the fixture answers as A39 does
// (human-tasks-data.ts). A synthetic fixture, not the API: the API's own proof is human-tasks.db.test.ts. Every word is
// synthetic.

test.use({ timezoneId: 'UTC', locale: 'en-US' })

const PROJECT = '00000000-0000-4000-8000-0000000000aa'
const REPORT = '00000000-0000-4000-8000-0000000000b1'
const ME = '00000000-0000-4000-8000-0000000000a1'
/** Marco, an editor of the fixture project (fake-people.ts personId(1)). */
const MARCO = '00000000-0000-4000-8000-0000000000b1'
const taskId = (n: number) => `00000000-0000-4000-8000-0000000c${String(n).padStart(4, '0')}`
const TASKS = `/api/v1/projects/${PROJECT}/tasks`

const served = (page: Page) => page.evaluate(() => [...(window.fixture?.served ?? [])])
const requests = async (page: Page) =>
  (await served(page)).filter((s) => s.startsWith('task-request:')).map((s) => s.slice('task-request:'.length))
const reads = async (page: Page) =>
  (await served(page)).filter((s) => s.startsWith('task-read:')).map((s) => s.slice('task-read:'.length))

const brief = (page: Page) => page.locator('.project-tasks')
const rows = (page: Page) => brief(page).getByRole('list', { name: 'Project tasks' }).getByRole('listitem')
const row = (page: Page, title: string) => rows(page).filter({ hasText: title })
const pane = (page: Page) => page.getByRole('complementary', { name: 'Fixture report' })
const tabRows = (page: Page) => pane(page).getByRole('list', { name: 'Tasks' }).getByRole('listitem')

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5198',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

/** The room with the seeded tasks (one for nobody, one for the reader from a passage, one for Lucía, one from a passage
 * the reader may not follow), and the brief opened. */
async function openBrief(page: Page, query = '') {
  await page.goto(`/room.html?people=2&humantasks=seed${query}`)
  await expect(page.locator('.room-stage')).toBeVisible()
  await page.getByRole('button', { name: 'Brief', exact: true }).click()
  await expect(rows(page)).toHaveCount(4)
}

/** A JSON object as parsed, its fields readable; anything else fails the check. */
function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`not an object: ${String(value)}`)
  return { ...value }
}

/** The last write's request as sent: method, path and body. */
const lastRequest = async (page: Page) => (await requests(page)).at(-1) ?? ''

test('served tasks · the brief lists them through A39: a passage as a link only, one the reader may not follow redacted, no words of it anywhere', async ({
  page,
}) => {
  await openBrief(page)
  expect(await reads(page)).toContain(TASKS)
  const march = row(page, 'Check the March figure')
  await expect(march).toContainText('For you')
  const link = march.getByRole('link', { name: 'v1' })
  await expect(link).toHaveAttribute('href', /passage=2\.0\.3/)
  const hidden = row(page, 'Read the private draft')
  await expect(hidden).toContainText('The passage it came from isn’t available to you')
  await expect(hidden.getByRole('link')).toHaveCount(0)
  await expect(row(page, 'Book the room')).toContainText('For nobody yet')
  await expect(brief(page)).not.toContainText('The fixture holds')
  await expect(brief(page)).not.toContainText('“')
})

test('served tasks · an admin claims, releases, assigns and finishes, each against the revision shown, sent as A39 asks', async ({
  page,
}) => {
  await openBrief(page)
  const room = row(page, 'Book the room')
  await room.getByRole('button', { name: 'Claim' }).click()
  await expect(room).toContainText('For you')
  expect(await lastRequest(page)).toBe(`PUT ${TASKS}/${taskId(1)}/owner {"ownerId":"${ME}","expectedRevision":1}`)
  await room.getByRole('button', { name: 'Release' }).click()
  await expect(room).toContainText('For nobody yet')
  expect(await lastRequest(page)).toBe(`PUT ${TASKS}/${taskId(1)}/owner {"ownerId":null,"expectedRevision":2}`)
  await room.getByRole('combobox', { name: 'Assign to' }).selectOption({ label: 'Marco' })
  await expect(room).toContainText('For Marco')
  expect(await lastRequest(page)).toBe(`PUT ${TASKS}/${taskId(1)}/owner {"ownerId":"${MARCO}","expectedRevision":3}`)
  await room.getByRole('button', { name: 'Done' }).click()
  await expect(room).toContainText('Done by you.')
  expect(await lastRequest(page)).toBe(`POST ${TASKS}/${taskId(1)}/done {"expectedRevision":4}`)
  // Done, it offers nothing more.
  await expect(room.getByRole('button')).toHaveCount(0)
})

test('served tasks · a viewer finishes only a task theirs: no Claim, Release or Assign, no Done on nobody’s or Lucía’s', async ({
  page,
}) => {
  await openBrief(page, '&role=viewer')
  for (const name of ['Claim', 'Release']) await expect(brief(page).getByRole('button', { name })).toHaveCount(0)
  await expect(brief(page).getByRole('combobox', { name: 'Assign to' })).toHaveCount(0)
  await expect(row(page, 'Book the room').getByRole('button', { name: 'Done' })).toHaveCount(0)
  await expect(row(page, 'Call the venue').getByRole('button', { name: 'Done' })).toHaveCount(0)
  await row(page, 'Check the March figure').getByRole('button', { name: 'Done' }).click()
  await expect(row(page, 'Check the March figure')).toContainText('Done by you.')
  expect(await lastRequest(page)).toBe(`POST ${TASKS}/${taskId(2)}/done {"expectedRevision":1}`)
  expect(await requests(page)).toHaveLength(1)
})

test('served tasks · changed meanwhile, a Claim answers 409: the row says so and is read again as it is now', async ({
  page,
}) => {
  await openBrief(page)
  const before = (await reads(page)).filter((r) => r === TASKS).length
  // Marco took it meanwhile; this page still shows revision 1.
  await page.evaluate(([id, marco]) => window.fixture?.bumpTask(id, marco), [taskId(1), MARCO] as const)
  const room = row(page, 'Book the room')
  await room.getByRole('button', { name: 'Claim' }).click()
  expect(await lastRequest(page)).toBe(`PUT ${TASKS}/${taskId(1)}/owner {"ownerId":"${ME}","expectedRevision":1}`)
  await expect(room).toContainText('This task changed meanwhile. It’s shown as it is now.')
  await expect(room).toContainText('For Marco')
  expect((await reads(page)).filter((r) => r === TASKS).length).toBeGreaterThan(before)
})

test('served tasks · #todo-<id> opens the brief on that task, again after a reload; one that isn’t there says so', async ({
  page,
}) => {
  await page.goto(`/room.html?people=2&humantasks=seed#todo-${taskId(3)}`)
  const target = page.locator(`#todo-${taskId(3)}`)
  await expect(target).toBeFocused()
  await expect(page.getByRole('button', { name: 'Brief', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.reload()
  await expect(page.locator(`#todo-${taskId(3)}`)).toBeFocused()
  const unknown = '00000000-0000-4000-8000-0000000cffff'
  await page.goto(`/room.html?people=2&humantasks=seed#todo-${unknown}`)
  await expect(page.getByText('The task you opened isn’t available.')).toBeVisible()
  expect(await reads(page)).toContain(`${TASKS}/${unknown}`)
})

/** The report open in the pane, in a call, its first paragraph's passage selected and Task pressed. */
async function startPassageTask(page: Page) {
  await page.goto(`/room.html?call=on&exchange=open&people=3&guest&report=${REPORT}&humantasks=seed`)
  const passage = pane(page).locator('.md p', { hasText: 'The fixture holds.' })
  await expect(passage).toBeVisible()
  await passage.selectText()
  await page.getByRole('toolbar', { name: 'The selected passage' }).getByRole('button', { name: 'Task' }).click()
  const form = pane(page).getByRole('form', { name: 'New task' })
  await expect(form).toBeVisible()
  return form
}

test('served tasks · a passage’s task: its words start empty and are the member’s; the request carries them and the link, never the passage’s words', async ({
  page,
}) => {
  const form = await startPassageTask(page)
  const what = form.getByRole('textbox', { name: 'What needs doing?' })
  await expect(what).toHaveValue('')
  await what.fill('Check it')
  await form.getByRole('combobox', { name: 'For' }).selectOption({ label: 'Me' })
  await form.getByRole('button', { name: 'Create' }).click()
  await expect(form).toHaveCount(0)
  const sent = await lastRequest(page)
  expect(sent.startsWith(`POST ${TASKS} `)).toBe(true)
  const body = record(JSON.parse(sent.slice(`POST ${TASKS} `.length)))
  expect(Object.keys(body).toSorted()).toEqual(['origin', 'ownerId', 'title'])
  expect([body.title, body.ownerId]).toEqual(['Check it', ME])
  const origin = record(body.origin)
  expect(Object.keys(origin).toSorted()).toEqual(['artifactId', 'block', 'count', 'versionId', 'word'])
  expect(origin.artifactId).toBe(REPORT)
  expect([typeof origin.block, typeof origin.word, origin.count]).toEqual(['number', 'number', 3])
  for (const copy of ['fixture holds', 'Fixture report', 'quote', 'sha256']) expect(sent).not.toContain(copy)
  // The report's tab shows it with its version as the link, not the passage's words.
  await pane(page)
    .getByRole('tab', { name: /^Tasks/ })
    .click()
  const made = tabRows(page).filter({ hasText: 'Check it' })
  await expect(made.getByRole('link', { name: 'v1' })).toBeVisible()
  await expect(pane(page).getByRole('list', { name: 'Tasks' })).not.toContainText('“The fixture holds.”')
})

test('served tasks · the report’s tab lists only the tasks whose passage this reader may follow', async ({ page }) => {
  await startPassageTask(page)
  await pane(page).getByRole('button', { name: 'Cancel' }).click()
  await pane(page)
    .getByRole('tab', { name: /^Tasks/ })
    .click()
  await expect(tabRows(page)).toHaveCount(1)
  await expect(tabRows(page).first()).toContainText('Check the March figure')
  expect(await reads(page)).toContain(`/api/v1/artifacts/${REPORT}/tasks`)
})

test('served tasks · an answer in the A17 proposal’s shape (a quote, no revision) is refused by the generated parser', async ({
  page,
}) => {
  await page.goto(`/room.html?call=on&exchange=open&people=3&guest&report=${REPORT}&humantasks=seed&proposedtasks=1`)
  await expect(pane(page).locator('.md p', { hasText: 'The fixture holds.' })).toBeVisible()
  await pane(page)
    .getByRole('tab', { name: /^Tasks/ })
    .click()
  await expect(pane(page).getByRole('alert')).toContainText('Tasks can’t be read now.')
  await page.evaluate(() => window.fixture?.tasksAsProposed(false))
  await pane(page).getByRole('button', { name: 'Try again' }).click()
  await expect(tabRows(page)).toHaveCount(1)
})

/** A row by its exact title (`Later task 6` is not `Later task 60`). */
const titled = (page: Page, title: string) =>
  rows(page).filter({ has: page.locator('.task-text', { hasText: new RegExp(`^${title}$`) }) })

const STALE = 'This task changed meanwhile. It’s shown as it is now.'

/** Sixty tasks newer than the seeded four, so they are past the first page; the address names one of those. */
async function openOffPage(page: Page, id: string) {
  await page.goto(`/room.html?people=2&humantasks=many#todo-${id}`)
  const named = page.locator(`#todo-${id}`)
  await expect(named).toBeFocused()
  return named
}

test('served tasks · R-C5-01: with the project’s pages and one task read, a Claim and a Done that land say so, and nothing throws', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const named = await openOffPage(page, taskId(2))
  const later = titled(page, 'Later task 60')
  await later.getByRole('button', { name: 'Claim' }).click()
  await expect(later).toContainText('For you')
  await expect(later).not.toContainText('Not sent.')
  await named.getByRole('button', { name: 'Done' }).click()
  await expect(named).toContainText('Done by you.')
  expect(errors).toEqual([])
})

test('served tasks · R-C5-02: a Done whose answer is lost, retried after the task moved, keeps its key and the revision first sent', async ({
  page,
}) => {
  await openBrief(page)
  const room = row(page, 'Book the room')
  await page.evaluate(() => window.fixture?.dropNextTaskWrite())
  await room.getByRole('button', { name: 'Done' }).click()
  await expect(room).toContainText('Not confirmed. Try again.')
  const dropped = (await served(page)).find((s) => s.startsWith('task-dropped:')) ?? ''
  expect(dropped).toMatch(
    new RegExp(`^task-dropped:POST ${TASKS}/${taskId(1)}/done \\{"expectedRevision":1\\} key=.+$`),
  )
  const key = dropped.split(' key=')[1]
  // Marco takes it meanwhile, and the feed moves: the row is now at revision 2.
  await page.evaluate(([id, marco]) => window.fixture?.bumpTask(id, marco, true), [taskId(1), MARCO] as const)
  await expect(room).toContainText('For Marco')
  await room.getByRole('button', { name: 'Try again' }).click()
  await expect(room).toContainText(STALE)
  expect(await lastRequest(page)).toBe(`POST ${TASKS}/${taskId(1)}/done {"expectedRevision":1}`)
  expect((await served(page)).filter((s) => s.startsWith('task-key:')).at(-1)).toBe(`task-key:${key}`)
  await expect(room).not.toContainText('Done by you.')
})

test('served tasks · R-C5-03: an off-page task opened by #todo- is read again as the feed moves, and after a stale action; once unreadable it is no longer shown', async ({
  page,
}) => {
  const named = await openOffPage(page, taskId(2))
  await expect(named.getByRole('link', { name: 'v1' })).toBeVisible()
  const one = `${TASKS}/${taskId(2)}`
  const readsOf = async () => (await reads(page)).filter((r) => r === one).length
  const first = await readsOf()
  // Its origin is no longer this reader's to follow; the feed moves.
  await page.evaluate((id) => window.fixture?.withdrawTaskOrigin(id), taskId(2))
  await expect(named).toContainText('The passage it came from isn’t available to you')
  await expect(named.getByRole('link')).toHaveCount(0)
  expect(await readsOf()).toBeGreaterThan(first)
  // Changed meanwhile without the feed moving: its Done answers 409, and it is read again.
  await page.evaluate(([id, marco]) => window.fixture?.bumpTask(id, marco), [taskId(2), MARCO] as const)
  await named.getByRole('button', { name: 'Done' }).click()
  await expect(named).toContainText('For Marco')
  // No longer readable: the task is not shown from what was read before.
  await page.evaluate((id) => window.fixture?.hideTask(id), taskId(2))
  await expect(page.locator(`#todo-${taskId(2)}`)).toHaveCount(0)
  await expect(page.getByText('The task you opened isn’t available.')).toBeVisible()
})

test('served tasks · R-C5-04: an off-page task named, then no task named (the address cleared, or Back), with the brief open: no task is read without an id', async ({
  page,
}) => {
  await page.goto('/room.html?people=2&humantasks=many')
  await expect(page.locator('.room-stage')).toBeVisible()
  // Followed within the page: the address names an off-page task; the brief opens on it, read on its own.
  await page.evaluate((id) => {
    window.location.hash = `#todo-${id}`
  }, taskId(2))
  const named = page.locator(`#todo-${taskId(2)}`)
  await expect(named).toBeFocused()
  // No task named any more, the brief still open: by clearing the address, then by Back.
  await page.evaluate(() => {
    window.location.hash = ''
  })
  await expect(page.locator(`#todo-${taskId(2)}`)).toHaveCount(0)
  await page.goBack()
  await expect(named).toBeFocused()
  await page.goBack()
  await expect(page.locator(`#todo-${taskId(2)}`)).toHaveCount(0)
  // The feed moves meanwhile: still nothing is read without a task id.
  await page.evaluate(() => window.fixture?.withdrawTaskOrigin('00000000-0000-4000-8000-0000000c0003'))
  await expect(brief(page)).toBeVisible()
  await page.waitForTimeout(400)
  expect((await reads(page)).filter((r) => r === `${TASKS}/` || r.startsWith(`${TASKS}/?`))).toEqual([])
})
