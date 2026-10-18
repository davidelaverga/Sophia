import { expect, test, type Page } from '@playwright/test'
import { DRAWN, drawn } from './drawn.ts'

// An admin removes a member from the project (docs/plans/remove-member.md, A29): «Remove» on each other member's row in
// the Invite sheet's «In this project», confirmed in place; the row goes. Every name is synthetic.

const MARCO = '00000000-0000-4000-8000-0000000000b1'
const served = (page: Page) => page.evaluate(() => [...(window.fixture?.served ?? [])])

async function inProject(page: Page, query = '') {
  await page.goto(`/room.html?demo=1${query}`)
  await drawn(page, DRAWN.room)
  await page.getByRole('button', { name: 'Invite' }).first().click()
  const tab = page.getByRole('tab', { name: 'Members' })
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click()
  return page.getByRole('list', { name: 'In this project' })
}

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

test('remove · an admin removes a member after confirming, and the row goes', async ({ page }) => {
  const list = await inProject(page)
  const marco = list.getByRole('listitem').filter({ hasText: 'Marco' })
  await marco.getByRole('button', { name: 'Remove' }).click()
  await expect(marco).toContainText('They leave the project and its call')
  await marco.getByRole('button', { name: 'Remove from project' }).click()
  await expect.poll(() => served(page)).toContain(`remove-member:${MARCO}`)
  await expect(list.getByRole('listitem').filter({ hasText: 'Marco' })).toHaveCount(0)
  await expect(list.getByRole('listitem')).toHaveCount(2)
})

test('remove · confirmed from the keyboard, the focus goes to the list’s heading, never the page (Codex P1 on #356)', async ({
  page,
}) => {
  const list = await inProject(page)
  const marco = list.getByRole('listitem').filter({ hasText: 'Marco' })
  await marco.getByRole('button', { name: 'Remove' }).focus()
  await page.keyboard.press('Enter')
  await marco.getByRole('button', { name: 'Remove from project' }).focus()
  await page.keyboard.press('Enter')
  await expect(list.getByRole('listitem').filter({ hasText: 'Marco' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'In this project' })).toBeFocused()
})

test('remove · your own row offers no Remove; leaving is the project menu’s', async ({ page }) => {
  const list = await inProject(page)
  await expect(
    list.getByRole('listitem').filter({ hasText: '· you' }).getByRole('button', { name: 'Remove' }),
  ).toHaveCount(0)
  await expect(list.getByRole('button', { name: 'Remove' })).toHaveCount(2)
})

test('remove · an editor sees no Remove', async ({ page }) => {
  await page.goto('/room.html?demo=1&role=editor')
  await drawn(page, DRAWN.room)
  await page.getByRole('button', { name: 'Invite' }).first().click()
  await page.getByRole('tab', { name: 'Members' }).click()
  await expect(page.getByRole('list', { name: 'In this project' }).getByRole('button', { name: 'Remove' })).toHaveCount(
    0,
  )
})
