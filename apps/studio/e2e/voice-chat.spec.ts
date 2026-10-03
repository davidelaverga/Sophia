import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import type { ChatCaption } from '@sophia/contracts/room-chat'

// A result's card in the chat of a member who hears Sophia (CX-0022), and live captions (CX-0023), on the fixture page: the Studio's own
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

test('HTML · a research card saves its HTML page once the task is read; until then it keeps the focus and saves nothing', async ({
  page,
}) => {
  const downloads: string[] = []
  page.on('download', (d) => downloads.push(d.suggestedFilename()))
  await enterByVoice(page, `${IN_CALL}&hold=task`)
  await page.evaluate(() => window.fixture?.notice())
  await marked(page).click()
  const html = cards(page).getByRole('button', { name: 'Download HTML page', exact: true })
  await expect(html).toHaveText('HTML page')
  await expect.poll(async () => (await fixture(page)).served).toContain('task:1') // the read is on its way
  await expect(html).toHaveAttribute('aria-disabled', 'true')
  await expect(html).not.toHaveAttribute('disabled')
  await html.focus()
  await page.keyboard.press('Enter')
  await expect(html).toBeFocused() // a press that does nothing keeps the focus
  await expect(cards(page).getByRole('status')).toHaveText('')
  expect((await fixture(page)).served.filter((s) => s.startsWith('versions:'))).toEqual([]) // nothing was printed

  await page.evaluate(() => window.fixture?.releaseTask())
  await expect(html).not.toHaveAttribute('aria-disabled')
  const download = page.waitForEvent('download')
  await html.click()
  const saved = await download
  expect(saved.suggestedFilename()).toBe('fixture-report-v1.html') // the report's slug and the Markdown's version
  const text = await readFile(await saved.path(), 'utf8')
  expect(text).toMatch(/^<!doctype html>/)
  expect(text).toContain('The first version of a labelled fixture report.')
  await expect(cards(page).getByRole('status')).toHaveText(/^Downloading fixture-report-v1\.html · /)
  expect(downloads).toEqual(['fixture-report-v1.html']) // the press before the read saved nothing
})

test('HTML · a brief’s card offers no HTML page: the page is a research report’s', async ({ page }) => {
  await enterByVoice(page)
  await page.evaluate(() => window.fixture?.noticeBrief())
  await marked(page).click()
  const brief = page.getByRole('group', { name: 'Brief ready' })
  // The task is read, so an HTML page, were it offered, would be there by now.
  await expect(brief.getByRole('button', { name: 'Download', exact: true })).not.toHaveAttribute('aria-disabled')
  await expect(brief.getByRole('button', { name: 'Download HTML page', exact: true })).toHaveCount(0)
  await expect(cards(page)).toHaveCount(0)
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

// Live captions (CX-0023): synthetic caption packets, as the bridge sends what is said aloud, reach the fixture page's
// real room controller and chat. Nothing here is a transcript of anyone.
const ME = '00000000-0000-4000-8000-0000000000a1'
const TEAMMATE = '00000000-0000-4000-8000-0000000000a2'
const SPOKEN_EXCHANGE = '00000000-0000-4000-8000-0000000000e1'
const caption = (id: string, sequence: number, state: ChatCaption['state'], text: string, over = {}): ChatCaption => ({
  kind: 'caption',
  id: `00000000-0000-4000-8000-0000000000${id}`,
  exchangeId: SPOKEN_EXCHANGE,
  speaker: 'member',
  actorId: ME,
  sequence,
  state,
  text,
  ...over,
})
const SOPHIA = { speaker: 'sophia', actorId: null } as const
const say = (page: Page, ...packets: ChatCaption[]) =>
  page.evaluate((list) => {
    for (const p of list) window.fixture?.caption(p)
  }, packets)
const conversation = (page: Page) => page.getByRole('list', { name: 'Conversation with Sophia' })
const lines = (page: Page) => conversation(page).getByRole('listitem')
const messageBar = (page: Page) => page.getByRole('textbox', { name: 'Message Sophia', exact: true })

test('CX-0023 · while people talk the chat updates: partials, then the final, in order, once, and cut-offs marked', async ({
  page,
}) => {
  await enterByVoice(page)
  // Said while Chat is closed: there when it opens, and Chat is not marked (voice is heard live).
  await say(page, caption('c1', 1, 'partial', 'Synthetic words'))
  await expect(chatToggle(page)).toBeVisible()
  await expect(marked(page)).toHaveCount(0)
  await chatToggle(page).click()
  await expect(lines(page)).toHaveCount(1)
  const mine = lines(page).nth(0)
  await expect(mine).toContainText('You')
  await expect(mine).toContainText('Spoken')
  await expect(mine).toContainText('Synthetic words')
  await expect(mine.getByText('Synthetic words')).toHaveAttribute('aria-hidden', 'true') // still being said
  await say(page, caption('c1', 2, 'partial', ' as they come'), caption('c1', 3, 'final', ''))
  await expect(mine.getByText('Synthetic words as they come')).not.toHaveAttribute('aria-hidden')
  await expect(conversation(page)).toMatchAriaSnapshot(`
    - listitem:
      - strong: You
      - text: Spoken
      - paragraph: Synthetic words as they come
  `)

  // Sophia's reply, its fragments repeated and out of order, then cut off.
  await say(
    page,
    caption('c2', 1, 'partial', 'Sophia answers', SOPHIA),
    caption('c2', 1, 'partial', 'Sophia answers', SOPHIA),
    caption('c2', 3, 'partial', ' at last', SOPHIA),
    caption('c2', 2, 'partial', ' slowly', SOPHIA),
    caption('c2', 4, 'interrupted', '', SOPHIA),
  )
  const reply = lines(page).nth(1)
  await expect(reply).toContainText('Sophia')
  await expect(reply.getByText('Sophia answers slowly at last')).toBeVisible()
  await expect(reply.getByText('Cut off')).toBeVisible()

  // Words transcribed after her next reply began go before it; a teammate's are theirs.
  await say(page, caption('c3', 1, 'partial', 'Her next reply', SOPHIA))
  await say(
    page,
    caption('c4', 1, 'final', 'A teammate asked first', {
      actorId: TEAMMATE,
      before: caption('c3', 1, 'final', '').id,
    }),
  )
  await expect(lines(page)).toHaveCount(4)
  await expect(lines(page).nth(2)).toContainText('A memberSpokenA teammate asked first')
  await expect(lines(page).nth(3)).toContainText('Her next reply')

  // A result's card after what was said comes after it; closing and opening Chat keeps everything.
  await page.evaluate(() => window.fixture?.notice())
  await expect(lines(page).nth(4).getByRole('group', { name: 'Research report ready' })).toBeVisible()
  await chatToggle(page).click()
  await chatToggle(page).click()
  await expect(lines(page)).toHaveCount(5)
  await expect(lines(page).nth(1)).toContainText('Sophia answers slowly at last')
})

test('CX-0023 · switching to text and back keeps what was said; a typed message still goes, and no caption is sent back', async ({
  page,
}) => {
  await enterByVoice(page)
  await say(page, caption('d1', 1, 'final', 'Said before typing'))
  await chatToggle(page).click()
  await messageBar(page).fill('A question, typed')
  await messageBar(page).press('Enter') // typing to Sophia puts the call in text mode
  const textMode = page.getByRole('button', { name: /^Text mode/ })
  await expect(textMode).toHaveAttribute('aria-pressed', 'true')
  await say(page, caption('d2', 1, 'final', 'A teammate, aloud', { actorId: TEAMMATE }))
  await textMode.click()
  await expect(textMode).toHaveCount(0)
  await expect(lines(page)).toHaveCount(3)
  await expect(lines(page).nth(0)).toContainText('Said before typing')
  await expect(lines(page).nth(1)).toContainText('A question, typed')
  await expect(lines(page).nth(2)).toContainText('A teammate, aloud')
  expect((await asked(page)).filter((a) => a === 'chat')).toEqual(['chat'])
})

test('CX-0023 · a call that drops cuts off what was still being said; joining again keeps the captions', async ({
  page,
}) => {
  await enterByVoice(page)
  await say(page, caption('e1', 1, 'final', 'Said in full', SOPHIA), caption('e2', 1, 'partial', 'Half a', SOPHIA))
  await page.evaluate(() => window.fixture?.drop())
  await page.getByRole('button', { name: /^Try again/ }).click()
  await expect(leave(page)).toBeAttached()
  await chatToggle(page).click()
  await expect(lines(page)).toHaveCount(2)
  await expect(lines(page).nth(0).getByText('Cut off')).toHaveCount(0)
  await expect(lines(page).nth(1)).toContainText('Half a')
  await expect(lines(page).nth(1).getByText('Cut off')).toBeVisible()
  // She went on talking while this page was away: the cut-off was this page's own, and her words take it back.
  await say(page, caption('e2', 3, 'partial', ' sentence', SOPHIA))
  await expect(lines(page).nth(1).getByText('Cut off')).toHaveCount(0)
  await expect(lines(page).nth(1).getByText('Half a … sentence')).toHaveAttribute('aria-hidden', 'true')
  await say(page, caption('e2', 4, 'final', '', SOPHIA))
  await expect(lines(page).nth(1).getByText('Half a … sentence')).not.toHaveAttribute('aria-hidden')
  await expect(lines(page).nth(1).getByText('Cut off')).toHaveCount(0)
})

test('CX-0023 · Sophia leaving the room cuts off what she was still saying, and its words reach screen readers', async ({
  page,
}) => {
  await enterByVoice(page)
  await say(page, caption('f1', 1, 'partial', 'A reply she never finished', SOPHIA), caption('f2', 1, 'final', 'Done'))
  await chatToggle(page).click()
  const reply = lines(page).nth(0)
  await expect(reply.getByText('A reply she never finished')).toHaveAttribute('aria-hidden', 'true')
  await page.evaluate(() => window.fixture?.sophiaLeaves())
  await expect(reply.getByText('Cut off')).toBeVisible()
  await expect(reply.getByText('A reply she never finished')).not.toHaveAttribute('aria-hidden')
  await expect(lines(page).nth(1).getByText('Cut off')).toHaveCount(0)
  await expect(leave(page)).toBeAttached()
})
