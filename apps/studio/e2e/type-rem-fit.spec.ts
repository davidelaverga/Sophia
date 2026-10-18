import { expect, test, type Page } from '@playwright/test'

// Larger browser text fits its boxes (docs/plans/type-rem.md, Codex P1 on #421): with the root at 125 % and 150 %,
// Chrome's «Large» and «Very large», no box lets its own words out. Every main page, and the states that open more (a
// sheet, the palette, the keys, a goal's sheet, the effort a restart asked), on a computer and on a phone. Each line of
// words is measured against the box it is laid out in (its nearest block): down, by the band its letters take (an em
// around the line's middle), so a tight heading's line counts as fitting; across, by where the line ends, unless the
// box cuts it with an ellipsis; and the page never gets wider than the window. A clamp cuts on purpose, a scrolling
// box scrolls, a tip waits hidden, and a screen reader's words (a 1 px box) are left out.

const REPORT = '00000000-0000-4000-8000-0000000000b1'
const ROLLOUT = 'Roll the new onboarding out to every region'

const PAGES = [
  '/room.html',
  '/room.html?call=on&people=2',
  '/room.html?call=on&people=2&lobby=waiting',
  '/room.html?demo=1&place=work',
  '/room.html?demo=1&place=goals',
  '/room.html?demo=1&place=knowledge',
  `/room.html?place=knowledge&report=${REPORT}`,
  '/room.html?demo=1&place=updates',
  '/room.html?demo=1&conversations=1&place=conversations',
  '/resources.html',
  '/work.html?view=goals',
  '/personal.html',
  '/home.html',
  '/signin.html',
]

/**
 * In the page: the boxes that let a line of their words out, with the words and how far, and the page if it is wider
 * than the window. What to fix.
 */
function readSpills(): string[] {
  // The box words are laid out in, past any inline element around them; null if it doesn't count (hidden, a scroller,
  // a clamp, a screen reader's 1 px box).
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- page.evaluate sends only this function to the page
  const layoutBox = (own: HTMLElement) => {
    let box: HTMLElement | null = own
    while (box && getComputedStyle(box).display === 'inline') box = box.parentElement
    if (!box || box.getClientRects().length === 0) return null
    const style = getComputedStyle(box)
    const rect = box.getBoundingClientRect()
    const hidden = style.visibility === 'hidden' || style.opacity === '0' || rect.width <= 2 || rect.height <= 2
    const cuts = [style.overflowX, style.overflowY].some((o) => ['auto', 'scroll'].includes(o))
    if (hidden || cuts || style.getPropertyValue('-webkit-line-clamp') !== 'none') return null
    return { box, style, rect }
  }
  // How far a text's words reach past its box: down by their letters' band (an em around each line's middle), across
  // by where each word ends, word by word, since a space that ends a line may hang past the box, as CSS lets it.
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- page.evaluate sends only this function to the page
  const reach = (node: Node, font: number, { style, rect }: { style: CSSStyleDeclaration; rect: DOMRect }) => {
    const top = rect.top + parseFloat(style.borderTopWidth)
    const bottom = rect.bottom - parseFloat(style.borderBottomWidth)
    const left = rect.left + parseFloat(style.borderLeftWidth)
    const right = rect.right - parseFloat(style.borderRightWidth)
    const cut = style.textOverflow === 'ellipsis'
    const range = document.createRange()
    const worst = { over: 0, past: 0 }
    for (const word of (node.nodeValue ?? '').matchAll(/\S+/g)) {
      range.setStart(node, word.index)
      range.setEnd(node, word.index + word[0].length)
      for (const part of range.getClientRects()) {
        const middle = (part.top + part.bottom) / 2
        worst.over = Math.max(worst.over, top - (middle - font / 2), middle + font / 2 - bottom)
        worst.past = cut ? worst.past : Math.max(worst.past, left - part.left, part.right - right)
      }
    }
    return worst
  }
  const out = new Set<string>()
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const own = node.parentElement
    if (!own || !node.nodeValue?.trim() || own.closest('svg, script, style, .fixture-label, .tip')) continue
    const laid = layoutBox(own)
    if (!laid) continue
    const { over, past } = reach(node, parseFloat(getComputedStyle(own).fontSize), laid)
    if (over <= 1 && past <= 1) continue
    const how = [over > 1 && `${over.toFixed(1)} px down`, past > 1 && `${past.toFixed(1)} px across`]
    const kind = [laid.box.tagName.toLowerCase(), ...laid.box.classList].join('.')
    out.add(`${kind} «${node.nodeValue.trim().slice(0, 24)}» ${how.filter(Boolean).join(', ')}`)
  }
  // Nor the page itself: nothing makes it wider than the window.
  const wider = document.documentElement.scrollWidth - window.innerWidth
  if (wider > 1) out.add(`the page: ${String(wider)} px wider than the window`)
  return [...out]
}

const overflowing = (page: Page) => page.evaluate(readSpills)

/**
 * In the page: each goal control's tip that reaches past a side of the window, and how far. A tip waits hidden in the
 * place it shows in (only its 2 px lift changes), so this reads them all at once.
 */
function readTipsOut(): string[] {
  return [...document.querySelectorAll<HTMLElement>('.goal > .controls .tip')].flatMap((tip) => {
    const { left, right } = tip.getBoundingClientRect()
    const past = Math.max(-left, right - window.innerWidth)
    return past > 1 ? [`«${tip.textContent}» ${past.toFixed(1)} px past the window`] : []
  })
}

const settle = (page: Page) => page.waitForTimeout(1200)

/** The fixtures' own origin only, and the root at `root`. */
async function largerText(page: Page, root: string) {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
  // A larger browser default, before anything draws: the root's size is what rem reads.
  await page.addInitScript((size) => {
    document.addEventListener('DOMContentLoaded', () => {
      document.documentElement.style.fontSize = size
    })
  }, root)
}

for (const root of ['125%', '150%']) {
  // A goal without a plan has its controls at the content's start; held, Resume comes first (Codex P2 on #421). Tips
  // show only on a screen wider than a phone, under a pointer that hovers (theme.css): a computer's check.
  test(`fit · at ${root}, a held goal's Resume keeps its tip in the window, as every goal control does`, async ({
    page,
  }) => {
    await largerText(page, root)
    await page.goto('/work.html?goals=9')
    const resume = page
      .locator('li.goal', { hasText: 'Localise the pricing page' })
      .getByRole('button', { name: 'Resume', exact: true })
    await resume.hover()
    await expect(resume.locator('.tip')).toHaveCSS('opacity', '1')
    expect(await page.evaluate(readTipsOut)).toEqual([])
  })

  test.describe(`at ${root}`, () => {
    test.beforeEach(({ page }) => largerText(page, root))

    for (const tag of ['', '@phone · ']) {
      for (const url of PAGES) {
        test(`${tag}fit · at ${root}, nothing on ${url} lets its words out`, async ({ page }) => {
          await page.goto(url)
          await settle(page)
          expect(await overflowing(page)).toEqual([])
        })
      }

      test(`${tag}fit · at ${root}, Settings, the palette and the keys keep their words in`, async ({ page }) => {
        await page.goto('/room.html?people=2')
        await page.getByRole('button', { name: 'Account' }).click()
        await page.getByRole('menuitem', { name: 'Settings…' }).click()
        await settle(page)
        expect(await overflowing(page)).toEqual([])
        await page.keyboard.press('Escape')
        await page.keyboard.press('Control+k')
        await settle(page)
        expect(await overflowing(page)).toEqual([])
        await page.keyboard.press('Escape')
        await page.keyboard.press('Control+/')
        await settle(page)
        expect(await overflowing(page)).toEqual([])
      })

      test(`${tag}fit · at ${root}, a goal's sheet keeps its words in`, async ({ page }) => {
        await page.goto('/room.html?demo=1&place=goals')
        await page.getByRole('button', { name: ROLLOUT, exact: true }).click()
        await settle(page)
        expect(await overflowing(page)).toEqual([])
      })

      test(`${tag}fit · at ${root}, the effort a restart asked keeps its words in (Codex's .effort-asked)`, async ({
        page,
      }) => {
        await page.goto('/resources.html?more=1&viewer=davide')
        await page
          .getByRole('button', { name: /Davide · Claude Code/ })
          .first()
          .click()
        const worker = page.getByRole('dialog').getByRole('listitem').filter({ hasText: 'worker' })
        await worker.getByRole('button', { name: 'Effort: Ultracode. Change it' }).click()
        await page.keyboard.press('Home')
        await page.getByRole('dialog').getByRole('button', { name: 'Restart now with Low…' }).click()
        await page.getByRole('dialog').getByRole('button', { name: 'Restart', exact: true }).click()
        await expect(worker.locator('.effort-asked')).toBeVisible()
        await settle(page)
        expect(await overflowing(page)).toEqual([])
      })
    }
  })
}
