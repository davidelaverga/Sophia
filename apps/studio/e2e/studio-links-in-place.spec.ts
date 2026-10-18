import { expect, test, type Page } from '@playwright/test'

// A link to the project a message is read in opens here (docs/plans/studio-links-in-place.md): its view, what its
// fragment names and its report, in this page, and the call stays. Another site or another project keeps its new tab.
// Every message and address here is synthetic.

const PROJECT = '00000000-0000-4000-8000-0000000000aa'
const BRIEFS = '00000000-0000-4000-8000-0000000000c2'
const REPORT = '00000000-0000-4000-8000-0000000000b1'
const HERE = 'http://127.0.0.1:5199'
const discussion = (page: Page) => page.getByRole('list', { name: 'Recent discussion' })
const viewLink = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Project views' }).getByRole('link', { name })

async function linkInChat(page: Page, address: string) {
  await page.goto('/room.html?call=on&conversations=1')
  await expect(page.getByRole('button', { name: 'Leave the room' })).toBeVisible()
  await page.getByRole('button', { name: /^Chat/ }).first().click()
  await page.evaluate((text) => window.fixture?.say(text), `Look: ${address}`)
  return discussion(page).getByRole('link', { name: address })
}

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== HERE,
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

test('in place · a conversation’s link in the room’s chat opens it here, and the call stays', async ({ page }) => {
  const link = await linkInChat(page, `${HERE}/p/${PROJECT}/conversations#conversation-${BRIEFS}`)
  await expect(link).not.toHaveAttribute('target', /.*/)
  await link.click()
  await expect(viewLink(page, 'Conversations')).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('region', { name: 'Open conversation' }).getByRole('heading', { level: 3 })).toHaveText(
    'Short or long briefs?',
  )
  const dock = page.getByRole('group', { name: 'Project room' })
  await expect(dock.getByRole('button', { name: 'Leave the room' })).toBeVisible()
  expect(page.context().pages()).toHaveLength(1)
})

test('in place · a report’s link opens it in the viewer, here', async ({ page }) => {
  const link = await linkInChat(page, `${HERE}/p/${PROJECT}/knowledge?report=${REPORT}`)
  await link.click()
  await expect(viewLink(page, 'Knowledge')).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('complementary', { name: 'Fixture report' })).toBeVisible()
  expect(page.context().pages()).toHaveLength(1)
})

test('in place · a link to another site or another project keeps its new tab', async ({ page }) => {
  for (const address of ['https://example.com/deck', `${HERE}/p/00000000-0000-4000-8000-0000000000ab/goals`]) {
    const link = await linkInChat(page, address)
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  }
})
