import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

// The Personal journey on the real served path (playwright.served.config.ts, SOPHIA_SERVED_PERSONAL=1): the normal
// Studio, the real API on its restricted role over local PostgreSQL, the live companion answering from the loopback
// model double (its default answer is "ok"). Dev identities sign in with synthetic HS256 tokens: not hosted Auth, not a
// real provider. Nothing here is mocked in the page: every Personal call goes to the listening API.

/**
 * FIXTURE (the operator): settles the served payer's held call from the provider's record, through the disposable
 * database's OWNER connection (the database dev-db made), in a child process where pg resolves (apps/api).
 */
function reconcileHeld() {
  const served: unknown = JSON.parse(readFileSync(process.env.SOPHIA_SERVED_ENV ?? '', 'utf8'))
  const api = served && typeof served === 'object' && 'api' in served ? served.api : null
  const apiDb =
    api && typeof api === 'object' && 'SOPHIA_API_DATABASE_URL' in api ? String(api.SOPHIA_API_DATABASE_URL) : ''
  const owner = new URL(process.env.SOPHIA_DISPOSABLE_DATABASE_URL ?? '')
  owner.pathname = new URL(apiDb).pathname
  const code = `import pg from 'pg'
const c = new pg.Client({ connectionString: process.argv[1] }); await c.connect()
const r = await c.query("SELECT call_id FROM sophia.personal_companion_usage WHERE payer='served-personal-payer' AND state='uncertain'")
for (const row of r.rows) await c.query("SELECT sophia.reconcile_personal_companion($1, 0, '{\\"inputTokens\\":0,\\"outputTokens\\":0}')", [row.call_id])
process.stdout.write(String(r.rows.length)); await c.end()`
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', code, owner.href], {
    cwd: new URL('../../api/', import.meta.url),
    encoding: 'utf8',
  })
  expect(out, 'one held call settled').toBe('1')
}

/** Signed in as one of dev-db's identities, every API call recorded. */
async function as(page: Page, name: string) {
  await page.addInitScript((who) => sessionStorage.setItem('sophia.dev.identity', who), name)
  const calls: string[] = []
  // What the page says of itself (errors, a crash), kept with the run.
  page.on('console', (m) => {
    if (m.type() === 'error') process.stdout.write(`[${name} console] ${m.text()}\n`)
  })
  page.on('pageerror', (e) => process.stdout.write(`[${name} pageerror] ${e.message}\n`))
  page.on('crash', () => process.stdout.write(`[${name}] page crashed\n`))
  page.on('request', (r) => {
    const url = new URL(r.url())
    if (url.pathname.startsWith('/api/v1/personal')) calls.push(`${r.method()} ${url.pathname}`)
  })
  return calls
}

test('personal · served: Luis asks, the companion answers, a refresh keeps it; a refused answer is asked again; erased, the space is empty; Davide sees his own', async ({
  browser,
}) => {
  const luis = await browser.newPage()
  const calls = await as(luis, 'Luis')
  await luis.goto('/personal')
  // The answers are read in the conversation itself: since main's attention, "What needs you" may list the same reply.
  // After the erasure the page-wide counts below hold for both places.
  const talk = luis.getByLabel('Conversation with Sophia')
  const field = luis.getByRole('textbox', { name: /Write to her|Message|Talk/i }).first()
  await expect(field).toBeVisible()
  await field.fill('SYNTHETIC served question for the double')
  await field.press('Enter')
  await expect(luis.getByText('SYNTHETIC served question for the double')).toBeVisible()
  await expect(talk.getByText('ok', { exact: true })).toBeVisible({ timeout: 15_000 })
  await luis.reload()
  await expect(luis.getByText('SYNTHETIC served question for the double')).toBeVisible()
  await expect(talk.getByText('ok', { exact: true })).toBeVisible()
  expect(calls.some((c) => c === 'POST /api/v1/personal/turns')).toBe(true)

  // A second question: the companion's provider refuses once (the double's 503), the turn says so; Ask again answers.
  await field.fill('SYNTHETIC second question, refused once')
  await field.press('Enter')
  await expect(luis.locator('p.c3-failed')).toBeVisible({ timeout: 15_000 })
  // Its cost is unknown, so the payer is held: asked again at once, nothing is asked and the turn fails again.
  await luis.getByRole('button', { name: 'Ask again' }).click()
  await expect(luis.getByRole('button', { name: 'Ask again' })).toBeVisible({ timeout: 15_000 })
  await expect(luis.locator('p.c3-failed')).toBeVisible()
  // SYNTHETIC FIXTURE ACTION, not an end-user recovery: the operator settles the held call from the provider's record.
  // Here that record is the loopback double's own contract: its 503 step answers an error with no stream and no usage,
  // so nothing was produced and the settlement is 0. Done through the disposable database's owner, never the API.
  reconcileHeld()
  await luis.getByRole('button', { name: 'Ask again' }).click()
  await expect(luis.locator('p.c3-failed')).toHaveCount(0, { timeout: 15_000 })
  await expect(talk.getByText('ok', { exact: true })).toHaveCount(2)
  expect(calls.filter((c) => /^POST \/api\/v1\/personal\/turns\/[^/]+\/retry$/.test(c))).toHaveLength(2)

  // Delete everything, as the owner confirms it in "Your data": the erasure answers, and after a refresh nothing is left.
  await luis.getByRole('button', { name: 'Account' }).click()
  await luis.getByRole('menuitem', { name: 'Your data' }).click()
  await luis.locator('#c-del').fill('delete')
  const erased = luis.waitForResponse(
    (r) => r.url().endsWith('/api/v1/personal/erasure') && r.request().method() === 'POST',
  )
  await luis.getByRole('button', { name: 'Delete everything' }).click()
  expect((await erased).status()).toBe(202)
  await luis.reload()
  await expect(luis.getByText('SYNTHETIC served question for the double')).toHaveCount(0)
  await expect(luis.getByText('SYNTHETIC second question, refused once')).toHaveCount(0)
  await expect(luis.getByText('ok', { exact: true })).toHaveCount(0)

  const davide = await browser.newPage()
  await as(davide, 'Davide')
  await davide.goto('/personal')
  await expect(davide.getByRole('textbox', { name: /Write to her|Message|Talk/i }).first()).toBeVisible()
  await expect(davide.getByText('SYNTHETIC served question for the double')).toHaveCount(0)
})
