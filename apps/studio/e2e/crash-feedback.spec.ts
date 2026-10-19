import { expect, test, type Page } from '@playwright/test'

// Crash reports and feedback (docs/plans/crash-feedback.md): with a DSN (`?sentry=1` on the fixtures), feedback from the
// account menu reaches Sentry with its words, and an error the page throws is reported without the address's query or
// fragment; with none, nothing is offered. Sentry's ingest is answered here and every envelope recorded.

const account = (page: Page) => page.getByRole('button', { name: 'Account' })
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Send feedback' })

/** Every envelope sent to the fixture's Sentry, as text. */
async function ingest(page: Page): Promise<string[]> {
  const sent: string[] = []
  await page.route(
    (url) => url.hostname.endsWith('ingest.sentry.io'),
    async (route) => {
      sent.push(route.request().postData() ?? '')
      await route.fulfill({ status: 200, body: '{}' })
    },
  )
  return sent
}

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199' && !url.hostname.endsWith('ingest.sentry.io'),
    (route) => route.abort(),
  )
})

test('feedback · Send feedback sends the words to the crash service, and says so', async ({ page }) => {
  const sent = await ingest(page)
  await page.goto('/room.html?sentry=1')
  await account(page).click()
  await page.getByRole('menuitem', { name: 'Send feedback' }).click()
  await sheet(page).getByLabel('What would you like us to know?').fill('The dock hides the chat on my phone.')
  await sheet(page).getByRole('button', { name: 'Send' }).click()
  await expect(sheet(page).getByRole('status')).toHaveText('Sent. Thank you.')
  expect(sent.some((e) => e.includes('"type":"feedback"') && e.includes('The dock hides the chat on my phone.'))).toBe(
    true,
  )
})

// One sheet at a time (CONTRIBUTING.md): Settings hands over to feedback, and feedback closed gives Settings back, at the
// press that opened it. Opened from the menu, it closes to the page (Codex P2 on #398).
test('feedback · opened from Settings, Close comes back to Settings, at its Send feedback', async ({ page }) => {
  await page.goto('/room.html?sentry=1')
  await account(page).click()
  await page.getByRole('menuitem', { name: 'Settings…' }).click()
  const settings = page.getByRole('dialog', { name: 'Settings' })
  await settings.getByRole('button', { name: 'Send feedback' }).click()
  await expect(settings).toHaveCount(0)
  await sheet(page).getByRole('button', { name: 'Close', exact: true }).click()
  await expect(sheet(page)).toHaveCount(0)
  await expect(settings.getByRole('button', { name: 'Send feedback' })).toBeFocused()
})

test('feedback · opened from the menu, Close goes back to the page, at the avatar', async ({ page }) => {
  await page.goto('/room.html?sentry=1')
  await account(page).click()
  await page.getByRole('menuitem', { name: 'Send feedback' }).click()
  await sheet(page).getByRole('button', { name: 'Close', exact: true }).click()
  await expect(sheet(page)).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: 'Settings' })).toHaveCount(0)
  await expect(account(page)).toBeFocused()
})

test('crash · an error the page throws is reported, without the address’s query or fragment', async ({ page }) => {
  const sent = await ingest(page)
  await page.goto('/room.html?sentry=1#private-token')
  await expect(account(page)).toBeVisible()
  await page.evaluate(() =>
    setTimeout(() => {
      throw new Error('A synthetic failure')
    }),
  )
  await expect.poll(() => sent.some((e) => e.includes('A synthetic failure'))).toBe(true)
  const report = sent.find((e) => e.includes('A synthetic failure')) ?? ''
  expect(report).toContain('/room.html')
  expect(report).not.toContain('private-token')
  expect(report).not.toContain('sentry=1')
})

test('crash · without a DSN, nothing is sent and no Send feedback is offered', async ({ page }) => {
  const sent = await ingest(page)
  await page.goto('/room.html')
  await account(page).click()
  await expect(page.getByRole('menu', { name: 'Account' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Send feedback' })).toHaveCount(0)
  expect(sent).toEqual([])
})

test('feedback · the feedback carries the address without its query or fragment (Codex P1 on #367)', async ({
  page,
}) => {
  const sent = await ingest(page)
  await page.goto('/room.html?sentry=1#private-token')
  await account(page).click()
  await page.getByRole('menuitem', { name: 'Send feedback' }).click()
  await sheet(page).getByLabel('What would you like us to know?').fill('Words for the team.')
  await sheet(page).getByRole('button', { name: 'Send' }).click()
  await expect(sheet(page).getByRole('status')).toHaveText('Sent. Thank you.')
  const feedback = sent.find((e) => e.includes('Words for the team.')) ?? ''
  expect(feedback).toContain('/room.html')
  expect(feedback).not.toContain('private-token')
  expect(feedback).not.toContain('sentry=1')
})

test('crash · an error before Sentry has loaded is still reported (Codex P1 on #367)', async ({ page }) => {
  const sent = await ingest(page)
  // `earlyFail=1`: the page throws right after starting the reports, before Sentry's chunk has loaded.
  await page.goto('/room.html?sentry=1&earlyFail=1')
  await expect.poll(() => sent.some((e) => e.includes('An early failure'))).toBe(true)
})

test('feedback · the words hold still while they go (Codex P2 on #367)', async ({ page }) => {
  await page.route(
    (url) => url.hostname.endsWith('ingest.sentry.io'),
    async (route) => {
      await new Promise((done) => setTimeout(done, 1500))
      await route.fulfill({ status: 200, body: '{}' })
    },
  )
  await page.goto('/room.html?sentry=1')
  await account(page).click()
  await page.getByRole('menuitem', { name: 'Send feedback' }).click()
  await sheet(page).getByLabel('What would you like us to know?').fill('Slow words.')
  await sheet(page).getByRole('button', { name: 'Send' }).click()
  await expect(sheet(page).getByLabel('What would you like us to know?')).toHaveAttribute('readonly', '')
})

// Sent only once Sentry's ingest takes it (Codex P2 on #367): a request that never arrives, or is refused, is not sent.
for (const [how, answer] of [
  ['never gets', 'abort'],
  ['refuses', 'refuse'],
] as const) {
  test(`feedback · a send the ingest ${how} says it couldn’t, never «Sent» (Codex P2 on #367)`, async ({ page }) => {
    await page.route(
      (url) => url.hostname.endsWith('ingest.sentry.io'),
      (route) => (answer === 'abort' ? route.abort() : route.fulfill({ status: 500, body: '{}' })),
    )
    await page.goto('/room.html?sentry=1')
    await account(page).click()
    await page.getByRole('menuitem', { name: 'Send feedback' }).click()
    await sheet(page).getByLabel('What would you like us to know?').fill('Words that never arrive.')
    await sheet(page).getByRole('button', { name: 'Send' }).click()
    await expect(sheet(page).getByRole('alert')).toHaveText('Couldn’t send it. Try again.', { timeout: 15_000 })
    await expect(sheet(page).getByRole('status')).not.toHaveText('Sent. Thank you.')
  })
}

test('feedback · a Sentry that failed to start starts again for the next send (Codex P2 on #367)', async ({ page }) => {
  const sent = await ingest(page)
  await page.goto('/room.html?sentry=1&sentryFlaky=1')
  await expect(page.locator('html')).toHaveAttribute('data-sentry-flaky', 'thrown')
  await account(page).click()
  await page.getByRole('menuitem', { name: 'Send feedback' }).click()
  await sheet(page).getByLabel('What would you like us to know?').fill('After a start that failed.')
  await sheet(page).getByRole('button', { name: 'Send' }).click()
  await expect(sheet(page).getByRole('status')).toHaveText('Sent. Thank you.')
  expect(sent.some((e) => e.includes('"type":"feedback"') && e.includes('After a start that failed.'))).toBe(true)
  // Started again, it reports on its own too.
  await page.evaluate(() =>
    setTimeout(() => {
      throw new Error('After the restart')
    }),
  )
  await expect.poll(() => sent.some((e) => e.includes('After the restart'))).toBe(true)
})
