import { expect, test, type Page } from '@playwright/test'

// Hearing a knock at the door (docs/plans/knock-alert.md): a chime for each new arrival, for those who can let people
// in, and a browser notification while the tab is hidden. The browser's sound and notifications are stood in for and
// recorded. Every name is synthetic.

declare global {
  interface Window {
    alerts?: { chimes: number; notified: { title: string; body: string }[]; asked: number }
  }
}

const door = (page: Page) => page.getByRole('complementary', { name: 'Waiting to come in' })

/** Stand-ins for the chime's AudioContext and for Notification, with `permission` and `hidden` as asked. */
async function standIns(
  page: Page,
  { permission, hidden, dismiss = false }: { permission: string; hidden: boolean; dismiss?: boolean },
) {
  await page.addInitScript(
    ({ permission: given, hidden: away, dismiss: closes }) => {
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
          // Dismissed, the browser's prompt leaves the choice unmade: still «default».
          if (!closes) allowed = 'granted'
          return Promise.resolve(allowed)
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
    { permission, hidden, dismiss },
  )
}

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

const alerts = (page: Page) => page.evaluate(() => window.alerts)

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
  expect((await alerts(page))?.asked).toBe(1)
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
  await page.reload()
  await expect(door(page).getByRole('status')).toContainText('At the door')
  await expect(offer).toHaveCount(0)
})
