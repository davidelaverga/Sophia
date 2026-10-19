// What changed since you last looked, in Sophia's sentence on Home (docs/plans/home-since-you-looked.md): read for the
// projects Home shows, only what someone else did, said once per line, project, account and device, as a polite status
// with Open Updates, and only as a visit begins, so nothing under the greeting moves. Its fixture page renders the
// Studio's own Welcome over labelled projects and answers A34's windows (fixtures/home.tsx, `since=…`).
import { expect, test, type Page } from '@playwright/test'

const QUIET = '/home.html?projects=quiet'
const id = (n: number) => `00000000-0000-4000-8000-00000000000${String(n)}`
const pressed = (page: Page) => page.evaluate(() => window.homeFixture?.pressed ?? [])
const reads = (page: Page) => page.evaluate(() => window.homeFixture?.sinceReads() ?? [])
/**
 * The projects whose window was read, once each. The fixture page runs under StrictMode, whose second mount reads again
 * what the first let go (the reads pass their abort signal), so the reads themselves are counted only between moments.
 */
const asked = async (page: Page) => [...new Set(await reads(page))].toSorted()
const SHOWN = [1, 2, 3].map(id)
const rows = (page: Page) => page.getByRole('list', { name: 'Your projects' }).getByRole('listitem')
/** Her sentence's polite status under the greeting, mounted all along so that news is announced as it comes. */
const news = (page: Page) => page.locator('.hw-head').getByRole('status')
const SOME = 'Since you last looked: 2 decisions and a new report in Launch plan. Open Updates'
const ONE_MORE = 'Since you last looked: a decision in Launch plan. Open Updates'
/** Layout offsets of the greeting and of «You and Sophia», as home.spec.ts measures them, not painted boxes. */
const offsets = (page: Page) =>
  page
    .locator('.hw-hello, .hw-you')
    .evaluateAll((els) => els.map((el) => (el instanceof HTMLElement ? el.offsetTop : null)))

/** The windows were asked for and have answered: whatever the visit will do with them, it has done by now. */
async function answered(page: Page, ids: readonly string[]) {
  await expect.poll(() => asked(page)).toEqual(ids)
  await page.waitForTimeout(400)
}

/** Home left for another place and arrived at again, as going to Work and back does. */
async function again(page: Page) {
  await page.getByRole('button', { name: 'Leave Home' }).click()
  await page.getByRole('button', { name: 'Back to Home' }).click()
  await expect(rows(page)).toHaveCount(4)
}

test('home · the first arrival reads, moving nothing; the next says it from its first frame, a status with Open Updates', async ({
  page,
}) => {
  await page.goto(`${QUIET}&since=some`)
  await expect(rows(page)).toHaveCount(4)
  const drawn = await offsets(page)
  // One read for each project Home shows; none for Product launch, fourth, whose note kept Home doesn't show. They come
  // back after Home was drawn, so nothing is said, and nothing moves.
  await answered(page, SHOWN)
  await expect(news(page)).toHaveText('')
  expect(await offsets(page)).toEqual(drawn)
  await page.getByRole('button', { name: 'Leave Home' }).click()
  await page.getByRole('button', { name: 'Back to Home' }).click()
  // In the frame Home comes back in, not after a read.
  expect(await news(page).textContent()).toBe(SOME)
  await expect(news(page).locator('strong')).toHaveText('Launch plan')
  // Said, not focused: the focus stays on the press that came back.
  await expect(page.getByRole('button', { name: 'Leave Home' })).toBeFocused()
  const said = await offsets(page)
  await page.waitForTimeout(400)
  expect(await offsets(page)).toEqual(said)
  await news(page).getByRole('button', { name: 'Open Updates' }).click()
  expect(await pressed(page)).toEqual([`updates ${id(1)}`])
})

test('home · said once: not on the way back to Home, nor after a reload; one more decision is said alone', async ({
  page,
}) => {
  await page.goto(`${QUIET}&since=some`)
  await answered(page, SHOWN)
  await again(page)
  await expect(news(page)).toHaveText(SOME)
  const before = (await reads(page)).length
  // Back on Home within 20 s: nothing is read again, and what was said is not said again.
  await again(page)
  await page.waitForTimeout(400)
  await expect(news(page)).toHaveText('')
  expect(await reads(page)).toHaveLength(before)
  // A reload reads the same windows again: this device kept what was said.
  await page.reload()
  await answered(page, SHOWN)
  await again(page)
  await expect(news(page)).toHaveText('')
  // One more decision since: only it is new.
  await page.goto(`${QUIET}&since=more`)
  await answered(page, SHOWN)
  await again(page)
  await expect(news(page)).toHaveText(ONE_MORE)
})

test('home · what the person did is never news to them: their decision, their report, a note in their name', async ({
  page,
}) => {
  // Launch plan's window holds the reader's decision, the report they asked for, a note Sophia kept in their turn, and
  // one decision of Marco's: only his is said.
  await page.goto(`${QUIET}&since=mine`)
  await answered(page, SHOWN)
  await again(page)
  await expect(news(page)).toHaveText(ONE_MORE)
})

test('home · a call ended with Home open says nothing, then or after: what it held was in front of them', async ({
  page,
}) => {
  await page.goto(`${QUIET}&since=some&call=${id(1)}`)
  await expect(page.locator('.hw-says')).toHaveText('You’re in Launch plan’s room.')
  await page.waitForTimeout(400)
  expect(await reads(page)).toEqual([])
  // The call ends with Home open, as Leave in the bar ends it: its project is read once, and the rows for the next
  // arrival. Nothing comes into Sophia's place.
  await page.evaluate(() => window.homeFixture?.hangUp())
  await expect(page.locator('.hw-says')).toHaveCount(0)
  await answered(page, SHOWN)
  await expect(news(page)).toHaveText('')
  // The next arrival: what Launch plan held when the call ended is not news.
  await again(page)
  await expect(news(page)).toHaveText('')
  // One more decision since the call: that is.
  await page.goto(`${QUIET}&since=more`)
  await answered(page, SHOWN)
  await again(page)
  await expect(news(page)).toHaveText(ONE_MORE)
})

test('home · a call whose read after it failed says nothing once the service is back: the next read is kept (Codex P2 on #468)', async ({
  page,
}) => {
  // `sinceFail=1`: the read as the call ends is the page's first, and the service is away for it.
  await page.goto(`${QUIET}&since=some&call=${id(1)}&sinceFail=1`)
  await expect(page.locator('.hw-says')).toHaveText('You’re in Launch plan’s room.')
  await page.evaluate(() => window.homeFixture?.hangUp())
  await answered(page, SHOWN)
  await expect(news(page)).toHaveText('')
  // Back, the next arrival reads Launch plan again and says nothing: what it held was the call's.
  await again(page)
  await expect.poll(async () => (await reads(page)).filter((p) => p === id(1))).toHaveLength(2)
  await page.waitForTimeout(400)
  await expect(news(page)).toHaveText('')
  // Nor the one after, now that Launch plan's window is on the page.
  await again(page)
  await expect(news(page)).toHaveText('')
  // One more decision since the call: that is.
  await page.goto(`${QUIET}&since=more`)
  await answered(page, SHOWN)
  await again(page)
  await expect(news(page)).toHaveText(ONE_MORE)
})

test('home · a call ended out of Home whose read failed is read again once online, and Home says nothing of it', async ({
  page,
}) => {
  await page.goto(`${QUIET}&since=some&call=${id(1)}&sinceFail=1&away=1`)
  await page.evaluate(() => window.homeFixture?.hangUp())
  await expect.poll(() => reads(page)).toEqual([id(1)])
  // The browser is online again: the call's project is read again, once, and Home reads nothing out of sight.
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect.poll(() => reads(page)).toEqual([id(1), id(1)])
  await page.getByRole('button', { name: 'Back to Home' }).click()
  await answered(page, SHOWN)
  await expect(news(page)).toHaveText('')
  await again(page)
  await expect(news(page)).toHaveText('')
})

test('home · a call’s project Home doesn’t show, whose read failed, is read as Home is arrived at; what came after is said once shown', async ({
  page,
}) => {
  // Product launch, fourth, isn't among Home's rows. Its call ends out of Home and the read after it fails, while the
  // browser stays online: no `online` comes.
  const productLaunch = async () => (await reads(page)).filter((p) => p === id(4))
  await page.goto(`${QUIET}&since=some&call=${id(4)}&sinceFail=1&away=1`)
  await page.evaluate(() => window.homeFixture?.hangUp())
  await expect.poll(() => reads(page)).toEqual([id(4)])
  // The service is back. Arriving on Home reads it once more, beside Home's own rows; the next arrival reads it no more.
  await page.getByRole('button', { name: 'Back to Home' }).click()
  await expect.poll(productLaunch).toHaveLength(2)
  await answered(page, [...SHOWN, id(4)])
  await again(page)
  await expect(news(page)).toHaveText(SOME)
  expect(await productLaunch()).toHaveLength(2)
  // Later, Marco kept one more note there, and Design review was archived, so Product launch is among Home's rows: the
  // note kept after the call is said, the one the call held is not.
  await page.goto('/home.html?projects=fewer&since=later')
  await answered(page, [1, 2, 4].map(id))
  await page.getByRole('button', { name: 'Leave Home' }).click()
  await page.getByRole('button', { name: 'Back to Home' }).click()
  await expect(news(page)).toHaveText('Since you last looked: a note kept in Product launch. Open Updates')
})

test('home · under a session soon it waits, unsaid, even as the session passes with Home open; nothing after a seen mark', async ({
  page,
}) => {
  await page.goto('/home.html?projects=four&since=some')
  await answered(page, [1, 2, 4].map(id))
  await again(page)
  await expect(page.locator('.hw-says')).toHaveText('Standup in Product launch starts in 10 min.')
  await expect(news(page)).toHaveText('')
  const covered = await offsets(page)
  // The session passes with Home open (the projects read again): the news doesn't come in mid-visit.
  await page.evaluate(() => window.homeFixture?.reread('quiet'))
  await expect(page.locator('.hw-says')).toHaveCount(0)
  await page.waitForTimeout(400)
  await expect(news(page)).toHaveText('')
  expect(await offsets(page)).toEqual(covered)
  // Not said, so not kept: the next arrival says it.
  await again(page)
  await expect(news(page)).toHaveText(SOME)
  // Marked as seen: the windows after the mark hold nothing to say.
  await page.goto(`${QUIET}&since=seen`)
  await answered(page, SHOWN)
  await again(page)
  await expect(news(page)).toHaveText('')
})
