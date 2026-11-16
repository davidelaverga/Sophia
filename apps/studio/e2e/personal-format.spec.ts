import { expect, test, type Page } from '@playwright/test'
import { lowContrast } from './contrast.ts'

// Personal reads bold, code and quotes as the room does (docs/plans/personal-replies-formatted.md): her reply and your
// own words drawn as elements, Find marking inside them, Copy writing what is shown. Every word is synthetic.

const PAGE = '/personal.html?formatted=1'
const URL = 'https://example.com/deck'
/** Her answer (`formatted=1`) as it reads: no marks. */
const SHOWN = `Start with the one figure you trust, then run sum Q3 once.\nEverything else can rest on that.\nThe deck is at ${URL}`

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

/** Sends `words` and waits for her formatted answer: her last turn. */
async function answered(page: Page, words = 'Where do I start?') {
  await page.locator('#c-input').fill(words)
  await page.keyboard.press('Enter')
  const hers = page.locator('.msg.sophia:not(.typing)').last()
  await expect(hers.locator('.body')).toContainText('Everything else can rest on that.')
  return hers
}

async function find(page: Page, query: string) {
  await page.locator('#c-input').focus()
  await page.keyboard.press('ControlOrMeta+f')
  await page.locator('#c-find').fill(query)
}

test('format · in Personal, her reply’s **bold**, `code`, quote and address read as such, with no marks to see', async ({
  page,
}) => {
  await page.goto(PAGE)
  const body = (await answered(page)).locator('.body')
  await expect(body.locator('strong')).toHaveText('the one figure')
  await expect(body.locator('code.msg-code')).toHaveText('sum Q3')
  await expect(body.locator('.msg-quote')).toHaveText('Everything else can rest on that.')
  await expect(body.getByRole('link', { name: URL })).toHaveAttribute('href', URL)
  expect(await body.innerText()).toBe(SHOWN)
})

test('format · in Personal, your own **bold** and `code` read as such', async ({ page }) => {
  await page.goto(PAGE)
  await page.locator('#c-input').fill('I said **Friday**, not `Thursday`')
  await page.keyboard.press('Enter')
  const mine = page.locator('.msg.me .body').last()
  await expect(mine.locator('strong')).toHaveText('Friday')
  await expect(mine.locator('code.msg-code')).toHaveText('Thursday')
  await expect(mine).toHaveText('I said Friday, not Thursday')
})

test('format · in Personal, Find marks inside bold, and a match across its edge is one match', async ({ page }) => {
  await page.goto(PAGE)
  const body = (await answered(page)).locator('.body')
  await find(page, 'figure')
  await expect(page.locator('.c3-find-count')).toHaveText('1 of 1')
  await expect(body.locator('strong mark.current')).toHaveText('figure')
  await find(page, 'one figure you')
  await expect(page.locator('.c3-find-count')).toHaveText('1 of 1')
  // Cut at the bold's edge: two marks, one match, both current.
  await expect(body.locator('mark.current')).toHaveText(['one figure', ' you'])
  await expect(body.locator('strong mark')).toHaveText('one figure')
  // Inside code, and in a quote.
  await find(page, 'Q3')
  await expect(body.locator('code.msg-code mark.current')).toHaveText('Q3')
  await find(page, 'everything else')
  await expect(body.locator('.msg-quote mark.current')).toHaveText('Everything else')
  // The marks never show as words.
  await find(page, '**')
  await expect(page.locator('.c3-find-count')).toHaveText('No match')
})

test('format · in Personal, Copy on her reply writes what it says, not its marks', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto(PAGE)
  const hers = await answered(page)
  await hers.hover()
  await hers.getByRole('button', { name: 'Copy' }).click()
  await expect(hers.getByRole('button', { name: 'Copied' })).toBeVisible()
  // Windows' clipboard hands lines back with CR LF: the words are what is compared.
  const copied = await page.evaluate(() => navigator.clipboard.readText())
  expect(copied.replaceAll('\r\n', '\n')).toBe(SHOWN)
})

for (const scheme of ['dark', 'light'] as const) {
  test(`format · in Personal, code and quotes are readable in ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(`${PAGE}&theme=${scheme}`)
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme ?? 'dark')).toBe(scheme)
    await answered(page, 'Run `sum` **now**\n> as I said')
    await expect(page.locator('.msg.me .msg-quote')).toHaveText('as I said')
    expect(await lowContrast(page, '.msg.me:has(.msg-code) .body')).toEqual([])
    expect(await lowContrast(page, '.msg.sophia:has(.msg-code) .body')).toEqual([])
  })
}

test('@phone · format · in Personal, a formatted reply fits the phone’s column', async ({ page }) => {
  await page.goto(PAGE)
  const body = (await answered(page)).locator('.body')
  await expect(body.locator('code.msg-code')).toBeVisible()
  const fit = await body.evaluate((el) => {
    const box = el.getBoundingClientRect()
    const inside = [...el.querySelectorAll('strong, code, .msg-quote, a')].every((part) =>
      [...part.getClientRects()].every((r) => r.left >= box.left - 0.5 && r.right <= box.right + 0.5),
    )
    return { inside, over: el.scrollWidth - el.clientWidth, page: document.documentElement.scrollWidth - innerWidth }
  })
  expect(fit).toEqual({ inside: true, over: 0, page: 0 })
})
