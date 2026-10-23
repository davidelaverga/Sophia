import { expect, test, type Page } from '@playwright/test'

// A link to the project a message is read in opens here (docs/plans/studio-links-in-place.md): its view, what its
// fragment names and its report, in this page, and the call stays. A report open beside the work closes when the link
// names none, and Back opens it again. Another site or another project keeps its new tab.
// Every message and address here is synthetic.

const PROJECT = '00000000-0000-4000-8000-0000000000aa'
const READING = '00000000-0000-4000-8000-0000000000c1'
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

/** Conversations at the first one, with the report open beside them, and a link to this address in its thread. */
async function linkBesideReport(page: Page, address: string) {
  await page.goto(`/room.html?place=conversations&conversations=1&report=${REPORT}#conversation-${READING}`)
  await expect(page.getByRole('complementary', { name: 'Fixture report' })).toBeVisible()
  const open = page.getByRole('region', { name: 'Open conversation' })
  const field = open.getByRole('textbox', { name: 'Continue this question with the team' })
  await field.fill(`Look: ${address}`)
  await field.press('Enter')
  return open.getByRole('link', { name: address }).last()
}

test('in place · beside a report, a link that names none closes it and leaves the address; Back opens it again', async ({
  page,
}) => {
  const report = page.getByRole('complementary', { name: 'Fixture report' })
  const title = page.getByRole('region', { name: 'Open conversation' }).getByRole('heading', { level: 3 })
  await (await linkBesideReport(page, `${HERE}/p/${PROJECT}/conversations#conversation-${BRIEFS}`)).click()
  await expect(title).toHaveText('Short or long briefs?')
  await expect(report).toBeHidden()
  expect(new URL(page.url()).searchParams.has('report')).toBe(false)
  // Back is the address the person was at: the report, beside the conversation they read then.
  await page.goBack()
  await expect(report).toBeVisible()
  const back = new URL(page.url())
  expect(back.searchParams.get('report')).toBe(REPORT)
  expect(back.hash).toBe(`#conversation-${READING}`)
})
