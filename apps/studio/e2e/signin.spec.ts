// The email sign-in, without friction: the field ready on arrival, an address checked in the page's words, the code
// ready once the email went, its inbox one press away, and sending again once a little while has passed.
import { expect, test, type Page } from '@playwright/test'
import { typeSizes } from './type-sizes.ts'

const PAGE = '/signin.html'
const email = (page: Page) => page.getByRole('textbox', { name: 'Email' })
const sentTo = (page: Page) => page.evaluate(() => window.signinFixture?.sent ?? [])

async function sendTo(page: Page, address: string) {
  await email(page).fill(address)
  await page.getByRole('button', { name: 'Email me a link' }).click()
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
}

test('signin · the address field is ready on arrival, with a pointer', async ({ page }) => {
  await page.goto(PAGE)
  await expect(email(page)).toBeFocused({ timeout: 15_000 })
})

test('@phone · signin · on touch the field waits, so no keyboard covers the page', async ({ page }) => {
  await page.goto(PAGE)
  await expect(email(page)).toBeVisible({ timeout: 15_000 })
  await expect(email(page)).not.toBeFocused()
})

test('signin · an address that can’t be one is said in the page’s words, and nothing is sent', async ({ page }) => {
  await page.goto(PAGE)
  await email(page).fill('luis@')
  await page.getByRole('button', { name: 'Email me a link' }).click()
  await expect(page.getByRole('alert')).toHaveText('Check the address: it needs a name, an @ and a domain.')
  await expect(email(page)).toHaveAttribute('aria-invalid', 'true')
  await expect(email(page)).toBeFocused()
  // The page says it, not the browser's bubble: the form checks the address itself.
  expect(await page.locator('form.field').evaluate((f) => f instanceof HTMLFormElement && f.noValidate)).toBe(true)
  expect(await sentTo(page)).toEqual([])
  await email(page).fill('luis@gmail.com') // typing clears it
  await expect(email(page)).not.toHaveAttribute('aria-invalid')
})

test('signin · once sent, the code is ready, and a known inbox opens in one press', async ({ page }) => {
  await page.goto(PAGE)
  await sendTo(page, 'luis@gmail.com')
  await expect(page.getByRole('textbox', { name: 'Code from the email' })).toBeFocused()
  const open = page.getByRole('link', { name: 'Open Gmail' })
  await expect(open).toHaveAttribute('href', 'https://mail.google.com/')
  await expect(open).toHaveAttribute('target', '_blank')
})

test('signin · an inbox it doesn’t know gets no shortcut', async ({ page }) => {
  await page.goto(PAGE)
  await sendTo(page, 'luis@sophia.test')
  await expect(page.getByRole('link', { name: /^Open / })).toHaveCount(0)
})

/** The page with its clock held: time moves only as a check moves it. */
async function held(page: Page, query = '') {
  await page.clock.install()
  await page.goto(`${PAGE}${query}`)
  await expect(email(page)).toBeVisible({ timeout: 15_000 })
  await page.clock.pauseAt(new Date((await page.evaluate(() => Date.now())) + 1000))
}

const again = (page: Page) => page.getByRole('button', { name: /^Send again/ })
const againSaid = (page: Page) => page.locator('.send-again [role="status"]')

async function sendHeld(page: Page, address: string) {
  await email(page).fill(address)
  await page.getByRole('button', { name: 'Email me a link' }).click()
  await page.clock.runFor(400)
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
}

test('signin · send again waits Auth’s 60 s, sends once, says only the newest works, and waits again', async ({
  page,
}) => {
  await held(page)
  await sendHeld(page, 'luis@sophia.test')
  await expect(again(page)).toHaveText('Send again in 60 s')
  await expect(again(page)).toHaveAttribute('aria-disabled', 'true')
  await again(page).click({ force: true }) // pressed while it waits: nothing is sent
  await page.clock.fastForward(60_000)
  await page.clock.runFor(1000)
  await expect(again(page)).toHaveText('Send again')
  await again(page).click()
  await again(page).click({ force: true }) // a second press while it goes sends nothing more
  await page.clock.runFor(400)
  await expect(againSaid(page)).toHaveText('Sent again. Only the newest link and code work.')
  expect(await sentTo(page)).toEqual(['luis@sophia.test', 'luis@sophia.test'])
  await expect(again(page)).toHaveText('Send again in 60 s')
  await expect(again(page)).toBeFocused() // it waits again, and keeps the focus
})

test('signin · asked again too soon for Auth, the countdown takes the wait it gives', async ({ page }) => {
  await held(page, '?limit=1')
  await sendHeld(page, 'luis@sophia.test')
  await page.clock.fastForward(60_000)
  await page.clock.runFor(1000)
  await again(page).click()
  await page.clock.runFor(400)
  await expect(againSaid(page)).toHaveText('An email was just sent. You can ask for another in 17 seconds.')
  await expect(again(page)).toHaveText(/^Send again in 1[67] s$/)
})

test('signin · another email brings the address back, ready', async ({ page }) => {
  await page.goto(PAGE)
  await sendTo(page, 'luis@sophia.test')
  await page.getByRole('button', { name: 'Use another email' }).click()
  await expect(email(page)).toBeFocused()
})

test('@phone · signin · on touch the code waits too, so the keyboard doesn’t cover the inbox', async ({ page }) => {
  await page.goto(PAGE)
  await sendTo(page, 'luis@gmail.com')
  await expect(page.getByRole('textbox', { name: 'Code from the email' })).not.toBeFocused()
  await expect(page.getByRole('link', { name: 'Open Gmail' })).toBeInViewport()
})

test('signin · the service out of reach is said, and the address stays to try again', async ({ page }) => {
  await page.goto(`${PAGE}?fail=1`)
  await email(page).fill('luis@sophia.test')
  await page.getByRole('button', { name: 'Email me a link' }).click()
  await expect(page.getByRole('alert')).toHaveText(/Couldn’t reach the sign-in service/)
  await expect(email(page)).toHaveValue('luis@sophia.test')
  await expect(email(page)).not.toHaveAttribute('aria-invalid') // not the field's fault
  await expect(email(page)).toBeFocused() // back where trying again starts
})

test('signin · its words keep to three sizes: the title, the text, a label', async ({ page }) => {
  await page.goto(PAGE)
  await expect(email(page)).toBeVisible({ timeout: 15_000 })
  const idle = await typeSizes(page, '.screen')
  await sendTo(page, 'luis@gmail.com')
  const sent = await typeSizes(page, '.screen')
  for (const sizes of [idle, sent]) {
    // The title is 22 on a phone, 26 on a wider screen.
    expect(
      sizes.filter((s) => !['26px', '22px', '14px', '10.5px'].includes(s)),
      sizes.join(' '),
    ).toEqual([])
  }
})
