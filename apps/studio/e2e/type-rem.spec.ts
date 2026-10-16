import { expect, test, type Page } from '@playwright/test'

// The type scale in rem (docs/plans/type-rem.md): at the browser's own size nothing moves; a person who asks their
// browser for larger text gets the scale's text, and its leading, larger with it. The root's size stands in for that
// setting, as rem reads it.

const SIZES = ['--type-view', '--type-head', '--type-title', '--type-body', '--type-small', '--type-label']
const LEADINGS = ['--lh-small', '--lh-body', '--lh-head', '--lh-view']

/** Each token as the page draws it, in px, with the root at `root` (empty: the browser's own): a probe takes it. */
const drawnAs = (page: Page, root: string) =>
  page.evaluate(
    ({ sizes, leadings, size }) => {
      document.documentElement.style.fontSize = size
      const probe = document.createElement('span')
      document.body.append(probe)
      const read = (prop: 'fontSize' | 'lineHeight', token: string) => {
        probe.style[prop] = `var(${token})`
        return parseFloat(getComputedStyle(probe)[prop])
      }
      const drawn = {
        sizes: sizes.map((t) => read('fontSize', t)),
        leadings: leadings.map((t) => read('lineHeight', t)),
      }
      probe.remove()
      return drawn
    },
    { sizes: SIZES, leadings: LEADINGS, size: root },
  )

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
  await page.goto('/room.html')
})

test('type · at the browser’s own size the scale is as it was: 28 to 10.5 px, on 16 to 32', async ({ page }) => {
  expect(await drawnAs(page, '')).toEqual({ sizes: [28, 15, 14, 13, 12, 10.5], leadings: [16, 20, 24, 32] })
})

test('type · asked for larger text (125 %), the scale and its leading grow with it, the page’s words too', async ({
  page,
}) => {
  expect(await drawnAs(page, '125%')).toEqual({
    sizes: [35, 18.75, 17.5, 16.25, 15, 13.125],
    leadings: [20, 25, 30, 40],
  })
  expect(await page.evaluate(() => getComputedStyle(document.body).fontSize)).toBe('16.25px')
})
