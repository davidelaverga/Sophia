import { expect, test, type Page } from '@playwright/test'
import { API, memberOf, PROJECT, RUN, seedReport, setMember, subOf, tokenOf } from './support/tasks-served.ts'

// The project's human tasks (A39, D-TASKS) on the REAL served path: the normal Studio (Vite, VITE_SOPHIA_TASKS=1, no
// vision) -> the listening API on its restricted role -> an owned disposable PostgreSQL; synthetic dev-db identities
// (HS256 dev auth, not hosted Auth); no Task response is intercepted. Run with SOPHIA_SERVED_TASKS=1 (see
// playwright.served.config.ts). Each case seeds its own synthetic report and tasks, checks Davide's standing before it
// starts, and puts it back on every exit, so a failed revocation cannot leave the next case on a changed membership.
const paneRows = (page: Page) => page.getByRole('list', { name: 'Tasks' }).getByRole('listitem')
const pill = (page: Page, title: string, name: string | RegExp) =>
  paneRows(page).filter({ hasText: title }).getByRole('button', { name })
const answered = (page: Page, path: RegExp) =>
  page.waitForResponse((r) => path.test(new URL(r.url()).pathname) && r.request().method() !== 'GET', {
    timeout: 15_000,
  })
const davide = () => subOf(tokenOf('Davide'))
const luis = () => subOf(tokenOf('Luis'))

/** Davide is an active editor before the case; whatever it changes is put back after it. */
async function asEditor(run: () => Promise<void>) {
  const before = await memberOf(davide())
  expect(before, 'precondition: Davide an active editor').toEqual({ active: true, role: 'editor' })
  try {
    await run()
  } finally {
    expect(await setMember(davide(), before)).toBe(1)
  }
}

async function makeTask(origin: { artifactId: string; versionId: string }, name: string, ownerId: string | null) {
  const res = await fetch(`${API}/api/v1/projects/${PROJECT}/tasks`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${tokenOf('Luis')}`,
      'content-type': 'application/json',
      'idempotency-key': `served-${RUN}-${name.replaceAll(' ', '-')}`,
    },
    body: JSON.stringify({ title: `${name} ${RUN}`, ownerId, origin: { ...origin, block: 1, word: 0, count: 3 } }),
  })
  expect(res.status, await res.clone().text()).toBe(201)
  const body: unknown = await res.json()
  if (!body || typeof body !== 'object' || !('taskId' in body) || !('revision' in body)) throw new Error('not a task')
  return { taskId: String(body.taskId), revision: Number(body.revision) }
}

/** A field of a JSON object, or undefined. */
const pick = (o: unknown, k: string): unknown =>
  typeof o === 'object' && o !== null ? (Reflect.get(o, k) as unknown) : undefined

/** A task's assignee as the real API answers the project's tasks to Luis. */
async function assigneeOf(taskId: string): Promise<{ owner: string | null; ownerName: string | null }> {
  const res = await fetch(`${API}/api/v1/projects/${PROJECT}/tasks`, {
    headers: { authorization: `Bearer ${tokenOf('Luis')}` },
  })
  expect(res.status).toBe(200)
  const tasks = pick((await res.json()) as unknown, 'tasks')
  const found = (Array.isArray(tasks) ? (tasks as unknown[]) : []).find((t) => pick(t, 'taskId') === taskId)
  if (!found) throw new Error('task not listed')
  const owner = pick(found, 'ownerId') ?? pick(found, 'owner')
  const name = pick(found, 'ownerName')
  return { owner: typeof owner === 'string' ? owner : null, ownerName: typeof name === 'string' ? name : null }
}

async function openReport(page: Page, report: { artifactId: string; versionId: string }) {
  await page.addInitScript(() => sessionStorage.setItem('sophia.dev.identity', 'Davide'))
  await page.goto(`/p/${PROJECT}?report=${report.artifactId}&version=${report.versionId}`)
  await page.getByRole('tab', { name: /Tasks/ }).click({ timeout: 15_000 })
}

test('served tasks · after the report task read’s own refusal, no row, count, origin or action; a read since restores', async ({
  page,
}) => {
  await asEditor(async () => {
    const report = await seedReport(`egret${RUN}p`)
    for (const n of [1, 2]) await makeTask(report, `Report task ${n}`, null)
    await openReport(page, report)
    const tab = page.getByRole('tab', { name: /Tasks/ })
    await expect(paneRows(page)).toHaveCount(2, { timeout: 15_000 })
    expect(await setMember(davide(), { active: false })).toBe(1)
    // The report's own task read set out again: the page regains focus (TanStack refetches its stale reads).
    const denied = page.waitForResponse(
      (r) => new URL(r.url()).pathname === `/api/v1/artifacts/${report.artifactId}/tasks`,
      {
        timeout: 15_000,
      },
    )
    await page.evaluate(() => {
      window.dispatchEvent(new Event('visibilitychange'))
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('focus'))
    })
    const status = (await denied).status()
    // The report task route answers a non-member 422 not_found (unknown or inaccessible, indistinguishable): this
    // reader's own refusal for this read, as 401/403.
    expect([401, 403, 422]).toContain(status)
    await expect(paneRows(page)).toHaveCount(0)
    expect((await tab.count()) ? ((await tab.textContent()) ?? '') : '').not.toContain('2')
    expect(await setMember(davide(), { active: true })).toBe(1)
    await page.reload()
    await page.getByRole('tab', { name: /Tasks/ }).click({ timeout: 15_000 })
    await expect(paneRows(page)).toHaveCount(2, { timeout: 15_000 })
  })
})

test('served tasks · an editor claims, assigns to another, finishes; a stale claim answers 409 and says so', async ({
  page,
}) => {
  await asEditor(async () => {
    const report = await seedReport(`egret${RUN}e`)
    const openTask = await makeTask(report, 'Open task', null)
    await makeTask(report, 'Mine task', davide())
    const luisTask = await makeTask(report, 'Luis task', luis())
    await openReport(page, report)
    await expect(paneRows(page)).toHaveCount(3, { timeout: 15_000 })
    let r = answered(page, /\/owner$/)
    await pill(page, 'Open task', 'Claim').click()
    expect((await r).status()).toBe(200)
    await expect(paneRows(page).filter({ hasText: 'Open task' })).toContainText('you')
    r = answered(page, /\/owner$/)
    await paneRows(page)
      .filter({ hasText: 'Open task' })
      .getByRole('combobox', { name: 'Assign to' })
      .selectOption(luis())
    expect((await r).status()).toBe(200)
    // The assignee as the API holds it now is Luis, and the row names that assignee as the name policy does (a chosen
    // or provider name, else «a member»; never an email), not merely «not you».
    const held = await assigneeOf(openTask.taskId)
    expect(held.owner).toBe(luis())
    await expect(paneRows(page).filter({ hasText: 'Open task' })).toContainText(`For ${held.ownerName ?? 'a member'}`)
    await expect(paneRows(page).filter({ hasText: 'Open task' })).not.toContainText('for you')
    r = answered(page, /\/done$/)
    await pill(page, 'Mine task', 'Done').click()
    expect((await r).status()).toBe(200)
    await expect(paneRows(page).filter({ hasText: 'Mine task' })).toContainText('Done by you.')
    // Stale: Luis releases his task elsewhere (real API, its revision); the page still shows the old revision.
    const rel = await fetch(`${API}/api/v1/projects/${PROJECT}/tasks/${luisTask.taskId}/owner`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${tokenOf('Luis')}`, 'content-type': 'application/json' },
      body: JSON.stringify({ ownerId: null, expectedRevision: luisTask.revision }),
    })
    expect(rel.status).toBeLessThan(300)
    r = answered(page, /\/owner$/)
    await pill(page, 'Luis task', 'Claim').click()
    expect((await r).status()).toBe(409)
    await expect(paneRows(page).filter({ hasText: 'Luis task' })).toContainText('This task changed meanwhile.')
  })
})

test('served tasks · a viewer finishes only a task explicitly theirs: no create, Claim, Release, Assign, or Done on nobody’s or another’s', async ({
  page,
}) => {
  await asEditor(async () => {
    const report = await seedReport(`egret${RUN}v`)
    await makeTask(report, 'Viewer own', davide())
    const nobody = await makeTask(report, 'Nobody task', null)
    await makeTask(report, 'Luis own', luis())
    expect(await setMember(davide(), { role: 'viewer' })).toBe(1)
    await openReport(page, report)
    await expect(paneRows(page)).toHaveCount(3, { timeout: 15_000 })
    const counts = {
      claim: await paneRows(page).getByRole('button', { name: 'Claim' }).count(),
      release: await paneRows(page).getByRole('button', { name: 'Release' }).count(),
      assign: await paneRows(page).getByRole('combobox', { name: 'Assign to' }).count(),
      doneNobody: await pill(page, 'Nobody task', 'Done').count(),
      doneLuis: await pill(page, 'Luis own', 'Done').count(),
      doneOwn: await pill(page, 'Viewer own', 'Done').count(),
      newTask: await page.getByRole('button', { name: 'New task' }).count(),
    }
    expect(counts).toEqual({ claim: 0, release: 0, assign: 0, doneNobody: 0, doneLuis: 0, doneOwn: 1, newTask: 0 })
    const r = answered(page, /\/done$/)
    await pill(page, 'Viewer own', 'Done').click()
    expect((await r).status()).toBe(200)
    await expect(paneRows(page).filter({ hasText: 'Viewer own' })).toContainText('Done by you.')
    // Attempts the UI does not offer, sent to the real API as this viewer (labelled API, not a UI pass).
    const asViewer = { authorization: `Bearer ${tokenOf('Davide')}`, 'content-type': 'application/json' }
    const claim = await fetch(`${API}/api/v1/projects/${PROJECT}/tasks/${nobody.taskId}/owner`, {
      method: 'PUT',
      headers: asViewer,
      body: JSON.stringify({ ownerId: davide(), expectedRevision: nobody.revision }),
    })
    const done = await fetch(`${API}/api/v1/projects/${PROJECT}/tasks/${nobody.taskId}/done`, {
      method: 'POST',
      headers: { ...asViewer, 'idempotency-key': `vd-${RUN}` },
      body: JSON.stringify({ expectedRevision: nobody.revision }),
    })
    const create = await fetch(`${API}/api/v1/projects/${PROJECT}/tasks`, {
      method: 'POST',
      headers: { ...asViewer, 'idempotency-key': `vc-${RUN}` },
      body: JSON.stringify({ title: `Viewer create ${RUN}`, ownerId: null }),
    })
    expect([claim.status, done.status, create.status]).toEqual([403, 403, 403])
  })
})

const created = (page: Page) =>
  page.waitForRequest((r) => r.method() === 'POST' && new URL(r.url()).pathname === `/api/v1/projects/${PROJECT}/tasks`)

test('served tasks · both creation forms offer «Nobody yet», send no owner, and link the exact Markdown version (FND-C51)', async ({
  page,
}) => {
  await asEditor(async () => {
    const report = await seedReport(`heron${RUN}n`)
    // The passage form, made in the report reader from a selected passage.
    await openReport(page, report)
    await page.getByRole('tab', { name: 'Document' }).click()
    await page.locator('.md p', { hasText: 'We walked the north bank at dawn.' }).selectText()
    await page.getByRole('toolbar', { name: 'The selected passage' }).getByRole('button', { name: 'Task' }).click()
    let form = page.getByRole('form', { name: 'New task' })
    await expect(form.getByRole('combobox', { name: 'For' }).locator('option').nth(1)).toHaveText('Nobody yet')
    await expect(form.getByRole('combobox', { name: 'For' })).not.toContainText('Anyone')
    await form.getByRole('textbox', { name: 'What needs doing?' }).fill(`Passage task ${RUN}`)
    await form.getByRole('combobox', { name: 'For' }).selectOption('anyone')
    let sent = created(page)
    await form.getByRole('button', { name: 'Create' }).click()
    const passage: unknown = (await sent).postDataJSON()
    expect(pick(passage, 'ownerId') ?? null).toBeNull()
    expect(pick(pick(passage, 'origin'), 'versionId')).toBe(report.versionId)
    await expect(page.getByText(/Task added for nobody yet/i).first()).toBeVisible()
    // The project brief's form.
    // The project's tasks live under the Brief (StudioShell's BriefWithTasks), not on the bare project page.
    await page.goto(`/p/${PROJECT}`)
    await page.getByRole('button', { name: 'Brief', exact: true }).click({ timeout: 15_000 })
    await page.getByRole('button', { name: 'New task' }).click({ timeout: 15_000 })
    form = page.getByRole('form', { name: 'New task' })
    await expect(form.getByRole('combobox', { name: 'For' }).locator('option').nth(1)).toHaveText('Nobody yet')
    await form.getByRole('textbox', { name: 'What needs doing?' }).fill(`Project task ${RUN}`)
    await form.getByRole('combobox', { name: 'For' }).selectOption('anyone')
    sent = created(page)
    await form.getByRole('button', { name: 'Create' }).click()
    const project: unknown = (await sent).postDataJSON()
    expect(pick(project, 'ownerId') ?? null).toBeNull()
    expect(pick(project, 'origin') ?? null).toBeNull()
    await expect(page.getByText('Task added for nobody yet.')).toBeVisible()
    // The project's list says it too, and the passage task's link is its exact version, which it opens.
    const tasksList = page.getByRole('region', { name: 'Tasks' }).getByRole('listitem')
    await expect(tasksList.filter({ hasText: `Project task ${RUN}` })).toContainText(/nobody yet/i)
    const row = tasksList.filter({ hasText: `Passage task ${RUN}` })
    await expect(row).toContainText(/nobody yet/i)
    const href = await row.getByRole('link').getAttribute('href')
    expect(href).toContain(`version=${report.versionId}`)
    await page.goto(href ?? '')
    expect(new URL(page.url()).searchParams.get('version')).toBe(report.versionId)
    await expect(page.locator('.md p', { hasText: 'We walked the north bank at dawn.' })).toBeVisible()
  })
})

// 4320180800 (C60's admissible case, on the served page): each page of the project's tasks is its own read, and a task
// finished between them comes open on page 1 and done on page 2. The Brief's list shows it once. SYNTHETIC: the page's
// fetch answers the project's task list with those two pages (strict A39 shape); everything else is the real API.
test('served tasks · a task read open on page 1 and done on page 2 is one row (4320180800)', async ({ page }) => {
  const by = davide()
  await page.addInitScript(
    ({ project, author }) => {
      const row = (taskId: string, title: string, done: boolean, revision: number) => ({
        taskId,
        projectId: project,
        title,
        ownerId: null,
        ownerName: null,
        state: done ? 'done' : 'open',
        revision,
        createdBy: author,
        createdByName: null,
        createdAt: '2026-10-20T00:00:00.000Z',
        doneBy: done ? author : null,
        doneByName: null,
        doneAt: done ? '2026-10-20T00:01:00.000Z' : null,
        origin: null,
      })
      const moving = '00000000-0000-4000-8000-00000000f0a1'
      const first = {
        tasks: [
          row(moving, 'Dedup moving task', false, 1),
          row('00000000-0000-4000-8000-00000000f0a2', 'Dedup other', false, 1),
        ],
        next: 'MQ',
      }
      const second = { tasks: [row(moving, 'Dedup moving task', true, 2)], next: null }
      const wrap =
        (f: typeof fetch): typeof fetch =>
        (input, init) => {
          const url = new URL(input instanceof Request ? input.url : String(input), location.href)
          const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
          if (method !== 'GET' || url.pathname !== `/api/v1/projects/${project}/tasks`) return f(input, init)
          return Promise.resolve(Response.json(url.searchParams.get('cursor') ? second : first))
        }
      let current = wrap(window.fetch.bind(window))
      Object.defineProperty(window, 'fetch', {
        configurable: true,
        get: () => current,
        set: (f: typeof fetch) => (current = wrap(f)),
      })
    },
    { project: PROJECT, author: by },
  )
  await page.addInitScript(() => sessionStorage.setItem('sophia.dev.identity', 'Davide'))
  await page.goto(`/p/${PROJECT}`)
  await page.getByRole('button', { name: 'Brief', exact: true }).click({ timeout: 15_000 })
  const rows = page.getByRole('list', { name: 'Project tasks' }).getByRole('listitem')
  await expect(rows.filter({ hasText: 'Dedup other' })).toHaveCount(1, { timeout: 15_000 })
  await page.getByRole('button', { name: 'More tasks' }).click()
  await expect(page.getByRole('button', { name: 'More tasks' })).toHaveCount(0)
  await expect(rows.filter({ hasText: 'Dedup moving task' })).toHaveCount(1)
  await expect(rows).toHaveCount(2)
})
