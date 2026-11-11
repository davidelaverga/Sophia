import { expect, test, type Locator, type Page } from '@playwright/test'

// INC01-DES-001: what a resource's sheet promises of its host and its controls, on the labelled simulated fixture page
// (fixtures/resources.html). A host seen online is not a ready tool; a control is said by its route's support, in
// words; one sent is a request until its runtime confirms it; only the owner sends. The fixture's service answers as
// its query says (`settle=confirmed|unknown`, `admission=lost`, fixtures/work-live.ts). Nothing here reaches a tool.

test.use({ timezoneId: 'UTC' })

const PAGE = '/resources.html'
const grid = (page: Page) => page.getByRole('list', { name: 'Resources' })
const tile = (page: Page, name: string) => grid(page).getByRole('button', { name, exact: true })
async function open(page: Page, name: string) {
  await tile(page, name).click()
  const sheet = page.getByRole('dialog', { name })
  await expect(sheet).toBeVisible()
  return sheet
}

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => window.resourcesFixture?.unexpected ?? []), 'requests the panel made').toEqual([])
})

test('controls · the owner is told a control is a request, sent from Act; a teammate that only the owner sends', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide`)
  const own = await open(page, 'Davide · Codex')
  await expect(own.locator('.resource-controls-note')).toHaveText(
    'Each is a request until its runtime confirms it. Sent from a session’s Act.',
  )
  await expect(own.getByRole('button', { name: 'Act' })).toHaveCount(1)
  await page.goto(`${PAGE}?viewer=luis`)
  const theirs = await open(page, 'Davide · Codex')
  await expect(theirs.locator('.resource-controls-note')).toHaveText(
    'Each is a request until its runtime confirms it. Only Davide can send them.',
  )
  await expect(theirs.getByRole('button', { name: 'Act' })).toHaveCount(0) // seen, never offered
  await expect(theirs.getByRole('list', { name: 'Verified for this connection', exact: true })).toBeVisible() // the same route, said alike
})

test('host · unknown, offline or online, it is said as observed, and readiness is never implied', async ({ page }) => {
  await page.goto(`${PAGE}?viewer=luis`)
  const unknown = await open(page, 'Luis · Claude Code')
  await expect(unknown.locator('.resource-host')).toContainText('Host state unknown · observed 3 h ago')
  await expect(unknown.getByText('Sign-in and readiness not reported')).toBeVisible()
  // Nothing qualified: one group, and its owner is told nothing can be sent, with no Act anywhere.
  await expect(unknown.locator('.control-group dt')).toHaveText(['Not verified for this connection yet'])
  await expect(unknown.locator('.resource-controls-note')).toHaveText('None can be sent from here yet.')
  await expect(unknown.getByRole('button', { name: 'Act' })).toHaveCount(0)
  await page.goto(`${PAGE}?viewer=davide&more=1`)
  await expect(tile(page, 'Davide · Grok')).toContainText('Host offline · 1 day')
  const offline = await open(page, 'Davide · Grok')
  await expect(offline.locator('.resource-host')).toContainText('Host offline · observed 1 day ago')
  await expect(
    offline.getByRole('list', { name: 'Not supported by this connection' }).getByRole('listitem'),
  ).toHaveText(['Permissions'])
  await page.keyboard.press('Escape')
  const online = await open(page, 'Luis · Gemini CLI')
  await expect(online.locator('.resource-host')).toContainText('Host online · observed 4 min ago')
  await expect(online.getByText('Sign-in and readiness not reported')).toBeVisible() // online is not ready
})

test('stop · by keys alone: requested is said, never stopped, until its runtime confirms; Escape returns to its tile', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide`)
  const codex = tile(page, 'Davide · Codex')
  await codex.focus()
  await page.keyboard.press('Enter')
  const sheet = page.getByRole('dialog', { name: 'Davide · Codex' })
  await expect(sheet).toBeVisible()
  const act = sheet.getByRole('button', { name: 'Act' })
  await act.focus()
  await page.keyboard.press('Enter')
  await expect(act).toHaveAttribute('aria-expanded', 'true')
  const stop = sheet.getByRole('button', { name: 'Stop', exact: true })
  await stop.focus()
  await page.keyboard.press('Enter') // asks first
  await expect(sheet.getByText('Running actions may need time to stop.')).toBeVisible()
  await sheet.getByRole('button', { name: 'Stop', exact: true }).last().focus()
  await page.keyboard.press('Enter')
  const status = sheet.locator('.session-acts [role="status"]')
  await expect(status).toContainText('Stop requested; waiting for the runtime to confirm.')
  await page.waitForTimeout(3500) // past every receipt the fixture gives without a settlement
  await expect(status.locator('p')).not.toContainText('Stopped') // the words; its third step's label stays unreached
  await expect(status.locator('li[data-reached]')).toHaveText(['Recorded', 'Delivered']) // not the third, Stopped
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  await expect(codex).toBeFocused()
})

test('stop · an effect the runtime can’t confirm stays unconfirmed; one it confirms is said as settled', async ({
  page,
}) => {
  for (const [settle, said] of [
    ['unknown', 'Stop requested. The runtime’s state is not confirmed yet.'],
    ['confirmed', 'Stopped. Completed work is kept.'],
  ] as const) {
    await page.goto(`${PAGE}?viewer=davide&settle=${settle}`)
    const sheet = await open(page, 'Davide · Codex')
    await sheet.getByRole('button', { name: 'Act' }).click()
    await sheet.getByRole('button', { name: 'Stop', exact: true }).click()
    await sheet.getByRole('button', { name: 'Stop', exact: true }).last().click()
    await expect(sheet.locator('.session-acts [role="status"]')).toContainText(said)
  }
})

test('hold · settled only once its runtime confirms it, said as held and nothing more: no allowance, cost or work', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&settle=confirmed`)
  const sheet = await open(page, 'Davide · Codex')
  await sheet.getByRole('button', { name: 'Act' }).click()
  await sheet.getByRole('button', { name: 'Hold', exact: true }).click()
  const status = sheet.locator('.session-acts [role="status"]')
  // Requested first, while the fixture's runtime has delivered it but not yet confirmed it.
  await expect(status.locator('p')).toHaveText('Hold requested; waiting for the runtime to confirm.')
  await expect(status.locator('li[data-reached]')).toHaveText(['Recorded', 'Delivered'])
  await expect(status.locator('p')).toHaveText('Held. Its runtime confirmed the hold.')
  await expect(status.locator('li[data-reached]')).toHaveText(['Recorded', 'Delivered', 'Held'])
  await expect(status).not.toContainText(/allowance|retained|quota|cost/)
  // r3 (Davide's iteration): held work isn't offered Hold again, only what its state still allows.
  await expect(sheet.getByRole('button', { name: 'Hold', exact: true })).toHaveCount(0)
  await expect(sheet.getByRole('button', { name: 'Stop', exact: true })).toBeVisible()
})

test('hold · a lost reply is unknown, offered again with the same request, and never said as held', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&admission=lost`)
  const sheet = await open(page, 'Davide · Codex')
  await sheet.getByRole('button', { name: 'Act' }).click()
  await sheet.getByRole('button', { name: 'Hold', exact: true }).click()
  const status = sheet.locator('.session-acts [role="status"]')
  await expect(status).toContainText('Not confirmed whether it was recorded.')
  await expect(status.locator('li[data-reached]')).toHaveCount(0)
  await status.getByRole('button', { name: 'Try again' }).click()
  await expect(status).toContainText('Hold requested; waiting for the runtime to confirm.')
  const operations = await page.evaluate(() => (window.resourcesFixture?.commands ?? []).map((c) => c.operation_id))
  expect(new Set(operations).size, 'the retry reuses its request').toBe(1)
})

test('@phone · the host, its readiness and the controls fit the sheet; the tile’s host label keeps one line', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&more=1`)
  const host = tile(page, 'Davide · Grok').locator('.resource-tile-host')
  const box = await host.boundingBox()
  expect(box?.height ?? 0, 'one line').toBeLessThan(24)
  const sheet = await open(page, 'Davide · Codex')
  await sheet.locator('.resource-controls-note').scrollIntoViewIfNeeded()
  const width = await sheet.evaluate((s) => s.getBoundingClientRect().right)
  for (const part of ['.resource-host', '.resource-readiness', '.resource-controls', '.resource-controls-note']) {
    const right = await sheet.locator(part).evaluate((e) => e.getBoundingClientRect().right)
    expect(right, `${part} stays inside the sheet`).toBeLessThanOrEqual(width)
  }
  await expect(sheet.locator('.resource-controls-note')).toBeVisible()
})

// ---- INC01-DES-001 r3 (Davide's iteration pack): held work, its next action, and readiness on request. ----

/** Davide's Codex reviewer, its Hold pressed from Act; Act closed again unless `keepOpen`. */
async function holdCodex(page: Page, query: string, keepOpen = false) {
  await page.goto(`${PAGE}?viewer=davide${query}`)
  const sheet = await open(page, 'Davide · Codex')
  const act = sheet.getByRole('button', { name: 'Act' })
  await act.click()
  await sheet.getByRole('button', { name: 'Hold', exact: true }).click()
  if (!keepOpen) await act.click()
  return sheet
}
const row = (sheet: Locator) => sheet.locator('.resource-session').filter({ hasText: 'Review the report pane' })
const sent = (page: Page) => page.evaluate(() => (window.resourcesFixture?.commands ?? []).map((c) => c.kind))

test('r3 · R3-01 · confirmed held: its row says Held with Act closed, offers no Hold, and Open work reaches that work held', async ({
  page,
}) => {
  const sheet = await holdCodex(page, '&settle=confirmed')
  const reviewer = row(sheet)
  await expect(reviewer.locator('.resource-work .chip')).toHaveText('Held') // the row itself, Act closed
  await expect(reviewer.locator('.work-control')).toContainText('Its runtime confirmed the hold.')
  await expect(reviewer.locator('.resource-work')).not.toContainText('Working')
  await reviewer.getByRole('button', { name: 'Act' }).click()
  await expect(reviewer.getByRole('button', { name: 'Hold', exact: true })).toHaveCount(0)
  await expect(reviewer.getByRole('button', { name: /^Resume/ })).toHaveCount(0) // no qualified Resume route here
  await expect(reviewer.getByPlaceholder('Guidance for its session…')).toHaveCount(0) // held work takes no new turn
  expect(await sent(page)).toEqual(['hold'])
  // Open work: the same work in Tasks, as its service observes it held there too; opening sends nothing.
  await reviewer.getByRole('button', { name: 'Open work: Review the report pane' }).click()
  await expect(page).toHaveURL(/work\.html\?.*#task-work-2$/)
  // Carried as structure (r3 repair 2): held as observed, and the confirmed Hold itself, its operation unchanged.
  const carried = new URL(page.url()).searchParams
  expect([carried.get('viewer'), carried.get('held')]).toEqual(['davide', 'work-2'])
  const retained = carried.get('retained') ?? ''
  expect(retained.match(/"operation_id"/g)).toHaveLength(1) // one control, carried as itself
  expect(retained).toContain('"kind":"hold"')
  const task = page.getByRole('dialog', { name: /Review the report pane/ })
  await expect(task).toBeVisible()
  await expect(page.locator('[data-task="work-2"] .task-chip')).toHaveText('Held')
  await expect(task.getByRole('button', { name: /^Hold/ })).toHaveCount(0)
  expect(await page.evaluate(() => window.workFixture?.commands ?? []), 'nothing sent on arrival').toEqual([])
})

test('r3 · R3-02 · a Hold on its way: requested, never Held or Resume, and no second Hold to press', async ({
  page,
}) => {
  const sheet = await holdCodex(page, '', true)
  const reviewer = row(sheet)
  await expect(reviewer.locator('.resource-work .chip')).toHaveText('Hold requested')
  await expect(reviewer.locator('.work-control')).toContainText('Waiting for the runtime to confirm.')
  await expect(reviewer.getByRole('button', { name: 'Hold', exact: true })).toHaveCount(0) // no repeat gesture
  await page.waitForTimeout(3500) // past every receipt the fixture gives without a settlement
  await expect(reviewer.locator('.resource-work .chip')).toHaveText('Hold requested')
  await expect(reviewer).not.toContainText(/\bHeld\b|Resume/)
  expect(await sent(page)).toEqual(['hold']) // one operation
})

test('r3 · R3-03 · a lost reply: Hold not confirmed, Try again keeps its operation, and the row never says Held', async ({
  page,
}) => {
  const sheet = await holdCodex(page, '&admission=lost', true)
  const reviewer = row(sheet)
  await expect(reviewer.locator('.resource-work .chip')).toHaveText('Hold not confirmed')
  await expect(reviewer.locator('.work-control')).toContainText('The existing request is still followed.')
  await expect(reviewer.getByRole('button', { name: 'Hold', exact: true })).toHaveCount(0)
  await reviewer.getByRole('button', { name: 'Try again' }).click() // the existing request, from its receipt line
  await expect(reviewer.locator('.resource-work .chip')).toHaveText('Hold requested')
  const ops = await page.evaluate(() => (window.resourcesFixture?.commands ?? []).map((c) => c.operation_id))
  expect(new Set(ops).size, 'the same operation, never a new one').toBe(1)
})

test('r3 · a Stop on its way is said so; once its runtime confirms it, the stopped generation offers nothing', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&settle=confirmed`)
  const sheet = await open(page, 'Davide · Codex')
  const reviewer = row(sheet)
  await reviewer.getByRole('button', { name: 'Act' }).click()
  await reviewer.getByRole('button', { name: 'Stop', exact: true }).click()
  await reviewer.getByRole('button', { name: 'Stop', exact: true }).last().click()
  await expect(reviewer.locator('.resource-work .chip')).toHaveText('Stop requested')
  await expect(reviewer.locator('.resource-work .chip')).toHaveText('Stopped')
  await expect(reviewer.locator('.work-control')).toContainText('Its runtime confirmed the stop.')
  await expect(reviewer.locator('.control-row')).toHaveCount(0)
  expect(await sent(page)).toEqual(['stop'])
})

test('r3 · R3-05 · readiness on request: the host, the tool’s sign-in and its operations, apart; nothing claimed ready', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide`)
  const sheet = await open(page, 'Davide · Codex')
  const toggle = sheet.getByRole('button', { name: 'Readiness details' })
  const details = sheet.locator('.readiness-details')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(details).toBeHidden()
  await toggle.focus()
  await page.keyboard.press('Enter') // by keys alone
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(details.locator('dt')).toHaveText(['Host', 'Codex sign-in', 'Operations for this connection'])
  await expect(details.locator('dd')).toHaveText(['Online · observed 2 min ago', 'Not reported', 'Not reported'])
  await expect(sheet).not.toContainText(/\bReady\b|Signed in/)
  await page.keyboard.press('Escape')
  await expect(tile(page, 'Davide · Codex')).toBeFocused()
})

test('r3 · R3-07 · a teammate sees the work’s view only: no control state, no Act, no Open work of the owner’s', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=luis&settle=confirmed`)
  const sheet = await open(page, 'Davide · Codex')
  const reviewer = row(sheet)
  await expect(reviewer.locator('.resource-work .chip')).toHaveText('Working')
  await expect(reviewer.getByRole('button', { name: 'Act' })).toHaveCount(0)
  await expect(reviewer.locator('.work-control-live')).toHaveCount(0)
  await expect(reviewer.getByRole('button', { name: /^Open work/ })).toHaveCount(0)
})

test('r3 · R3-09 · R3-10 · held, by keys alone: Tab reaches Open work and Enter opens the work; nothing is sent', async ({
  page,
}) => {
  const sheet = await holdCodex(page, '&settle=confirmed')
  const reviewer = row(sheet)
  await expect(reviewer.locator('.resource-work .chip')).toHaveText('Held')
  const act = reviewer.getByRole('button', { name: 'Act' })
  await act.focus()
  const openWork = reviewer.getByRole('button', { name: 'Open work: Review the report pane' })
  for (let i = 0; i < 4 && !(await openWork.evaluate((b) => b === document.activeElement)); i++) {
    await page.keyboard.press('Tab')
  }
  await expect(openWork).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#task-work-2$/)
  expect(await page.evaluate(() => window.workFixture?.commands ?? [])).toEqual([])
})

test('@phone · r3 · held work at a phone’s width: status, sentence and Open work inside the sheet, a touch target each', async ({
  page,
}) => {
  const sheet = await holdCodex(page, '&settle=confirmed')
  const reviewer = row(sheet)
  await expect(reviewer.locator('.resource-work .chip')).toHaveText('Held')
  const openWork = reviewer.getByRole('button', { name: 'Open work: Review the report pane' })
  await openWork.scrollIntoViewIfNeeded()
  const edge = await sheet.evaluate((s) => s.getBoundingClientRect().right)
  for (const part of [reviewer.locator('.resource-work'), reviewer.locator('.work-control'), openWork]) {
    expect(await part.evaluate((e) => e.getBoundingClientRect().right)).toBeLessThanOrEqual(edge)
  }
  expect((await openWork.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(40)
  const toggle = sheet.getByRole('button', { name: 'Readiness details' })
  await toggle.click()
  await expect(sheet.locator('.readiness-details dd').first()).toBeVisible()
})

// ---- r3 (coordinator's ruling on C01-R16): a control in play fences new guidance to that exact work, nothing wider. ----

/** Davide's Claude Code worker (its route takes guidance), Act open. */
async function claudeWorker(page: Page, query: string) {
  await page.goto(`${PAGE}?viewer=davide${query}`)
  const sheet = await open(page, 'Davide · Claude Code')
  const worker = sheet.locator('.resource-session').filter({ hasText: 'Implement the PDF retry' })
  await worker.getByRole('button', { name: 'Act' }).click()
  return { sheet, worker }
}

test('r3 · a Stop on its way fences new guidance to that work; tried again, it is the same Stop; other work keeps its own', async ({
  page,
}) => {
  const { worker } = await claudeWorker(page, '&admission=lost')
  const guidance = worker.getByRole('textbox', { name: 'Guidance for its session' })
  await expect(guidance).toBeVisible()
  await worker.getByRole('button', { name: 'Stop', exact: true }).click()
  await worker.getByRole('group', { name: 'Stop' }).getByRole('button', { name: 'Stop' }).click()
  await expect(worker.locator('.resource-work .chip')).toHaveText('Stop not confirmed')
  await expect(guidance).toHaveCount(0)
  await expect(worker.locator('.session-acts .act-note')).toHaveText('No guidance while its Stop is under way.')
  // The safety Stop stays: pressed again, and tried again from its line, it is the one operation.
  await worker.locator('.act-steps').getByRole('button', { name: 'Try again' }).click()
  await expect(worker.locator('.resource-work .chip')).toHaveText('Stop requested')
  await worker.getByRole('button', { name: 'Stop', exact: true }).click()
  await worker.getByRole('group', { name: 'Stop' }).getByRole('button', { name: 'Stop' }).click()
  const stops = await page.evaluate(() =>
    (window.resourcesFixture?.commands ?? []).map((c) => [c.kind, c.operation_id]),
  )
  expect(stops.map(([kind]) => kind)).toEqual(['stop', 'stop', 'stop'])
  expect(new Set(stops.map(([, op]) => op)).size, 'one Stop operation, sent again, never a second').toBe(1)
  // Not resource-wide, nor global: Davide's Codex reviewer, other work, keeps its own controls.
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  const codex = await open(page, 'Davide · Codex')
  const reviewer = codex.locator('.resource-session').filter({ hasText: 'Review the report pane' })
  await reviewer.getByRole('button', { name: 'Act' }).click()
  await expect(reviewer.getByRole('button', { name: 'Hold', exact: true })).toBeVisible()
  await expect(reviewer.locator('.resource-work .chip')).toHaveText('Working')
})

test('r3 · held work takes no guidance: a draft written before the Hold is said kept on this page, and nothing is sent', async ({
  page,
}) => {
  const { worker } = await claudeWorker(page, '&settle=confirmed')
  await worker.getByRole('textbox', { name: 'Guidance for its session' }).fill('Use the staging fixtures')
  await worker.getByRole('button', { name: 'Hold', exact: true }).click()
  await expect(worker.locator('.resource-work .chip')).toHaveText('Held')
  await expect(worker.getByRole('textbox', { name: 'Guidance for its session' })).toHaveCount(0)
  await expect(worker.locator('.session-acts .act-note')).toHaveText(
    'No guidance to held work: it would start a new turn. What you wrote is kept on this page; nothing more is sent from it.',
  )
  expect(await page.evaluate(() => (window.resourcesFixture?.commands ?? []).map((c) => c.kind))).toEqual(['hold'])
})

// ---- r3 repair 1 · F04: a control that leaves under the focus hands it to its status, inside the same sheet. ----

test('r3-repair · F04 · Hold by keys: the focus stays in the sheet when Hold leaves, Tab goes on, Escape returns to the tile', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide`)
  const sheet = await open(page, 'Davide · Codex')
  const reviewer = row(sheet)
  await reviewer.getByRole('button', { name: 'Act' }).click()
  await reviewer.getByRole('button', { name: 'Hold', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(reviewer.getByRole('button', { name: 'Hold', exact: true })).toHaveCount(0)
  const inSheet = () =>
    sheet.evaluate((s) => s.contains(document.activeElement) && document.activeElement !== document.body)
  await expect.poll(inSheet).toBe(true)
  await expect(reviewer.locator('.session-acts [role="status"]')).toBeFocused()
  await page.keyboard.press('Tab')
  expect(await inSheet()).toBe(true)
  await page.keyboard.press('Escape')
  await expect(tile(page, 'Davide · Codex')).toBeFocused()
})

test('r3-repair · F04 · a Stop settled by keys: the focus moves to its status, never to the page; Escape returns', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&settle=confirmed`)
  const sheet = await open(page, 'Davide · Codex')
  const reviewer = row(sheet)
  await reviewer.getByRole('button', { name: 'Act' }).click()
  await reviewer.getByRole('button', { name: 'Stop', exact: true }).focus()
  await page.keyboard.press('Enter') // asks first
  await reviewer.getByRole('group', { name: 'Stop' }).getByRole('button', { name: 'Stop' }).focus()
  await page.keyboard.press('Enter')
  await expect(reviewer.locator('.resource-work .chip')).toHaveText('Stopped')
  await expect(reviewer.locator('.control-row')).toHaveCount(0)
  await expect(reviewer.locator('.session-acts [role="status"]')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(tile(page, 'Davide · Codex')).toBeFocused()
})

test('@phone · r3-repair · F04 · Hold by touch keys at a phone’s width keeps the focus in the sheet', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide`)
  const sheet = await open(page, 'Davide · Codex')
  const reviewer = row(sheet)
  await reviewer.getByRole('button', { name: 'Act' }).click()
  await reviewer.getByRole('button', { name: 'Hold', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(reviewer.locator('.session-acts [role="status"]')).toBeFocused()
})

// ---- r3 repair · R3-01/R3-03 (bounded): rebuilt from what the service retained, after a reload or a navigation. ----

test('r3-repair · held, pending or unknown rebuilt from the seeded record after reload and navigation; nothing sent', async ({
  page,
}) => {
  test.setTimeout(120_000) // three seeds, each opened, reloaded and navigated back to
  for (const [seed, status] of [
    ['held', 'Held'],
    ['pending', 'Hold requested'],
    ['unknown', 'Hold not confirmed'],
  ] as const) {
    await page.goto(`${PAGE}?viewer=davide&seed=${seed}`)
    for (const pass of ['opened', 'reloaded', 'back again']) {
      if (pass === 'reloaded') await page.reload()
      if (pass === 'back again') {
        await page.goto('/work.html?viewer=davide')
        await page.goBack()
      }
      const sheet = await open(page, 'Davide · Codex')
      const reviewer = row(sheet)
      await expect(reviewer.locator('.resource-work .chip'), `${seed} ${pass}`).toHaveText(status)
      await reviewer.getByRole('button', { name: 'Act' }).click()
      await expect(reviewer.getByRole('button', { name: 'Hold', exact: true })).toHaveCount(0)
      expect(await page.evaluate(() => window.resourcesFixture?.commands ?? []), `${seed} ${pass}`).toEqual([])
      await page.keyboard.press('Escape')
    }
  }
})

// ---- r3 repair · P1: readiness said from the facts given (simulated projection, `readiness=1`). ----

test('r3-repair · R3-05 · readiness: ready only with every fact current; sign-in, a stale reading, offline and no report said apart', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&readiness=1&more=1`)
  const said = (name: string) => tile(page, name).locator('.resource-tile-readiness')
  await expect(said('Davide · Codex')).toHaveText('Ready for repository analysis')
  await expect(said('Davide · Claude Code')).toHaveText('Claude Code sign-in needed')
  await expect(said('Luis · Gemini CLI')).toHaveText(/^Readiness last observed \d+ min ago$/)
  await expect(said('Davide · Grok')).toHaveText('Waits for its host to reconnect') // its head says it is offline
  await expect(said('Luis · Claude Code')).toHaveCount(0) // reports none: the tile says only its host
  const codex = await open(page, 'Davide · Codex')
  await expect(codex.locator('.resource-readiness')).toContainText(
    'Ready for repository analysisCode changes: not verified for this connection yet',
  )
  await codex.getByRole('button', { name: 'Readiness details' }).click()
  await expect(codex.locator('.readiness-details dt')).toHaveText([
    'Host',
    'Codex sign-in',
    'Repository analysis',
    'Code changes',
    'Observed',
  ])
  await expect(codex.locator('.readiness-details dd').last()).toContainText('simulated fixture')
  await expect(codex.getByRole('button', { name: /sign in|reconnect/i })).toHaveCount(0) // no press without a way
  await page.keyboard.press('Escape')
  const claude = await open(page, 'Davide · Claude Code')
  await expect(claude.locator('.resource-readiness')).toContainText('Its owner signs in on its host.')
})

test('r3-repair · R3-06 · a used-up window holds a ready connection: it waits for capacity, its reset said', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&readiness=1&spent=1`)
  await expect(tile(page, 'Davide · Codex').locator('.resource-tile-readiness')).toHaveText(/^Waiting for capacity: /)
})

// ---- r3 repair 3 (UI1164-F08): a used-up count waits like a used-up window, in the tile and the sheet alike. ----

test('r3-repair3 · F08 · credits or tokens at zero wait for capacity, whatever window is beside them; the rest read as before', async ({
  page,
}) => {
  test.setTimeout(120_000) // thirteen readings, each in its tile and its sheet
  type Said = { tone: string; line: string; more: string | null }
  const CREDITS: Said = { tone: 'wait', line: 'Waiting for capacity: Daily requests window', more: 'resets in 9 h' }
  const READY: Said = {
    tone: 'ready',
    line: 'Ready for repository analysis',
    more: 'Code changes: not verified for this connection yet',
  }
  const cases: [string, Said][] = [
    ['count=credits0', CREDITS],
    ['count=tokens0', { tone: 'wait', line: 'Waiting for capacity: daily tokens window', more: null }],
    ['count=percent-credits0', CREDITS],
    ['count=credits0-percent', CREDITS],
    ['count=tokens-credits0', CREDITS],
    ['count=credits0-tokens', CREDITS],
    ['spent=1', { tone: 'wait', line: 'Waiting for capacity: Spend limit window', more: 'resets in 10 days' }], // as before
    ['count=credits', READY],
    ['count=partial', READY],
    ['count=unknown', READY],
    ['count=due', READY],
    ['count=credits0&stale=1', READY],
    ['', READY],
  ]
  for (const [reading, { tone, line, more }] of cases) {
    await page.goto(`${PAGE}?viewer=davide&readiness=1&${reading}`)
    const said = tile(page, 'Davide · Codex').locator('.resource-tile-readiness')
    await expect(said, `${reading}: tile`).toHaveText(line)
    await expect(said, `${reading}: tile`).toHaveAttribute('data-tone', tone)
    const sheet = await open(page, 'Davide · Codex')
    const summary = sheet.locator('.resource-readiness')
    await expect(summary, `${reading}: sheet`).toHaveAttribute('data-tone', tone)
    await expect(summary.locator('.readiness-line'), `${reading}: sheet`).toHaveText(line)
    const after = summary.locator('.readiness-more')
    await (more === null ? expect(after, reading).toHaveCount(0) : expect(after, reading).toHaveText(more))
    await expect(sheet.getByRole('button', { name: /sign in|reconnect|top up|buy/i })).toHaveCount(0) // no press
  }
})

// ---- r3 repair 4 (UI85C4-F09): a reset that isn't an instant is an unknown reset, in the tile and the sheet alike. ----

const INVENTED = /NaN|Invalid Date|Infinity|undefined/
const UNKNOWN_RESETS: [string, string, string | null][] = [
  ['count=credits0-badreset', 'Waiting for capacity: Daily requests window', null],
  ['count=tokens0-emptyreset', 'Waiting for capacity: daily tokens window', null],
  ['count=percent100-badreset', 'Waiting for capacity: 5-hour window', null],
  ['count=spend-badreset', 'Waiting for capacity: Spend limit window', null],
  ['count=badreset-percent100', 'Waiting for capacity: Daily requests window', null], // unknown holds longest
  ['count=credits-badreset', 'Ready for repository analysis', 'Code changes: not verified for this connection yet'],
]

/** A tile and its sheet say the line, its tooltip and `more` as given, and no made-up time anywhere in either. */
async function saysNoInventedTime(page: Page, reading: string, name: string, line: string, more: string | null) {
  await page.goto(`${PAGE}?viewer=davide&readiness=1&${reading}`)
  const card = tile(page, name)
  const said = card.locator('.resource-tile-readiness')
  await expect(said, `${reading}: tile`).toHaveText(line)
  await expect(said, `${reading}: tooltip`).toHaveAttribute('title', more ?? line)
  expect(await card.innerText(), `${reading}: tile`).not.toMatch(INVENTED)
  const sheet = await open(page, name)
  const summary = sheet.locator('.resource-readiness')
  await expect(summary.locator('.readiness-line'), `${reading}: sheet`).toHaveText(line)
  const after = summary.locator('.readiness-more')
  await (more === null ? expect(after, reading).toHaveCount(0) : expect(after, reading).toHaveText(more))
  expect(await sheet.innerText(), `${reading}: sheet`).not.toMatch(INVENTED)
  await page.keyboard.press('Escape')
}

test('r3-repair4 · F09 · a used-up window whose reset isn’t an instant waits, its reset unsaid, never NaN', async ({
  page,
}) => {
  test.setTimeout(120_000) // six readings and Claude Code's, each in its tile and its sheet
  for (const [reading, line, more] of UNKNOWN_RESETS)
    await saysNoInventedTime(page, reading, 'Davide · Codex', line, more)
  // A paced window (Claude Code's 5-hour) whose reset isn't an instant: no reset said, no pace made up.
  await saysNoInventedTime(
    page,
    'reset=bad',
    'Davide · Claude Code',
    'Claude Code sign-in needed',
    'Its owner signs in on its host.',
  )
  await expect(page.getByRole('dialog', { name: 'Davide · Claude Code' })).toHaveCount(0)
  await open(page, 'Davide · Claude Code')
  await expect(page.getByText(/At this pace/)).toHaveCount(0)
})

test('@phone · r3-repair4 · F09 · at a phone’s width, the tile and sheet say no made-up reset', async ({ page }) => {
  test.setTimeout(90_000)
  for (const [reading, line, more] of UNKNOWN_RESETS.slice(0, 3)) {
    await saysNoInventedTime(page, reading, 'Davide · Codex', line, more)
  }
  await saysNoInventedTime(
    page,
    'reset=bad',
    'Davide · Claude Code',
    'Claude Code sign-in needed',
    'Its owner signs in on its host.',
  )
})

// ---- r3 repair 5 (UI85C4-F09): a time that isn't an instant gives no pace, in the list of other windows too. ----

/** Each meter of Claude Code's sheet, with its other windows open: its label, `aria-valuetext` and mark's `left`. */
async function claudeMeters(page: Page, reading: string) {
  await page.goto(`${PAGE}?viewer=davide&${reading}`)
  const sheet = await open(page, 'Davide · Claude Code')
  await sheet.getByRole('button', { name: /more windows?$/ }).click()
  const meters = sheet.getByRole('meter')
  await expect(meters.first()).toBeVisible()
  const read = await meters.evaluateAll((all) =>
    all.map((m) => ({
      label: m.getAttribute('aria-label') ?? '',
      text: m.getAttribute('aria-valuetext') ?? '',
      left: m.querySelector<HTMLElement>('.capacity-meter-pace')?.style.left ?? null,
    })),
  )
  return { sheet, read }
}

test('r3-repair5 · F09 · a paced window in the other windows, its reset not an instant, says no pace: no NaN mark or text', async ({
  page,
}) => {
  const { sheet, read } = await claudeMeters(page, 'reset=bad-7day')
  const sevenDay = read.find((m) => m.label === '7-day window')
  expect(sevenDay, 'the 7-day window is in the other windows, with its meter').toBeDefined()
  expect(sevenDay?.text).toBe('40% used') // its value, and no share of a window that isn't known
  expect(sevenDay?.left).toBeNull() // no mark drawn
  for (const m of read) {
    expect(m.text, m.label).not.toMatch(INVENTED)
    if (m.left !== null) expect(m.left, m.label).toMatch(/^\d+(\.\d+)?%$/)
  }
  await expect(sheet.locator('.capacity-windows')).not.toContainText(INVENTED)
  await expect(sheet.locator('.capacity-pace')).toHaveCount(0)
})

test('r3-repair5 · F09 · a valid reset keeps its pace mark; a reading time that isn’t an instant gives no pace', async ({
  page,
}) => {
  const valid = await claudeMeters(page, 'reset=ok-7day')
  const sevenDay = valid.read.find((m) => m.label === '7-day window')
  expect(sevenDay?.text).toMatch(/^40% used · \d+% of the window passed$/)
  expect(sevenDay?.left).toMatch(/^\d+(\.\d+)?%$/)
  const observed = await claudeMeters(page, 'reset=bad-observed')
  for (const m of observed.read) {
    expect(m.text, m.label).not.toMatch(INVENTED)
    expect(m.left, `${m.label}: no mark from a time that isn't one`).toBeNull()
  }
  await expect(observed.sheet.locator('.capacity-pace')).toHaveCount(0)
  await expect(observed.sheet.locator('.capacity-line')).not.toContainText(INVENTED)
  await expect(observed.sheet.locator('.capacity-windows')).not.toContainText(INVENTED)
})

test('@phone · r3-repair5 · F09 · at a phone’s width, the other windows’ meters say no made-up pace', async ({
  page,
}) => {
  for (const reading of ['reset=bad-7day', 'reset=bad-observed']) {
    const { read } = await claudeMeters(page, reading)
    for (const m of read) {
      expect(m.text, `${reading} ${m.label}`).not.toMatch(INVENTED)
      if (m.left !== null) expect(m.left, `${reading} ${m.label}`).toMatch(/^\d+(\.\d+)?%$/)
    }
    expect(read.find((m) => m.label === '7-day window')?.left ?? null, reading).toBeNull()
  }
})

// ---- r3 repair 6 (UI85C4-F09): a reading time that isn't an instant gives no history point, span or age. ----

/** Claude Code's capacity, its other windows open: the line of facts, each sparkline's words, points and marker. */
async function claudeHistory(page: Page, reading: string) {
  const { sheet, read: meters } = await claudeMeters(page, reading)
  const meta = (await sheet.locator('.capacity-meta').innerText()).trim()
  const lines = await sheet.locator('figure.capacity-history').evaluateAll((all) =>
    all.map((f) => ({
      label: f.getAttribute('aria-label') ?? '',
      caption: f.querySelector('figcaption')?.textContent ?? '',
      points: [...f.querySelectorAll('polyline, polygon')].map((e) => e.getAttribute('points') ?? '').join(' '),
      marker: (() => {
        const m = f.querySelector<HTMLElement>('.capacity-history-now')
        return m ? `${m.style.left} ${m.style.top}` : ''
      })(),
    })),
  )
  return { sheet, meta, lines, meters }
}

/** Every number in a sparkline's points and marker is finite: none drawn from a time that isn't one. */
const finiteNumbers = (text: string) =>
  (text.match(/-?[\d.]+|NaN|Infinity/g) ?? []).every((n) => Number.isFinite(Number(n)))

// The 7-day window draws a sparkline only in `ok-7day`: elsewhere its reset is due (refresh pending), as on the fixture.
for (const [reading, meta, sparklines] of [
  ['reset=bad-observed', 'shared by 2 sessions · 5 readings in 2 h', 1], // the live reading's time isn't one: no age, no point
  ['reset=bad-history', 'shared by 2 sessions · 5 readings in 2 h · 1 min ago', 1], // an earlier one's isn't: a point fewer
  ['reset=ok-7day', 'shared by 2 sessions · 6 readings in 3 h · 1 min ago', 2], // the valid control
] as const) {
  test(`r3-repair6 · F09 · ${reading}: the line of facts and every sparkline say only what is finite`, async ({
    page,
  }) => {
    const { sheet, meta: said, lines, meters } = await claudeHistory(page, reading)
    expect(said).toBe(meta)
    expect(lines.length, 'its sparklines').toBe(sparklines)
    for (const l of lines) {
      expect(`${l.label} ${l.caption}`, l.label).not.toMatch(INVENTED)
      expect(finiteNumbers(l.points), `${l.label}: ${l.points}`).toBe(true)
      expect(finiteNumbers(l.marker), `${l.label}: ${l.marker}`).toBe(true)
    }
    for (const m of meters) expect(m.text, m.label).not.toMatch(INVENTED)
    await expect(sheet.locator('.capacity-line')).not.toContainText(INVENTED)
    if (reading === 'reset=ok-7day') {
      expect(meters.find((m) => m.label === '7-day window')?.text).toMatch(/^40% used · 57% of the window passed$/)
    }
  })
}

test('@phone · r3-repair6 · F09 · at a phone’s width, no history point, span or age from a time that isn’t one', async ({
  page,
}) => {
  for (const [reading, meta] of [
    ['reset=bad-observed', 'shared by 2 sessions · 5 readings in 2 h'],
    ['reset=bad-history', 'shared by 2 sessions · 5 readings in 2 h · 1 min ago'],
  ] as const) {
    const { meta: said, lines } = await claudeHistory(page, reading)
    expect(said, reading).toBe(meta)
    for (const l of lines) {
      expect(`${l.label} ${l.caption}`, `${reading} ${l.label}`).not.toMatch(INVENTED)
      expect(finiteNumbers(`${l.points} ${l.marker}`), `${reading} ${l.label}`).toBe(true)
    }
  }
})

// ---- r3 repair 7 (UI58E-F10): a host time that isn't an instant is an unknown age, in the tile, heading and details. ----

/** Its text as written (not as styled: the tile's label is upper-cased by CSS), its spaces collapsed. */
const textOf = async (l: Locator) => ((await l.textContent()) ?? '').replace(/\s+/g, ' ').trim()

/** A host as the tile, the sheet's heading and Readiness details say it; focus back on its tile after Escape. */
async function hostSaid(page: Page, name: string) {
  const card = tile(page, name)
  const label = await textOf(card.locator('.resource-tile-host'))
  const sheet = await open(page, name)
  const heading = sheet.locator('.resource-host > p').first()
  const time = heading.locator('time')
  const times = await time.count()
  const said = {
    label,
    heading: await textOf(heading),
    times,
    dateTime: times ? await time.getAttribute('datetime') : null,
    title: times ? await time.getAttribute('title') : null,
  }
  await sheet.getByRole('button', { name: 'Readiness details' }).click()
  const detail = await textOf(sheet.locator('.readiness-details dd').first())
  await page.keyboard.press('Escape')
  await expect(card, `${name}: focus returns to its tile`).toBeFocused()
  return { ...said, row: detail }
}

const MADE_UP = /NaN|Infinity|Invalid Date|undefined|never observed|observed\s*$|·\s*$/

test('r3-repair7 · F10 · a host time that isn’t an instant: the state alone, never “never observed”, no bare “observed”', async ({
  page,
}) => {
  test.setTimeout(120_000) // three readings, two hosts each
  for (const kind of ['empty', 'blank', 'bad']) {
    await page.goto(`${PAGE}?viewer=davide&more=1&host=${kind}`)
    const codex = await hostSaid(page, 'Davide · Codex')
    expect(codex, kind).toMatchObject({ label: 'Host online', heading: 'Host online', times: 0, row: 'Online' })
    const grok = await hostSaid(page, 'Davide · Grok')
    expect(grok, kind).toMatchObject({ label: 'Host offline', heading: 'Host offline', times: 0, row: 'Offline' })
    for (const s of [codex, grok]) for (const v of [s.label, s.heading, s.row]) expect(v, kind).not.toMatch(MADE_UP)
  }
})

test('r3-repair7 · F10 · none is never observed; a valid time keeps its age, its <time> and its title', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&more=1&host=none`)
  expect(await hostSaid(page, 'Davide · Codex')).toMatchObject({
    label: 'Host online',
    heading: 'Host online · never observed',
    times: 0,
    row: 'Never observed',
  })
  expect(await hostSaid(page, 'Davide · Grok')).toMatchObject({
    label: 'Host offline',
    heading: 'Host offline · never observed',
  })
  await page.goto(`${PAGE}?viewer=davide&more=1`)
  const codex = await hostSaid(page, 'Davide · Codex')
  expect(codex).toMatchObject({ label: 'Host online', heading: 'Host online · observed 2 min ago', times: 1 })
  expect(codex.row).toBe('Online · observed 2 min ago')
  expect(codex.dateTime).toMatch(/^\d{4}-\d\d-\d\dT/)
  expect(codex.title ?? '').not.toMatch(/NaN|Invalid Date|^$/)
  const grok = await hostSaid(page, 'Davide · Grok')
  expect(grok).toMatchObject({ label: 'Host offline · 1 day', heading: 'Host offline · observed 1 day ago', times: 1 })
})

test('@phone · r3-repair7 · F10 · at a phone’s width, a host time that isn’t an instant says the state alone', async ({
  page,
}) => {
  for (const kind of ['empty', 'bad']) {
    await page.goto(`${PAGE}?viewer=davide&more=1&host=${kind}`)
    expect(await hostSaid(page, 'Davide · Codex'), kind).toMatchObject({
      label: 'Host online',
      heading: 'Host online',
      times: 0,
      row: 'Online',
    })
    expect(await hostSaid(page, 'Davide · Grok'), kind).toMatchObject({
      label: 'Host offline',
      heading: 'Host offline',
      times: 0,
      row: 'Offline',
    })
  }
})

// ---- r3 repair 8 (UI-DE66-F11): the settled control a work rests on stays said, in Tasks after Open work too. ----

/** A Stop or Hold of Codex's reviewer, confirmed by its runtime in Resources; then Open work into Tasks. */
async function confirmedThenOpen(page: Page, kind: 'stop' | 'hold') {
  await page.goto(`${PAGE}?viewer=davide&settle=confirmed`)
  const sheet = await open(page, 'Davide · Codex')
  const reviewer = row(sheet)
  await reviewer.getByRole('button', { name: 'Act' }).click()
  if (kind === 'stop') {
    await reviewer.getByRole('button', { name: 'Stop', exact: true }).click()
    await reviewer.getByRole('button', { name: 'Stop', exact: true }).last().click()
    await expect(reviewer.locator('.resource-work .chip')).toHaveText('Stopped')
  } else {
    await reviewer.getByRole('button', { name: 'Hold', exact: true }).click()
    await expect(reviewer.locator('.resource-work .chip')).toHaveText('Held')
  }
  await reviewer.getByRole('button', { name: 'Open work: Review the report pane' }).click()
  await expect(page).toHaveURL(/work\.html\?.*#task-work-2$/)
  const task = page.getByRole('dialog', { name: /Review the report pane/ })
  await expect(task).toBeVisible()
  return task
}
/** The controls Open work carried, as written: each kind, operation and the attempt it was sent for. */
type Carried = { command: { kind: string; operation_id: string; target: { attempt_id: string | null } } }
const isCarried = (k: unknown): k is Carried => typeof k === 'object' && k !== null && 'command' in k
function carriedControls(page: Page) {
  const raw: unknown = JSON.parse(new URL(page.url()).searchParams.get('retained') ?? '[]')
  const list: unknown[] = Array.isArray(raw) ? raw : []
  return list.filter(isCarried).map((k) => ({
    kind: k.command.kind,
    attempt: k.command.target.attempt_id,
    operation: k.command.operation_id,
  }))
}
const workSent = (page: Page) => page.evaluate(() => (window.workFixture?.commands ?? []).map((c) => c.kind))
const STOPPED = 'Stopped. Completed work is kept.'
const HELD = 'Held. Its runtime confirmed the hold.'

test('r3-repair8 · F11 · a Stop confirmed in Resources is still said in Tasks, as its own, after Open work and a reload', async ({
  page,
}) => {
  const task = await confirmedThenOpen(page, 'stop')
  const status = task.locator('.act-status')
  for (const pass of ['opened', 'reloaded']) {
    if (pass === 'reloaded') await page.reload()
    await expect(status, pass).toContainText('Stop sent without naming its attempt') // its own, not the attempt's
    await expect(status, pass).toContainText(STOPPED)
    await expect(task.getByRole('button', { name: 'Try again' }), pass).toHaveCount(0) // never sent again
    expect(carriedControls(page), pass).toEqual([expect.objectContaining({ kind: 'stop', attempt: null })])
    expect(await workSent(page), `${pass}: nothing sent on arrival`).toEqual([])
  }
})

test('r3-repair8 · F11 · a confirmed Hold stays said while its task view lags (still Working), and in the held view', async ({
  page,
}) => {
  const task = await confirmedThenOpen(page, 'hold')
  // The view reports it held: its task says Held, and its Hold is said as confirmed (the control path).
  await expect(page.locator('[data-task="work-2"] .task-chip')).toHaveText('Held')
  await expect(task.locator('.act-status')).toContainText(HELD)
  // The same page with only `held` removed: the task's view lagging behind the receipt.
  const lagging = new URL(page.url())
  lagging.searchParams.delete('held')
  await page.goto(lagging.toString())
  await expect(page.locator('[data-task="work-2"] .task-chip')).toHaveText('Working')
  const lagged = page.getByRole('dialog', { name: /Review the report pane/ })
  const status = lagged.locator('.act-status')
  await expect(status).toContainText('Hold sent without naming its attempt')
  await expect(status).toContainText(HELD)
  await expect(lagged.getByRole('button', { name: /^Hold/ })).toHaveCount(0) // no second Hold for this task
  expect(carriedControls(page)).toEqual([expect.objectContaining({ kind: 'hold', attempt: null })])
  expect(await workSent(page)).toEqual([])
})

test('r3-repair8 · F11 · a Resume pressed in Tasks: the confirmed Hold stays said beside it until its runtime confirms it', async ({
  page,
}) => {
  const task = await confirmedThenOpen(page, 'hold')
  const [hold] = carriedControls(page)
  await task.getByRole('button', { name: /^Resume/ }).click()
  const status = task.locator('.act-status')
  await expect(status).toContainText('Resume requested; waiting for the runtime to confirm.')
  await expect(status).toContainText('Hold sent without naming its attempt')
  await expect(status).toContainText(HELD)
  expect(await workSent(page)).toEqual(['resume']) // its own new operation; the Hold kept as it was
  expect(carriedControls(page)).toEqual([hold])
})

test('@phone · r3-repair8 · F11 · at a phone’s width, the confirmed Stop and the lagging Hold are still said in Tasks', async ({
  page,
}) => {
  test.setTimeout(90_000)
  const task = await confirmedThenOpen(page, 'stop')
  await expect(task.locator('.act-status')).toContainText('Stop sent without naming its attempt')
  await expect(task.locator('.act-status')).toContainText(STOPPED)
  await confirmedThenOpen(page, 'hold')
  const lagging = new URL(page.url())
  lagging.searchParams.delete('held')
  await page.goto(lagging.toString())
  const status = page.getByRole('dialog', { name: /Review the report pane/ }).locator('.act-status')
  await expect(status).toContainText('Hold sent without naming its attempt')
  await expect(status).toContainText(HELD)
  expect(await workSent(page)).toEqual([])
})

test('@phone · r3-repair · readiness at a phone’s width: its line and details inside the sheet', async ({ page }) => {
  await page.goto(`${PAGE}?viewer=davide&readiness=1`)
  const sheet = await open(page, 'Davide · Codex')
  await sheet.getByRole('button', { name: 'Readiness details' }).click()
  const edge = await sheet.evaluate((s) => s.getBoundingClientRect().right)
  for (const part of ['.resource-readiness', '.readiness-details']) {
    expect(await sheet.locator(part).evaluate((e) => e.getBoundingClientRect().right)).toBeLessThanOrEqual(edge)
  }
})

// ---- r3 repair 2 (review INC01-DES-001-r3-repair1-SOURCE-PRE-PUSH-001). ----

test('r3-repair2 · F05 · Open work from a seeded state arrives as that state in Tasks; nothing sent, nothing rebound', async ({
  page,
}) => {
  test.setTimeout(150_000) // three seeds, each opened and reloaded before Open work
  for (const seed of ['held', 'pending', 'unknown'] as const) {
    for (const pass of ['opened', 'reloaded']) {
      await page.goto(`${PAGE}?viewer=davide&seed=${seed}`)
      if (pass === 'reloaded') await page.reload()
      const sheet = await open(page, 'Davide · Codex')
      await row(sheet).getByRole('button', { name: 'Open work: Review the report pane' }).click()
      await expect(page).toHaveURL(/work\.html\?.*#task-work-2$/)
      const task = page.getByRole('dialog', { name: /Review the report pane/ })
      await expect(task, `${seed} ${pass}`).toBeVisible()
      await expect(task.getByRole('button', { name: /^Hold/ }), `${seed} ${pass}: no second Hold`).toHaveCount(0)
      if (seed === 'held') await expect(page.locator('[data-task="work-2"] .task-chip')).toHaveText('Held')
      else {
        // The same operation, as it was: its attempt unnamed, its outcome as uncertain as before, never retried here.
        const earlier = task.getByRole('list', { name: 'Earlier, still open' })
        await expect(earlier).toContainText('sent without naming its attempt')
        await expect(earlier).toContainText(
          seed === 'pending'
            ? 'Hold requested; waiting for the runtime to confirm.'
            : 'Not confirmed whether it was recorded.',
        )
        await expect(earlier.getByRole('button', { name: 'Try again' })).toHaveCount(0)
      }
      expect(await page.evaluate(() => window.workFixture?.commands ?? []), `${seed} ${pass}`).toEqual([])
    }
  }
})

test('r3-repair2 · F06 · F07 · readiness keeps unsupported and unknown apart, and never current from a bad or future time', async ({
  page,
}) => {
  await page.goto(`${PAGE}?viewer=davide&readiness=edge&more=1`)
  const said = (name: string) => tile(page, name).locator('.resource-tile-readiness')
  await expect(said('Davide · Codex')).toHaveText('Ready for repository analysis')
  await expect(said('Davide · Claude Code')).toHaveText('Operations not reported')
  await expect(said('Luis · Gemini CLI')).toHaveText('Readiness not current: observed after now')
  await expect(said('Davide · Grok')).toHaveText('Waits for its host to reconnect')
  const codex = await open(page, 'Davide · Codex')
  await expect(codex.locator('.resource-readiness')).toContainText('Code changes: not supported by this connection')
  await page.keyboard.press('Escape')
  const gemini = await open(page, 'Luis · Gemini CLI')
  await gemini.getByRole('button', { name: 'Readiness details' }).click()
  await expect(gemini.locator('.readiness-details')).not.toContainText(/NaN|just now/)
  await expect(gemini.locator('.readiness-details dd').last()).toContainText('in the future')
})
