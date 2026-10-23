import { expect, test, type Page } from '@playwright/test'

// Terms and privacy (docs/plans/terms-privacy.md): the sign-in says what continuing means and links to both; each
// document reads its title, its date and its sections, and leads to the other and home, on a desktop and a phone.

const doc = (page: Page) => page.getByRole('main')

test('legal · the sign-in links to the terms and the privacy notice', async ({ page }) => {
  await page.goto('/signin.html')
  const line = page.locator('.signin-legal')
  await expect(line).toHaveText('By continuing you agree to the Terms and acknowledge the Privacy notice.')
  await expect(line.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms')
  await expect(line.getByRole('link', { name: 'Privacy notice' })).toHaveAttribute('href', '/privacy')
})

for (const [asked, title, other] of [
  ['terms', 'Terms of use', 'Privacy notice'],
  ['privacy', 'Privacy notice', 'Terms of use'],
] as const) {
  test(`legal · ${asked}: its title, date and sections, and the way to the other and home`, async ({ page }) => {
    await page.goto(`/legal.html?doc=${asked}`)
    await expect(doc(page).getByRole('heading', { level: 1 })).toHaveText(title)
    await expect(doc(page)).toContainText('Last updated 23 October 2026')
    expect(await doc(page).getByRole('heading', { level: 2 }).count()).toBeGreaterThanOrEqual(8)
    await expect(page.getByRole('link', { name: other })).toHaveAttribute(
      'href',
      asked === 'terms' ? '/privacy' : '/terms',
    )
    await expect(page.getByRole('link', { name: 'Back to Sophia' })).toHaveAttribute('href', '/')
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
  })
}

test('legal · the privacy notice names who processes what, and that calls aren’t recorded', async ({ page }) => {
  await page.goto('/legal.html?doc=privacy')
  for (const name of ['Supabase', 'LiveKit', 'Google', 'OpenAI', 'Tavily', 'Jina', 'Resend', 'Vercel', 'Render']) {
    await expect(doc(page)).toContainText(name)
  }
  await expect(doc(page)).toContainText('Calls aren’t recorded.')
})

// A contact address that doesn't depend on the app (docs/plans/legal-contact.md).
for (const asked of ['terms', 'privacy'] as const) {
  test(`legal · ${asked}: Contact gives an email address to write to`, async ({ page }) => {
    await page.goto(`/legal.html?doc=${asked}`)
    const contact = doc(page).locator('section', { has: page.getByRole('heading', { name: 'Contact' }) })
    await expect(contact.getByRole('link', { name: 'info@sophia-ei.com' })).toHaveAttribute(
      'href',
      'mailto:info@sophia-ei.com',
    )
  })
}
