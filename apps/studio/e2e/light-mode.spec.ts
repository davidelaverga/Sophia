import { expect, test } from '@playwright/test'
import { lowContrast } from './contrast.ts'
import { DRAWN, drawn } from './drawn.ts'

// A light mode on the report's paper (docs/plans/light-mode.md, informe-30 §2.5): asked for in the account menu (or by
// a fixture's address), the page's root carries `data-theme="light"`, the room becomes paper, the grain goes, every
// word still reads at 4.5:1 or more, and nothing keeps a dark plane of its own. The choice is kept on the browser;
// «system» follows the system.

const PAGES = [
  ['sign-in', '/signin.html?theme=light', DRAWN.signin],
  ['home', '/home.html?demo=1&theme=light', DRAWN.home],
  ['personal', '/personal.html?demo=1&theme=light', DRAWN.personal],
  ['the room', '/room.html?demo=1&theme=light', DRAWN.room],
  ['Conversations', '/room.html?demo=1&conversations=1&place=conversations&theme=light', DRAWN.conversations],
  ['Tasks', '/room.html?demo=1&place=work&theme=light', DRAWN.tasks],
  ['Knowledge', '/room.html?demo=1&place=knowledge&theme=light', DRAWN.knowledge],
  ['Resources', '/resources.html?theme=light', DRAWN.resources],
] as const

/** The dark room's planes: none may stay under a light page. */
const DARK = ['rgb(5, 4, 8)', 'rgb(11, 10, 15)', 'rgb(18, 17, 24)', 'rgb(12, 11, 17)']

/** In the page: visible boxes still painted with one of the dark room's planes. */
function darkLeft(dark: readonly string[]) {
  return [...document.querySelectorAll<HTMLElement>('body *')]
    .filter((el) => {
      const r = el.getBoundingClientRect()
      return (
        r.width > 0 &&
        r.height > 0 &&
        !el.closest('.fixture-label') &&
        dark.includes(getComputedStyle(el).backgroundColor)
      )
    })
    .map((el) => `${el.tagName.toLowerCase()}.${el.className.split(' ')[0]}`)
    .slice(0, 8)
}

test.afterEach(async ({ page }) => {
  // Each fixture page keeps its own list of requests it didn't expect.
  const unexpected = await page.evaluate(() => [
    ...(window.fixture?.unexpected ?? []),
    ...(window.resourcesFixture?.unexpected ?? []),
  ])
  expect(unexpected).toEqual([])
})

for (const [name, url, parts] of PAGES) {
  test(`light · ${name}: paper, no grain, every word at 4.5:1, no dark plane left`, async ({ page }) => {
    await page.goto(url)
    await drawn(page, parts)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(251, 248, 243)')
    expect(await page.evaluate(() => getComputedStyle(document.body, '::after').display)).toBe('none')
    expect(await page.evaluate(darkLeft, DARK)).toEqual([])
    expect(await lowContrast(page, 'body', '.fixture-label')).toEqual([])
  })
}

test('light · chosen in the account menu, kept on the browser; «system» follows the system', async ({ page }) => {
  await page.goto('/room.html?demo=1')
  await drawn(page, DRAWN.room)
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'light')
  await page.getByRole('button', { name: 'Account' }).click()
  await page.getByRole('menuitemradio', { name: 'Light' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  // A shadow on paper is the ink at a third of its strength: the menu's 0.55 reads 0.19.
  await expect(page.getByRole('menu')).toHaveCSS('box-shadow', /rgba\(29, 27, 34, 0\.19\d*\) 0px 18px 50px 0px/)
  await expect(page.getByRole('menuitemradio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true')
  expect(await page.evaluate(() => localStorage.getItem('sophia.theme'))).toBe('light')
  await page.getByRole('menuitemradio', { name: 'Dark' }).click()
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'light')
  await page.emulateMedia({ colorScheme: 'light' })
  await page.getByRole('menuitemradio', { name: 'Follow the system' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'light')
  // Kept: the next visit opens as chosen.
  await page.reload()
  await drawn(page, DRAWN.room)
  expect(await page.evaluate(() => localStorage.getItem('sophia.theme'))).toBe('system')
})
