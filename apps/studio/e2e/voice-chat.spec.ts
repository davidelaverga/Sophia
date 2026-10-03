import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

// A result's card in the chat of a member who hears Sophia (CX-0022), on the fixture page: the Studio's own
// ProjectShell over the fixture report and its research task (fixtures/report-data.ts). Only the API and LiveKit are
// faked; each check ends by asking the page whether anything reached for the API beyond what it answers.

const V2 = '00000000-0000-4000-8000-0000000000d2'
const IN_CALL = '/room.html?call=on&exchange=open'
const SECOND = 'The second version of a labelled fixture report, published while the first was read.'

const fixture = (page: Page) =>
  page.evaluate(() => {
    const view = window.fixture
    if (!view) throw new Error('the fixture page did not start')
    return { asked: [...view.asked], served: [...view.served], unexpected: [...view.unexpected] }
  })
const asked = async (page: Page) => (await fixture(page)).asked
const leave = (page: Page) => page.getByRole('button', { name: 'Leave the room' })
const pane = (page: Page) => page.getByRole('complementary', { name: 'Fixture report' })
const cards = (page: Page) => page.getByRole('group', { name: 'Research report ready' })
const chatToggle = (page: Page) => page.getByRole('button', { name: 'Chat', exact: true })
const marked = (page: Page) => page.getByRole('button', { name: 'Chat, something new', exact: true })

/** Opens the page in a call, by voice: connected, the microphone arrived, and Sophia was told this person hears her. */
async function enterByVoice(page: Page, url = IN_CALL) {
  await page.goto(url)
  await expect(leave(page)).toBeAttached()
  await expect.poll(() => asked(page)).toContain('microphone:on')
  const said = await asked(page)
  expect(said).toContain('text:off')
  expect(said).not.toContain('text:on')
}

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect((await fixture(page)).unexpected, 'requests the fixture did not expect').toEqual([])
})

test('CX-0022 · a member who hears Sophia gets one card for a revised result, opening and saving its current version', async ({
  page,
}) => {
  await enterByVoice(page)
  // Chat is closed while the result is told, then revised.
  await page.evaluate(() => window.fixture?.notice())
  await page.evaluate(() => window.fixture?.noticeRevised())
  await marked(page).click()
  await expect(cards(page)).toHaveCount(1) // one card per task: the older one would open the newer files

  const download = page.waitForEvent('download')
  await cards(page).getByRole('button', { name: 'Download', exact: true }).click()
  const saved = await (await download).path()
  expect(await readFile(saved, 'utf8')).toContain(SECOND)

  await cards(page).getByRole('button', { name: 'Open', exact: true }).click()
  await expect(pane(page).getByText(SECOND)).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`version=${V2}`))

  // Chat closed and opened again still has the card, once.
  await pane(page).getByRole('button', { name: 'Close', exact: true }).click()
  await chatToggle(page).click()
  await expect(cards(page)).toHaveCount(1)
  await chatToggle(page).click()
  await page.evaluate(() => window.fixture?.noticeRevised()) // the bridge sends it again after a mode signal
  await expect(marked(page)).toHaveCount(0) // a repeat is not something new
  await chatToggle(page).click()
  await expect(cards(page)).toHaveCount(1)
})

test('CX-0022 · until the task is read, the card’s Open and Download keep the focus but do nothing (aria-disabled)', async ({
  page,
}) => {
  await enterByVoice(page, `${IN_CALL}&hold=task`)
  await page.evaluate(() => window.fixture?.notice())
  await marked(page).click()
  const open = cards(page).getByRole('button', { name: 'Open', exact: true })
  const save = cards(page).getByRole('button', { name: 'Download', exact: true })
  await expect.poll(async () => (await fixture(page)).served).toContain('task:1') // the read is on its way
  for (const button of [open, save]) {
    await expect(button).toHaveAttribute('aria-disabled', 'true')
    await expect(button).not.toHaveAttribute('disabled')
  }
  // Pressed from the keyboard (a pointer is refused by the check itself, as it refuses aria-disabled buttons).
  await save.focus()
  await page.keyboard.press('Enter')
  await open.focus()
  await page.keyboard.press('Enter')
  await expect(open).toBeFocused() // a press that does nothing keeps the focus
  await expect(pane(page)).toHaveCount(0)
  await expect(cards(page).getByRole('status')).toHaveText('')

  await page.evaluate(() => window.fixture?.releaseTask())
  await expect(open).not.toHaveAttribute('aria-disabled')
  await expect(save).not.toHaveAttribute('aria-disabled')
  await open.click()
  await expect(pane(page)).toBeVisible()
})

test('CX-0022 · every join says its mode to Sophia, the hello after which the bridge sends the cards again', async ({
  page,
}) => {
  await enterByVoice(page)
  const hellos = async () => (await asked(page)).filter((a) => a === 'text:off').length
  const before = await hellos()
  await page.evaluate(() => window.fixture?.drop())
  await page.getByRole('button', { name: /^Try again/ }).click()
  await expect(leave(page)).toBeAttached()
  await expect.poll(hellos).toBe(before + 1)
})
