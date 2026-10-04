// The email sign-in, without friction: the field ready on arrival, an address checked in the page's words, the code
// ready once the email went, its inbox one press away, and sending again once a little while has passed.
import { expect, test, type Locator, type Page } from '@playwright/test'
import { typeSizes } from './type-sizes.ts'

const PAGE = '/signin.html'
const email = (page: Page) => page.getByRole('textbox', { name: 'Email' })
const sentTo = (page: Page) => page.evaluate(() => window.signinFixture?.sent ?? [])
// The threshold (docs/plans/signin-threshold.md): the light's mood and the mark are read from the light's own box.
const light = (page: Page) => page.locator('.light')
const threshold = (page: Page) => page.locator('.threshold[data-mark="umbral"]')
const numbers = async (page: Page, name: string) =>
  ((await light(page).getAttribute(name)) ?? '').split(' ').map(Number)

/** The centre and width of `of`, in the light's box. */
async function inLight(page: Page, of: Locator) {
  const [box, at] = await Promise.all([light(page).boundingBox(), of.boundingBox()])
  if (!box || !at) throw new Error('not laid out')
  return { x: at.x + at.width / 2 - box.x, y: at.y + at.height / 2 - box.y, width: at.width }
}

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

test('signin · refused for the hour, with no wait given, it still waits Auth’s window, said as a failure', async ({
  page,
}) => {
  await held(page, '?limit=hour')
  await sendHeld(page, 'luis@sophia.test')
  await page.clock.fastForward(60_000)
  await page.clock.runFor(1000)
  await again(page).click()
  await page.clock.runFor(400)
  await expect(againSaid(page)).toHaveText(/^Too many emails were sent in the last hour/)
  await expect(againSaid(page)).toHaveAttribute('data-state', 'failed')
  // The screen's error colour (--rose), not the quiet grey of progress.
  expect(await againSaid(page).evaluate((s) => getComputedStyle(s).color)).toBe('rgb(238, 159, 176)')
  await expect(again(page)).toHaveText('Send again in 60 s') // Auth's whole window, not again at once
})

test('signin · a send again that never answers ends, says so, and waits Auth’s window', async ({ page }) => {
  await held(page, '?stall=1')
  await sendHeld(page, 'luis@sophia.test')
  await page.clock.fastForward(60_000)
  await page.clock.runFor(1000)
  await again(page).click()
  await expect(againSaid(page)).toHaveText('Sending…')
  await page.clock.fastForward(30_000)
  await page.clock.runFor(1000)
  await expect(againSaid(page)).toHaveText('Not confirmed: the email may still arrive. Wait for it, then send again.')
  await expect(againSaid(page)).toHaveAttribute('data-state', 'failed')
  await expect(again(page)).toHaveText(/^Send again in (59|60) s$/) // the window, a second already gone
})

test('signin · another email brings the address back, ready, and the mark goes', async ({ page }) => {
  await page.goto(PAGE)
  await sendTo(page, 'luis@sophia.test')
  await page.getByRole('button', { name: 'Use another email' }).click()
  await expect(email(page)).toBeFocused()
  await expect(threshold(page)).toHaveCount(0)
  await expect(light(page)).not.toHaveAttribute('data-mark')
  // The new field is the one she listens to: focused she listens, even emptied; left empty, she rests.
  await expect(light(page)).toHaveAttribute('data-mode', 'listen')
  await email(page).fill('')
  await expect(light(page)).toHaveAttribute('data-mode', 'listen')
  const field = await inLight(page, email(page))
  const [x = NaN, y = NaN] = await numbers(page, 'data-attention')
  expect(Math.abs(x - field.x) + Math.abs(y - field.y)).toBeLessThan(4)
  await email(page).blur()
  await expect(light(page)).toHaveAttribute('data-mode', 'rest')
})

test('signin · Sophia listens while the address is written, thinks while it goes, rests once through', async ({
  page,
}) => {
  await held(page)
  await email(page).focus()
  await expect(light(page)).toHaveAttribute('data-mode', 'listen')
  const field = await inLight(page, email(page))
  const [x = NaN, y = NaN] = await numbers(page, 'data-attention')
  // Her attention is the field's centre, in the light's box.
  expect(Math.abs(x - field.x)).toBeLessThan(2)
  expect(Math.abs(y - field.y)).toBeLessThan(2)
  await email(page).blur()
  await expect(light(page)).toHaveAttribute('data-mode', 'rest') // an empty field, left: she rests
  await email(page).fill('luis@sophia.test')
  await email(page).blur()
  await expect(light(page)).toHaveAttribute('data-mode', 'listen') // words in it: she still listens
  await page.getByRole('button', { name: 'Email me a link' }).click()
  await expect(light(page)).toHaveAttribute('data-mode', 'think')
  await page.clock.runFor(400)
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
  await expect(light(page)).toHaveAttribute('data-mode', 'rest')
})

test('signin · through, Umbral forms where the light rests, and the light stands behind it', async ({ page }) => {
  await page.goto(PAGE)
  await expect(email(page)).toBeVisible({ timeout: 15_000 })
  await expect(light(page)).not.toHaveAttribute('data-mark')
  await sendTo(page, 'luis@sophia.test')
  await expect(threshold(page)).toBeVisible()
  const [x = NaN, y = NaN, size = NaN] = await numbers(page, 'data-mark')
  const mark = await inLight(page, threshold(page))
  const width = (await light(page).boundingBox())?.width ?? NaN
  expect(Math.abs(x - width / 2)).toBeLessThan(1) // over the words, centred, as the light rests
  expect([48, 96]).toContain(size)
  expect(mark.width).toBe(size)
  expect(Math.abs(mark.x - x)).toBeLessThan(1)
  expect(Math.abs(mark.y - y)).toBeLessThan(1)
  // It forms: her half grows from the light and yours rises, two gestures of its own besides her halo's breath.
  const formed = await threshold(page).evaluate(
    (svg) => svg.getAnimations({ subtree: true }).filter((a) => !(a instanceof CSSAnimation)).length,
  )
  expect(formed).toBe(2)
})

test('signin · a window resized once through keeps the mark centred over the words', async ({ page }) => {
  await page.goto(PAGE)
  await sendTo(page, 'luis@sophia.test')
  await expect(threshold(page)).toBeVisible()
  await page.setViewportSize({ width: 1000, height: 720 })
  await expect
    .poll(async () => {
      const width = (await light(page).boundingBox())?.width ?? NaN
      const [x = NaN] = await numbers(page, 'data-mark')
      const mark = await inLight(page, threshold(page))
      return Math.round(Math.abs(x - width / 2) + Math.abs(mark.x - width / 2))
    })
    .toBeLessThan(2)
})

test('signin · with less motion asked for, the mark is simply there, formed and still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(PAGE)
  await sendTo(page, 'luis@sophia.test')
  await expect(threshold(page)).toBeVisible()
  expect(await threshold(page).evaluate((svg) => svg.getAnimations({ subtree: true }).length)).toBe(0)
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
