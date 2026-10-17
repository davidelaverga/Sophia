import { expect, test, type Page } from '@playwright/test'

// A decision waiting on the viewer finds them beyond the view (docs/plans/decision-alert.md; informe-25 DL-07): the
// tab's number counts it, as it counts the door, and one that arrives while the tab is hidden is a browser
// notification, as a knock is. The browser's notifications are stood in for; every name is synthetic.

declare global {
  interface Window {
    decisionAlerts?: { notified: { title: string; body: string }[] }
  }
}

const PAGE = '/work.html'
const QUIET = 'Fixture project · Sophia'
const ONE = '(1) Fixture project · Sophia'

/** A stand-in for Notification, with `permission` and `hidden` as asked. */
async function standIns(page: Page, { permission, hidden }: { permission: string; hidden: boolean }) {
  await page.addInitScript(
    ({ permission: given, hidden: away }) => {
      const alerts = { notified: [] as { title: string; body: string }[] }
      window.decisionAlerts = alerts
      class FakeNotification {
        static get permission() {
          return given
        }
        static requestPermission() {
          return Promise.resolve(given)
        }
        addEventListener() {}
        constructor(title: string, options?: { body?: string }) {
          alerts.notified.push({ title, body: options?.body ?? '' })
        }
        close() {}
      }
      Object.defineProperty(window, 'Notification', { value: FakeNotification })
      if (away) {
        Object.defineProperty(document, 'hidden', { get: () => true })
        Object.defineProperty(document, 'visibilityState', { get: () => 'hidden' })
      }
    },
    { permission, hidden },
  )
}

const notified = (page: Page) => page.evaluate(() => window.decisionAlerts?.notified ?? [])
const arrives = (page: Page, decider: string) =>
  page.evaluate((id) => window.workFixture?.decisionArrives?.(id), decider)

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.workFixture?.unexpected ?? [])])).toEqual([])
})

/**
 * Pauses the page's clock a moment ahead of its own time, aiming again if a busy first render passed that moment (as
 * work.spec's pauseSoon).
 */
async function pauseSoon(page: Page, tries = 5): Promise<void> {
  const at = new Date((await page.evaluate(() => Date.now())) + 1000)
  try {
    await page.clock.pauseAt(at)
  } catch (e) {
    if (tries <= 1 || !String(e).includes('Cannot fast-forward to the past')) throw e
    await pauseSoon(page, tries - 1)
  }
}

test('decisions · a decision waiting on you counts in the tab, and goes once answered', async ({ page }) => {
  await page.goto(`${PAGE}?viewer=davide`)
  await expect(page).toHaveTitle(ONE)
  const ask = page.getByRole('region', { name: 'Davide decides' }).first()
  await ask.getByRole('group', { name: 'Your choice' }).getByRole('button', { name: 'Ship it now' }).click()
  await expect(ask.getByRole('status')).toContainText('Your choice is recorded')
  await page.evaluate(() => window.workFixture?.settle('d1'))
  await expect(page).toHaveTitle(QUIET)
})

test('decisions · one past its expiry stops counting', async ({ page }) => {
  await page.clock.install()
  await page.goto(`${PAGE}?viewer=davide&expired=soon`)
  await pauseSoon(page)
  await expect(page).toHaveTitle(ONE)
  await page.clock.runFor(31_000)
  await expect(page).toHaveTitle(QUIET)
})

test('decisions · the served admission of your own proposal counts, and goes once answered', async ({ page }) => {
  await page.goto(`${PAGE}?served=1&proposed=lost&admits=1`)
  await page.getByRole('button', { name: 'Review sources' }).first().click()
  const form = page.getByRole('form', { name: 'Review sources' })
  await form.getByRole('checkbox', { name: 'Press plan v2' }).check()
  await form.getByRole('button', { name: 'Propose review' }).click()
  await expect(form.getByRole('alert')).toBeVisible()
  await page.reload()
  const choice = page.getByRole('group', { name: 'Your choice' })
  await expect(choice).toBeVisible()
  await expect(page).toHaveTitle(ONE)
  await choice.getByRole('button', { name: 'Start the review' }).click()
  await expect(page).toHaveTitle(QUIET)
})

test('decisions · one that arrives while the tab is hidden is a notification, by its question', async ({ page }) => {
  await standIns(page, { permission: 'granted', hidden: true })
  await page.goto(PAGE)
  await expect(page).toHaveTitle(QUIET) // the first look is taken: what comes next is news
  await arrives(page, 'luis')
  await expect
    .poll(() => notified(page))
    .toEqual([
      { title: 'A decision waits on you: Keep the retry’s backoff at 2 s?', body: 'Fixture project · expires in 2 h' },
    ])
  await expect(page).toHaveTitle(ONE)
})

test('decisions · one already waiting when the page opened is not news', async ({ page }) => {
  await standIns(page, { permission: 'granted', hidden: true })
  await page.goto(`${PAGE}?viewer=davide`)
  await expect(page).toHaveTitle(ONE)
  await page.waitForTimeout(500)
  expect(await notified(page)).toEqual([])
})

test('decisions · with the tab shown, a new one counts and nothing is notified', async ({ page }) => {
  await standIns(page, { permission: 'granted', hidden: false })
  await page.goto(`${PAGE}?viewer=davide`)
  await expect(page).toHaveTitle(ONE)
  await arrives(page, 'davide')
  await expect(page).toHaveTitle('(2) Fixture project · Sophia')
  expect(await notified(page)).toEqual([])
})

test('decisions · without notifications allowed, a new one only counts', async ({ page }) => {
  await standIns(page, { permission: 'default', hidden: true })
  await page.goto(PAGE)
  await expect(page).toHaveTitle(QUIET)
  await arrives(page, 'luis')
  await expect(page).toHaveTitle(ONE)
  expect(await notified(page)).toEqual([])
})

test('decisions · the last look moves on: an answered one leaving notifies nothing more', async ({ page }) => {
  await standIns(page, { permission: 'granted', hidden: true })
  await page.goto(`${PAGE}?viewer=davide`)
  await expect(page).toHaveTitle(ONE)
  await arrives(page, 'davide')
  await expect.poll(async () => (await notified(page)).length).toBe(1)
  await page.evaluate(() => window.workFixture?.settle('d1'))
  await expect(page).toHaveTitle(ONE)
  await page.waitForTimeout(300)
  expect(await notified(page)).toHaveLength(1)
})
