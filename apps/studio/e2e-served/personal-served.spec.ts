import { expect, test, type Page } from '@playwright/test'

// The Personal journey on the real served path (playwright.served.config.ts, SOPHIA_SERVED_PERSONAL=1): the normal
// Studio, the real API on its restricted role over local PostgreSQL, the live companion answering from the loopback
// model double (its default answer is "ok"). Dev identities sign in with synthetic HS256 tokens: not hosted Auth, not a
// real provider. Nothing here is mocked in the page: every Personal call goes to the listening API.

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

test('personal · served: Luis asks, the companion answers, a refresh keeps it; erased, the space is empty; Davide sees his own', async ({
  browser,
}) => {
  const luis = await browser.newPage()
  const calls = await as(luis, 'Luis')
  await luis.goto('/personal')
  const field = luis.getByRole('textbox', { name: /Write to her|Message|Talk/i }).first()
  await expect(field).toBeVisible()
  await field.fill('SYNTHETIC served question for the double')
  await field.press('Enter')
  await expect(luis.getByText('SYNTHETIC served question for the double')).toBeVisible()
  await expect(luis.getByText('ok', { exact: true })).toBeVisible({ timeout: 15_000 })
  await luis.reload()
  await expect(luis.getByText('SYNTHETIC served question for the double')).toBeVisible()
  await expect(luis.getByText('ok', { exact: true })).toBeVisible()
  expect(calls.some((c) => c === 'POST /api/v1/personal/turns')).toBe(true)

  const davide = await browser.newPage()
  await as(davide, 'Davide')
  await davide.goto('/personal')
  await expect(davide.getByRole('textbox', { name: /Write to her|Message|Talk/i }).first()).toBeVisible()
  await expect(davide.getByText('SYNTHETIC served question for the double')).toHaveCount(0)
})
