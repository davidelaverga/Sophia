import { expect, test, type Page } from '@playwright/test'

// A42 (FND-B-HTML-RETAINED-RECOVERY-01, controlled room fixture, synthetic people and answers): a failed HTML design as
// its own card on Work (`designcard=on&designretry=…`). Its editor is offered Try again only under the owner's fresh spend
// approval, which the retry names; a stale or closed approval is said, with no button. A lost reply is sent again under
// the same key, so it is the same retry. A refusal of an approval the owner replaced reads the design again, so the next
// press, the person's own, names the new approval. A card waiting on a stale or closed approval offers Check again, a
// read of the design, so an approval the owner gave while the page stayed open is seen.

const DESIGN_TASK = '00000000-0000-4000-8000-0000000000e2'
const card = (page: Page) => page.locator(`.work-card[data-task="${DESIGN_TASK}"]`)
const served = (page: Page) => page.evaluate(() => [...(window.fixture?.served ?? [])])
const retries = async (page: Page) => (await served(page)).filter((s) => s.startsWith('html-retry:'))

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test('design retry · under a fresh approval, Try again names it; a lost reply is the same retry when sent again', async ({
  page,
}) => {
  await page.goto('/room.html?place=work&designcard=on&designretry=fresh')
  await expect(card(page)).toHaveAttribute('data-state', 'failed')
  await expect(card(page)).toContainText('the renderer’s width sweep timed out')
  await page.evaluate(() => window.fixture?.loseRetry())
  await card(page).getByRole('button', { name: 'Try again' }).click()
  await expect(card(page).getByRole('status')).not.toBeEmpty()
  await card(page).getByRole('button', { name: 'Try again' }).click()
  await expect(card(page)).toContainText('Sophia designs this page again from the same report.')
  const sent = await retries(page)
  expect(sent).toHaveLength(2)
  expect(sent[0]).toMatch(/^html-retry:3:approval:owner-3:[0-9a-f-]{36}$/)
  expect(sent[1], 'the same key: the same retry').toBe(sent[0])
})

test('design retry · refused for an approval the owner replaced, the card reads the design again; the next press names the new one, under the same key', async ({
  page,
}) => {
  await page.goto('/room.html?place=work&designcard=on&designretry=fresh')
  await expect(card(page)).toHaveAttribute('data-state', 'failed')
  await expect(card(page).getByRole('button', { name: 'Try again' })).toBeEnabled()
  const details = async () => (await served(page)).filter((s) => s.startsWith('design-detail:'))
  expect(await details()).not.toContain('design-detail:4')
  // The owner approves again after the page read the design: the card still names revision 3.
  await page.evaluate(() => window.fixture?.reapprove())
  await card(page).getByRole('button', { name: 'Try again' }).click()
  await expect(card(page).getByRole('status')).toContainText('Stale spend approval')
  // The refusal reads the design again (the failed card is not polled): revision 4 is now what it holds.
  await expect.poll(details).toContain('design-detail:4')
  await expect(card(page).getByRole('button', { name: 'Try again' })).toBeEnabled()
  const refused = await retries(page)
  expect(refused, 'nothing sent again by itself').toHaveLength(1)
  expect(refused[0]).toMatch(/^html-retry:3:approval:owner-3:[0-9a-f-]{36}$/)
  // The next press is the person's own, and names revision 4 under the same key (nothing was admitted under it).
  await card(page).getByRole('button', { name: 'Try again' }).click()
  await expect(card(page)).toContainText('Sophia designs this page again from the same report.')
  const sent = await retries(page)
  expect(sent).toHaveLength(2)
  expect(sent[1]).toBe(sent[0]?.replace('html-retry:3:approval:owner-3:', 'html-retry:4:approval:owner-4:'))
})

for (const [waiting, words] of [
  ['stale', 'Trying again needs a new spend approval from the project owner.'],
  ['closed', 'Trying again needs the project owner to switch research on.'],
] as const) {
  test(`design retry · waiting on a ${waiting} approval, Check again reads the design; the owner's new approval offers Try again, and nothing is sent until it is pressed`, async ({
    page,
  }) => {
    await page.goto(`/room.html?place=work&designcard=on&designretry=${waiting}`)
    await expect(card(page)).toContainText(words)
    await expect(card(page).getByRole('button', { name: 'Try again' })).toHaveCount(0)
    const details = async () => (await served(page)).filter((s) => s.startsWith('design-detail:'))
    // The owner approves while the page stays open: nothing tells the page (the failed card is not polled).
    await page.evaluate(() => window.fixture?.reapprove())
    expect(await details()).not.toContain('design-detail:4')
    await card(page).getByRole('button', { name: 'Check again' }).click()
    // The person's own read of the design: it now carries the new approval, and Try again is offered under it.
    await expect.poll(details).toContain('design-detail:4')
    await expect(card(page).getByRole('button', { name: 'Try again' })).toBeEnabled()
    expect(await retries(page), 'a read admits nothing').toEqual([])
    await card(page).getByRole('button', { name: 'Try again' }).click()
    await expect(card(page)).toContainText('Sophia designs this page again from the same report.')
    const sent = await retries(page)
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatch(/^html-retry:4:approval:owner-4:[0-9a-f-]{36}$/)
  })
}

test('design retry · a stale approval is said, with no Try again and nothing sent', async ({ page }) => {
  await page.goto('/room.html?place=work&designcard=on&designretry=stale')
  await expect(card(page)).toHaveAttribute('data-state', 'failed')
  await expect(card(page)).toContainText('Trying again needs a new spend approval from the project owner.')
  await expect(card(page).getByRole('button', { name: 'Try again' })).toHaveCount(0)
  expect(await retries(page)).toEqual([])
})

test('design retry · a closed gate is said, with no Try again and nothing sent', async ({ page }) => {
  await page.goto('/room.html?place=work&designcard=on&designretry=closed')
  await expect(card(page)).toContainText('Trying again needs the project owner to switch research on.')
  await expect(card(page).getByRole('button', { name: 'Try again' })).toHaveCount(0)
  expect(await retries(page)).toEqual([])
})
