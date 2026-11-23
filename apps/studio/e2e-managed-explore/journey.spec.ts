import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test'
import { brief, feedback, mockApi, projectRoute, shore, vessel } from './api-fixture.ts'

async function openBrief(page: Page) {
  await page.locator('.panel-toggles [data-panel="brief"]').click()
  await expect(page.getByText(brief, { exact: true })).toBeVisible()
}

async function resume(page: Page) {
  await openBrief(page)
  await page.getByRole('button', { name: 'Explore with Codex' }).click()
  await page.getByRole('button', { name: 'Resume Explore' }).click()
}

test('the default-off Studio shows its ordinary Brief and performs no Explore reads', async ({ page }) => {
  const calls = await mockApi(page)
  await page.goto(`http://127.0.0.1:5278${projectRoute}`)
  await openBrief(page)
  await expect(page.getByRole('button', { name: 'Explore with Codex' })).toHaveCount(0)
  expect(calls.preflights).toBe(0)
  expect(calls.writes).toEqual([])
})

test('the pilot renders an unavailable preflight without a paid action', async ({ page }) => {
  const calls = await mockApi(page, { ineligible: true })
  await page.goto(projectRoute)
  await openBrief(page)
  await page.getByRole('button', { name: 'Explore with Codex' }).click()
  await expect(page.getByText('Explore is unavailable for this note.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start Explore' })).toHaveCount(0)
  expect(calls.writes).toEqual([])
})

async function compareAndOpen({
  page,
  workspace,
  calls,
  testInfo,
}: {
  page: Page
  workspace: Locator
  calls: Awaited<ReturnType<typeof mockApi>>
  testInfo: TestInfo
}) {
  await workspace.getByRole('button', { name: 'Compare two directions' }).click()
  const directions = workspace.getByRole('region', { name: 'Compare design directions' })
  await expect(directions.getByRole('heading', { name: shore.label })).toBeVisible()
  await expect(directions.getByRole('heading', { name: vessel.label })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('directions.png') })
  await directions.getByRole('button', { name: `Select ${vessel.label}` }).click()
  expect(calls.writes.filter(({ request }) => request['kind'] === 'prototype')).toHaveLength(0)
  await workspace.getByRole('button', { name: 'Build this prototype' }).click()
  await workspace.getByRole('button', { name: 'Open v1 · Latest', exact: true }).click()
}

async function tryV1(workspace: Locator) {
  const frame = workspace.locator('iframe').contentFrame().locator('iframe')
  await expect(frame).toHaveAttribute('sandbox', 'allow-scripts')
  await expect(frame).toHaveAttribute('referrerpolicy', 'no-referrer')
  const v1Document = frame.contentFrame()
  await expect(v1Document.getByRole('button', { name: 'Assign follow-up' })).toBeDisabled()
  await v1Document.getByRole('button', { name: 'Acknowledge exception' }).click()
  await expect(v1Document.getByRole('button', { name: 'Assign follow-up' })).toBeEnabled()
  await v1Document.getByRole('button', { name: 'Assign follow-up' }).click()
  await expect(v1Document.getByRole('status')).toHaveText('Follow-up assigned')
  const denied = await v1Document.locator('body').evaluate(() => {
    try {
      return window.parent.document.title === '' ? 'empty' : 'readable'
    } catch (error: unknown) {
      return error instanceof DOMException ? error.name : 'unexpected'
    }
  })
  expect(denied).toBe('SecurityError')
  return frame
}

async function reviseAndApprove({
  page,
  workspace,
  frame,
  isMobile,
  testInfo,
}: {
  page: Page
  workspace: Locator
  frame: Locator
  isMobile: boolean
  testInfo: TestInfo
}) {
  await workspace.getByRole('textbox', { name: 'Feedback on v1' }).fill(feedback)
  await workspace.getByRole('button', { name: 'Request a change' }).click()
  if (isMobile) await workspace.getByRole('button', { name: 'Back to discussion' }).click()
  await expect(workspace.getByRole('textbox', { name: 'Message Codex' })).toHaveValue(
    'A draft to keep while trying the prototype.',
  )
  await workspace.getByRole('button', { name: 'Open v2 · Latest' }).click()
  const v2Document = frame.contentFrame()
  const explain = v2Document.getByRole('textbox', { name: 'Chief engineer explanation' })
  const submit = v2Document.getByRole('button', { name: 'Submit explanation' })
  await expect(submit).toBeDisabled()
  await explain.fill('   ')
  await expect(submit).toBeDisabled()
  await explain.fill('The vessel was waiting for a berth in heavy weather.')
  await submit.click()
  await expect(v2Document.getByRole('button', { name: 'Assign follow-up' })).toBeEnabled()
  await page.screenshot({ path: testInfo.outputPath('preview-v2.png') })
  await workspace.getByRole('button', { name: 'Approve this version' }).click()
  await expect(workspace.getByText('Approved · v2')).toBeVisible()
  await workspace.getByRole('button', { name: 'Open in Build' }).click()
  await expect(workspace.getByRole('heading', { name: 'Build handoff' })).toBeVisible()
  await expect(workspace.getByText('Use your signed-in Codex subscription for Build.')).toBeVisible()
  await workspace.getByText('Retained source file', { exact: true }).click()
  await workspace.getByText('index.html', { exact: false }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('build-handoff.png') })
}

test('the real room opens and resumes the exact saved brief, prototype and approval', async ({
  page,
  isMobile,
}, testInfo) => {
  const calls = await mockApi(page, { uncertain: true })
  await page.goto(projectRoute)
  await openBrief(page)
  const room = page.getByRole('region', { name: 'Project room' })
  await room.evaluate((stage) => stage.setAttribute('data-mounted-room', 'initial'))
  await page.getByRole('button', { name: 'Explore with Codex' }).click()
  const confirmation = page.getByRole('region', { name: 'Confirm the saved brief' })
  await expect(confirmation.getByText(brief)).toBeVisible()
  await expect(confirmation.getByText('OpenAI API credits', { exact: true })).toBeVisible()
  expect(calls.writes).toEqual([])
  await page.screenshot({ path: testInfo.outputPath('brief.png') })
  await confirmation.getByRole('button', { name: 'Start Explore' }).click()
  const workspace = page.getByRole('complementary', { name: 'Explore workspace' })
  await expect(workspace.getByRole('heading', { name: 'Explore with Codex' })).toBeFocused()
  await expect(room).toHaveAttribute('data-mounted-room', 'initial')
  const message = workspace.getByRole('textbox', { name: 'Message Codex' })
  await message.fill('Keep the first screen focused on the weekly exception.')
  await workspace.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(workspace.getByRole('button', { name: 'Retry same request' })).toBeVisible()
  await page.reload()
  await resume(page)
  await workspace.getByRole('button', { name: 'Retry same request' }).click()
  const textWrites = calls.writes.filter(({ request }) => request['kind'] === 'text')
  expect(textWrites).toHaveLength(2)
  expect(textWrites[0]).toEqual(textWrites[1])
  await expect(workspace.getByText('I’ll keep the weekly exception at the center.')).toHaveCount(1)
  await expect(message).toHaveValue('')
  await message.fill('A draft to keep while trying the prototype.')
  await compareAndOpen({ page, workspace, calls, testInfo })
  const frame = await tryV1(workspace)
  await reviseAndApprove({ page, workspace, frame, isMobile, testInfo })
  const v1Document = frame.contentFrame()
  const v2Document = frame.contentFrame()
  await page.reload()
  await resume(page)
  expect(calls.writes.filter(({ path }) => path.endsWith('/sessions'))).toHaveLength(1)
  await workspace.getByRole('button', { name: 'Open v2 · Latest · Approved' }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('history.png') })
  calls.rejectPermits = true
  await workspace.getByRole('button', { name: 'Open v2 · Latest · Approved' }).click()
  await expect(workspace.getByText('This version’s preview couldn’t be opened.')).toBeVisible()
  await expect(frame).toHaveCount(0)
  calls.rejectPermits = false
  await workspace.getByRole('button', { name: 'Reopen this version' }).click()
  await expect(v2Document.getByRole('textbox', { name: 'Chief engineer explanation' })).toBeVisible()
  if (isMobile) await workspace.getByRole('button', { name: 'Back to discussion' }).click()
  await workspace.getByRole('button', { name: 'Open v1', exact: true }).click()
  await expect(v1Document.getByRole('button', { name: 'Acknowledge exception' })).toBeVisible()
  await expect(workspace.getByText('Approved · v2', { exact: true })).toHaveCount(0)
})

for (const [previewPath, status] of [
  ['missing-', 404],
  ['wrong-hash-', 200],
] as const) {
  test(`a ${previewPath === 'missing-' ? 'missing file' : 'wrong content hash'} keeps approval disabled`, async ({
    page,
  }) => {
    const calls = await mockApi(page, { existingVersions: true, previewPath })
    await page.goto(projectRoute)
    await resume(page)
    const checked = page.waitForResponse(
      (response) =>
        response.request().method() === 'HEAD' && response.url().endsWith(`/synthetic-${previewPath}v1/index.html`),
    )
    await page.getByRole('button', { name: 'Open v1', exact: true }).click()
    const response = await checked
    expect(response.status()).toBe(status)
    expect(response.request().headers()['authorization']).toBeUndefined()
    expect(response.request().headers()['referer']).toBeUndefined()
    await expect(page.getByText('This version’s preview couldn’t be opened.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Approve this version' })).toBeDisabled()
    expect(calls.writes.some(({ path }) => path.endsWith('/approvals'))).toBe(false)
  })
}

test('a response for a version already left cannot enable the current approval', async ({ page, isMobile }) => {
  const firstRequested = Promise.withResolvers<void>()
  const secondRequested = Promise.withResolvers<void>()
  const releaseFirst = Promise.withResolvers<void>()
  const releaseSecond = Promise.withResolvers<void>()
  await mockApi(page, { existingVersions: true })
  // Simulate a network that still delivers the old response after the caller aborts.
  await page.addInitScript(() => {
    const send = window.fetch.bind(window)
    window.fetch = (input, init) => {
      const old = init?.method === 'HEAD' && input instanceof URL && input.pathname.includes('/synthetic-v1/')
      return send(input, old ? { ...init, signal: null } : init)
    }
  })
  const oldPreview = /\/synthetic-v1\/index\.html$/u
  await page.route(/\/synthetic-v[12]\/index\.html$/u, async (route) => {
    if (route.request().method() !== 'HEAD') return route.continue()
    if (oldPreview.test(route.request().url())) {
      firstRequested.resolve()
      await releaseFirst.promise
    } else {
      secondRequested.resolve()
      await releaseSecond.promise
    }
    return route.continue()
  })
  try {
    await page.goto(projectRoute)
    await resume(page)
    await page.getByRole('button', { name: 'Open v1', exact: true }).click()
    await firstRequested.promise
    if (isMobile) await page.getByRole('button', { name: 'Back to discussion' }).click()
    await page.getByRole('button', { name: 'Open v2 · Latest' }).click()
    await secondRequested.promise
    const lateResponse = page.waitForResponse(
      (response) => response.request().method() === 'HEAD' && oldPreview.test(response.url()),
    )
    releaseFirst.resolve()
    expect((await lateResponse).status()).toBe(200)
    await page.evaluate(
      () => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
    )
    const approve = page.getByRole('button', { name: 'Approve this version' })
    await expect(approve).toBeDisabled()
    releaseSecond.resolve()
    await expect(approve).toBeEnabled()
  } finally {
    releaseFirst.resolve()
    releaseSecond.resolve()
  }
})

test('a valid ten-minute grant opens with a slow browser clock and has a local display cap', async ({ page }) => {
  await mockApi(page, { existingVersions: true })
  await page.clock.install({ time: new Date(Date.now() - 30_000) })
  await page.goto(projectRoute)
  await resume(page)
  await page.getByRole('button', { name: 'Open v1', exact: true }).click()
  const approve = page.getByRole('button', { name: 'Approve this version' })
  await expect(approve).toBeEnabled()
  await page.clock.fastForward(10 * 60_000 + 1)
  await expect(page.getByText('The preview expired.')).toBeVisible()
  await expect(approve).toBeDisabled()
  await expect(page.locator('.managed-prototype-frame')).toHaveCount(0)
})
