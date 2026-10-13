// The sign-in's three levels (docs/plans/signin-hierarchy.md): the note under the form at the label size, under a lede
// at the text size; «Check your email» in a line and a note; and a wrong code said on its field, as a wrong address is.
import { expect, test, type Page } from '@playwright/test'
import { typeSizes } from './type-sizes.ts'

const PAGE = '/signin.html'

const typeOf = (page: Page, selector: string) =>
  page.locator(selector).evaluate((el) => {
    const cs = getComputedStyle(el)
    return { type: `${cs.fontSize}/${cs.lineHeight}`, height: Math.round(el.getBoundingClientRect().height) }
  })

const borderOf = (page: Page) =>
  page
    .locator('.screen-body .field')
    .first()
    .evaluate((el) => getComputedStyle(el).borderTopColor)

/** The field's border once its 140 ms transition has settled: read until two reads a frame apart agree. */
const settledBorder = async (page: Page) => {
  let last = ''
  await expect
    .poll(async () => {
      const now = await borderOf(page)
      const same = now === last
      last = now
      return same
    })
    .toBe(true)
  return last
}

async function sent(page: Page) {
  await page.getByPlaceholder('you@company.com').fill('luis@example.com')
  await page.getByRole('button', { name: 'Email me a link' }).click()
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
}

for (const theme of ['dark', 'light']) {
  test(`sign-in · ${theme} · the note sits a size under the lede, and the screen keeps three sizes`, async ({
    page,
  }) => {
    await page.goto(`${PAGE}?theme=${theme}`)
    expect((await typeOf(page, '.screen-lede')).type).toBe('14px/20px')
    expect((await typeOf(page, '.screen-body p.muted')).type).toBe('12px/16px')
    const sizes = await typeSizes(page, '.screen-body')
    expect(sizes.length, sizes.join(' ')).toBeLessThanOrEqual(3)
  })

  test(`sign-in · ${theme} · a wrong code is said on its field, as a wrong address is`, async ({ page }) => {
    await page.goto(`${PAGE}?theme=${theme}`)
    // The address's own invalid border, for the code to match.
    await page.getByPlaceholder('you@company.com').fill('luis')
    await page.getByRole('button', { name: 'Email me a link' }).click()
    await expect(page.getByPlaceholder('you@company.com')).toHaveAttribute('aria-invalid', 'true')
    const rose = await settledBorder(page)
    await page.getByPlaceholder('you@company.com').fill('')
    await sent(page)
    const code = page.getByRole('textbox', { name: 'Code from the email' })
    const calm = await settledBorder(page)
    await code.fill('123456')
    await page.getByRole('button', { name: 'Sign in with code' }).click()
    await expect(page.getByRole('alert')).toHaveText('That code didn’t work.')
    await expect(code).toHaveAttribute('aria-invalid', 'true')
    await expect(code).toHaveAccessibleDescription('That code didn’t work.')
    await expect.poll(() => borderOf(page)).toBe(rose)
    // The digits selected, so the next ones typed replace them.
    await expect(code).toBeFocused()
    expect(await code.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd])).toEqual([0, 6])
    await page.keyboard.type('6')
    await expect(code).toHaveValue('6')
    await expect(code).not.toHaveAttribute('aria-invalid', 'true')
    await expect.poll(() => borderOf(page)).toBe(calm)
  })
}

test('sign-in @phone · «Check your email» is a line and a note', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(PAGE)
  await sent(page)
  const line = page.locator('.screen-body p', { hasText: 'We sent a link and a code to luis@example.com.' })
  await expect(line).toBeVisible()
  expect((await typeOf(page, '.screen-body p.sent-to')).height).toBeLessThanOrEqual(40)
  const note = page.locator('.screen-body p.muted', {
    hasText: 'Open the link in this browser, or type the code here.',
  })
  await expect(note).toBeVisible()
  expect(await typeOf(page, '.screen-body p.muted >> nth=0')).toEqual({ type: '12px/16px', height: 16 })
})
