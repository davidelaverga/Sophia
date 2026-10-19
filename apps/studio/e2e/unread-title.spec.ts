import { expect, test, type Page } from '@playwright/test'

// A message that comes while the tab is hidden counts in its title (docs/plans/unread-title.md), as someone at the door
// already does; shown again, the count goes. The page's visibility is stood in for (`away`), and another member writes
// through the fixture (`say`).

const away = (page: Page, on: boolean) =>
  page.evaluate((hidden) => {
    Reflect.set(window, 'away', hidden)
    document.dispatchEvent(new Event('visibilitychange'))
  }, on)

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
  await page.addInitScript(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => Reflect.get(window, 'away') === true })
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => (Reflect.get(window, 'away') === true ? 'hidden' : 'visible'),
    })
  })
})

test('unread · messages from another while the tab is hidden count in its title; shown again, the count goes', async ({
  page,
}) => {
  await page.goto('/room.html')
  await expect(page).toHaveTitle('Fixture project · Sophia')
  await away(page, true)
  await page.evaluate(() => window.fixture?.say('The deck is in Resources.'))
  await page.evaluate(() => window.fixture?.say('And the numbers too.'))
  await expect(page).toHaveTitle('(2) Fixture project · Sophia')
  await away(page, false)
  await expect(page).toHaveTitle('Fixture project · Sophia')
})

test('unread · a message rolled out of the snapshot’s 50 still counts (Codex P2 on #418)', async ({ page }) => {
  await page.goto('/room.html')
  await expect(page).toHaveTitle('Fixture project · Sophia')
  await away(page, true)
  await page.evaluate(() => window.fixture?.say('First while away.'))
  await expect(page).toHaveTitle('(1) Fixture project · Sophia')
  // Fifty more: the snapshot holds the latest 50 (fixtures/data.ts, as the API does), so the first leaves it.
  await page.evaluate(() => {
    for (let i = 0; i < 50; i++) window.fixture?.say(`More ${String(i)}`)
  })
  await expect(page).toHaveTitle('(51) Fixture project · Sophia')
  await away(page, false)
  await expect(page).toHaveTitle('Fixture project · Sophia')
})

test('unread · a message while the tab is shown doesn’t count', async ({ page }) => {
  await page.goto('/room.html')
  await expect(page).toHaveTitle('Fixture project · Sophia')
  await page.evaluate(() => window.fixture?.say('Seen as it comes.'))
  await page.waitForTimeout(500)
  await expect(page).toHaveTitle('Fixture project · Sophia')
})

test('unread · the viewer’s own message, read before their membership, leaves the count once it is (Codex P2 on #444)', async ({
  page,
}) => {
  await page.goto('/room.html?membership=hold')
  await expect(page).toHaveTitle('Fixture project · Sophia')
  await away(page, true)
  // Written from the viewer's phone while this tab is hidden, and read before the page knows who the viewer is.
  await page.evaluate(() => window.fixture?.sayElsewhere('Sent from my phone.'))
  await page.evaluate(() => window.fixture?.say('The deck is in Resources.'))
  await expect(page).toHaveTitle('(2) Fixture project · Sophia')
  await page.evaluate(() => window.fixture?.releaseMembership())
  await expect(page).toHaveTitle('(1) Fixture project · Sophia')
  await away(page, false)
  await expect(page).toHaveTitle('Fixture project · Sophia')
})
