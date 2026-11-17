import { expect, test, type Page } from '@playwright/test'

// Hearing a knock at the door (docs/plans/knock-alert.md): a chime for each new arrival, for those who can let people
// in, and a browser notification while the tab is hidden. The browser's sound and notifications are stood in for and
// recorded. Every name is synthetic.

declare global {
  interface Window {
    alerts?: { chimes: number; notified: { title: string; body: string }[]; asked: number }
    /** Blocks notifications from the site's settings while the page stays open. */
    blockNotifications?: () => void
  }
}

const door = (page: Page) => page.getByRole('complementary', { name: 'Waiting to come in' })

interface Stand {
  permission: string
  hidden: boolean
  dismiss?: boolean
  answer?: string
}

/**
 * Stand-ins for the chime's AudioContext and for Notification, with `permission` and `hidden` as asked; the prompt
 * grants, leaves the choice unmade (`dismiss`), or gives `answer`.
 */
async function standIns(page: Page, { permission, hidden, dismiss = false, answer = '' }: Stand) {
  await page.addInitScript(
    ({ permission: given, hidden: away, dismiss: closes, answer: says }) => {
      const alerts = { chimes: 0, notified: [] as { title: string; body: string }[], asked: 0 }
      window.alerts = alerts
      class FakeContext {
        currentTime = 0
        destination = {}
        state = 'running'
        createGain() {
          return { connect: (n: unknown) => n, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }
        }
        createOscillator() {
          return {
            connect: (n: unknown) => n,
            frequency: { value: 0 },
            type: 'sine',
            start: () => (alerts.chimes += 1),
            stop() {},
          }
        }
        resume() {
          return Promise.resolve()
        }
        close() {
          return Promise.resolve()
        }
      }
      Object.defineProperty(window, 'AudioContext', { value: FakeContext })
      let allowed = given
      class FakeNotification {
        static get permission() {
          return allowed
        }
        static requestPermission() {
          alerts.asked += 1
          // Blocked already, the browser answers at once with no prompt.
          if (allowed === 'denied') return Promise.resolve(allowed)
          // Dismissed, the browser's prompt leaves the choice unmade: still «default».
          if (says) allowed = says
          else if (!closes) allowed = 'granted'
          return Promise.resolve(allowed)
        }
        addEventListener() {}
        constructor(title: string, options?: { body?: string }) {
          alerts.notified.push({ title, body: options?.body ?? '' })
        }
        close() {}
      }
      Object.defineProperty(window, 'Notification', { value: FakeNotification })
      window.blockNotifications = () => (allowed = 'denied')
      if (away) {
        Object.defineProperty(document, 'hidden', { get: () => true })
        Object.defineProperty(document, 'visibilityState', { get: () => 'hidden' })
      }
    },
    { permission, hidden, dismiss, answer },
  )
}

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

const alerts = (page: Page) => page.evaluate(() => window.alerts)
const BLOCKED = 'Notifications are blocked in this browser, so knocks show only here.'
/** Where the door says notifications are blocked: a polite live region, there (empty) before it has anything to say. */
const blockedLine = (page: Page) => door(page).locator('p[aria-live="polite"]')

test('knock · someone starts waiting: an admin hears it; with the tab shown, no notification', async ({ page }) => {
  await standIns(page, { permission: 'granted', hidden: false })
  await page.goto('/room.html')
  await page.evaluate(() => window.fixture?.knock())
  await expect(door(page).getByRole('status')).toContainText('At the door')
  await expect.poll(async () => (await alerts(page))?.chimes ?? 0).toBeGreaterThan(0)
  expect((await alerts(page))?.notified).toEqual([])
})

test('knock · with the tab hidden and notifications allowed, it notifies with the name and the project', async ({
  page,
}) => {
  await standIns(page, { permission: 'granted', hidden: true })
  await page.goto('/room.html')
  await page.evaluate(() => window.fixture?.knock())
  await expect.poll(async () => (await alerts(page))?.notified.length ?? 0).toBe(1)
  expect((await alerts(page))?.notified[0]).toEqual({
    title: 'Fixture guest is asking to join',
    body: 'Fixture project',
  })
})

test('knock · those already waiting when the page opens are not news; a viewer hears nothing', async ({ page }) => {
  await standIns(page, { permission: 'granted', hidden: true })
  await page.goto('/room.html?lobby=waiting')
  await expect(door(page).getByRole('status')).toContainText('At the door')
  await page.goto('/room.html?role=viewer')
  await page.evaluate(() => window.fixture?.knock())
  await expect(door(page).getByRole('status')).toContainText('At the door')
  await page.waitForTimeout(500)
  expect(await alerts(page)).toMatchObject({ chimes: 0, notified: [] })
})

test('knock · the door offers notifications once; the browser asks, and the offer goes', async ({ page }) => {
  await standIns(page, { permission: 'default', hidden: false })
  await page.goto('/room.html?lobby=waiting')
  const offer = door(page).getByRole('button', { name: 'Notify me when someone knocks' })
  await offer.click()
  await expect(offer).toHaveCount(0)
  // Granted: nothing to say, once the browser has been asked.
  await expect.poll(async () => (await alerts(page))?.asked).toBe(1)
  await expect(door(page).getByText(BLOCKED)).toHaveCount(0)
})

test('knock · a knock while the role is still being read is heard once it is known (Codex P2 on #362)', async ({
  page,
}) => {
  await standIns(page, { permission: 'granted', hidden: false })
  await page.goto('/room.html?membership=hold')
  await page.evaluate(() => window.fixture?.knock())
  await expect(door(page).getByRole('status')).toContainText('At the door')
  await page.evaluate(() => window.fixture?.releaseMembership())
  await expect.poll(async () => (await alerts(page))?.chimes ?? 0).toBeGreaterThan(0)
})

test('knock · a prompt dismissed is not offered again, here or after a reload (Codex P2 on #362)', async ({ page }) => {
  await standIns(page, { permission: 'default', hidden: false, dismiss: true })
  await page.goto('/room.html?lobby=waiting')
  const offer = door(page).getByRole('button', { name: 'Notify me when someone knocks' })
  await offer.click()
  await expect(offer).toHaveCount(0)
  // Dismissed, the choice is unmade: nothing is blocked, nothing to say, once the browser has been asked.
  await expect.poll(async () => (await alerts(page))?.asked).toBe(1)
  await expect(door(page).getByText(BLOCKED)).toHaveCount(0)
  await page.reload()
  await expect(door(page).getByRole('status')).toContainText('At the door')
  await expect(offer).toHaveCount(0)
})

// Seams (docs/plans/dictation-and-notify-said.md): the browser's answer is denied, so the door says where knocks show.

test('knock · notifications blocked at the prompt: the door says knocks show only here', async ({ page }) => {
  await standIns(page, { permission: 'default', hidden: false, answer: 'denied' })
  await page.goto('/room.html?lobby=waiting')
  await door(page).getByRole('button', { name: 'Notify me when someone knocks' }).click()
  await expect(blockedLine(page)).toHaveText(BLOCKED)
  expect((await alerts(page))?.asked).toBe(1)
})

test('knock · notifications blocked after the door opened: the press says so too', async ({ page }) => {
  await standIns(page, { permission: 'default', hidden: false })
  await page.goto('/room.html?lobby=waiting')
  const offer = door(page).getByRole('button', { name: 'Notify me when someone knocks' })
  await expect(offer).toBeVisible()
  await page.evaluate(() => window.blockNotifications?.())
  await offer.click()
  await expect(blockedLine(page)).toHaveText(BLOCKED)
})

test('knock · the blocked line is heard: its live region waits before the press, and focus stays on the door', async ({
  page,
}) => {
  await standIns(page, { permission: 'default', hidden: false, answer: 'denied' })
  await page.goto('/room.html?lobby=waiting')
  await expect(blockedLine(page)).toHaveText('')
  await door(page).getByRole('button', { name: 'Notify me when someone knocks' }).press('Enter')
  await expect(blockedLine(page)).toHaveText(BLOCKED)
  // The offer it replaced had the focus: it goes to the door's title, not to the page.
  const focused = () => page.evaluate(() => document.activeElement?.className ?? '')
  await expect.poll(focused).toContain('lobby-title')
})
