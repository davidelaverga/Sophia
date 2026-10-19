// What changed since you last looked, in Sophia's sentence on Home (docs/plans/home-since-you-looked.md): read for the
// projects Home shows, said once per window, project, account and device, as a polite status with Open Updates. Its
// fixture page renders the Studio's own Welcome over labelled projects and answers A34's windows (fixtures/home.tsx,
// `since=…`).
import { expect, test, type Page } from '@playwright/test'

const QUIET = '/home.html?projects=quiet'
const id = (n: number) => `00000000-0000-4000-8000-00000000000${String(n)}`
const pressed = (page: Page) => page.evaluate(() => window.homeFixture?.pressed ?? [])
const reads = (page: Page) => page.evaluate(() => window.homeFixture?.sinceReads() ?? [])
const rows = (page: Page) => page.getByRole('list', { name: 'Your projects' }).getByRole('listitem')
/** Her sentence's polite status under the greeting, mounted all along so that news is announced as it comes. */
const news = (page: Page) => page.locator('.hw-head').getByRole('status')
const SOME = 'Since you last looked: 2 decisions and a new report in Launch plan. Open Updates'

/** The windows were asked for and have answered: whatever the visit will say, it has said by now. */
async function answered(page: Page, count: number) {
  await expect.poll(() => reads(page)).toHaveLength(count)
  await page.waitForTimeout(400)
}

test('home · what changed since you last looked is said as a status, with Open Updates to that project', async ({
  page,
}) => {
  await page.goto(`${QUIET}&since=some`)
  await expect(news(page)).toHaveText(SOME)
  await expect(news(page).locator('strong')).toHaveText('Launch plan')
  // Said, not focused: the focus stays where the page left it.
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true)
  // One read for each project Home shows; none for Product launch, fourth, whose note kept Home doesn't show.
  expect((await reads(page)).toSorted()).toEqual([id(1), id(2), id(3)])
  await news(page).getByRole('button', { name: 'Open Updates' }).click()
  expect(await pressed(page)).toEqual([`updates ${id(1)}`])
})

test('home · said once: not on the way back to Home, nor after a reload; a new window is news again', async ({
  page,
}) => {
  await page.goto(`${QUIET}&since=some`)
  await expect(news(page)).toHaveText(SOME)
  // Back on Home within 20 s: nothing is read again, and what was said is not said again.
  await page.getByRole('button', { name: 'Leave Home' }).click()
  await page.getByRole('button', { name: 'Back to Home' }).click()
  await expect(rows(page)).toHaveCount(4)
  await page.waitForTimeout(400)
  await expect(news(page)).toHaveText('')
  expect(await reads(page)).toHaveLength(3)
  // A reload reads the same windows again: this device remembers they were said.
  await page.reload()
  await answered(page, 3)
  await expect(news(page)).toHaveText('')
  // One more decision since: a new window, said.
  await page.goto(`${QUIET}&since=more`)
  await expect(news(page)).toHaveText(
    'Since you last looked: 3 decisions and a new report in Launch plan. Open Updates',
  )
})

test('home · nothing after a seen mark; nothing read in a call; under a session soon the news waits, unsaid', async ({
  page,
}) => {
  // Marked as seen: the windows after the mark hold nothing to say.
  await page.goto(`${QUIET}&since=seen`)
  await answered(page, 3)
  await expect(news(page)).toHaveText('')
  // In a call its sentence stands, and nothing is read.
  await page.goto(`${QUIET}&since=some&call=${id(2)}`)
  await expect(page.locator('.hw-says')).toHaveText('You’re in Research notes’s room.')
  await page.waitForTimeout(400)
  expect(await reads(page)).toEqual([])
  // The Standup in 10 min is Sophia's sentence; the news isn't said, so it isn't kept as said.
  await page.goto('/home.html?projects=four&since=some')
  await expect(page.locator('.hw-says')).toHaveText('Standup in Product launch starts in 10 min.')
  await answered(page, 3)
  await expect(news(page)).toHaveText('')
  await page.goto(`${QUIET}&since=some`)
  await expect(news(page)).toHaveText(SOME)
})
