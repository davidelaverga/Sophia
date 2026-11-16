import { expect, test, type Page } from '@playwright/test'

// Keep the call in view (docs/plans/call-picture-in-picture.md): the dock puts the call in picture in picture, through
// Document Picture-in-Picture where the browser has it, else the stage's video, and offers nothing where neither
// exists. The browser's API is stubbed here: a frame on the page stands in for the small window, and every call to
// it is recorded in `window.pipAsked`.

declare global {
  interface Window {
    pipAsked?: string[]
  }
}

const dock = (page: Page) => page.getByRole('navigation', { name: 'Room controls' })
const keep = (page: Page) => dock(page).getByRole('button', { name: 'Keep the call in view', exact: true })
const pipAsked = (page: Page) => page.evaluate(() => [...(window.pipAsked ?? [])])
/** The stand-in small window's words. */
const pipText = (page: Page) =>
  page.evaluate(() => document.querySelector<HTMLIFrameElement>('iframe[data-pip]')?.contentDocument?.body.innerText)

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

/** The browser's picture in picture as this check says: Document PiP (stubbed), video PiP (stubbed), or neither. */
async function browserHas(page: Page, has: { document: boolean; video: boolean }) {
  await page.addInitScript((h) => {
    window.pipAsked = []
    const asked = window.pipAsked
    // What this browser has of its own goes first: the check says what it has.
    Reflect.deleteProperty(window, 'documentPictureInPicture')
    if (h.document) {
      Object.defineProperty(window, 'documentPictureInPicture', {
        configurable: true,
        value: {
          requestWindow: (options: { width: number; height: number }) => {
            asked.push(`window:${String(options.width)}x${String(options.height)}`)
            const frame = document.createElement('iframe')
            frame.dataset.pip = ''
            document.body.append(frame)
            const small = frame.contentWindow
            if (!small) throw new Error('no frame')
            // Closed, as Chromium closes it: the window's pagehide, then it is gone.
            small.close = () => {
              asked.push('close')
              small.dispatchEvent(new Event('pagehide'))
              frame.remove()
            }
            return Promise.resolve(small)
          },
        },
      })
    }
    Object.defineProperty(Document.prototype, 'pictureInPictureEnabled', { configurable: true, get: () => h.video })
    HTMLVideoElement.prototype.requestPictureInPicture = function (this: HTMLVideoElement) {
      const where = this.closest('.screen-main, .spotlight-main, .tile')
      asked.push(`video:${where?.getAttribute('data-actor') ?? where?.className ?? 'none'}`)
      return Promise.resolve(Object.assign(new EventTarget(), { width: 0, height: 0, onresize: null }))
    }
  }, has)
}

async function enter(page: Page, query: string) {
  await page.goto(`/room.html?call=on&${query}`)
  await expect(dock(page).getByRole('button', { name: 'Leave the room' })).toBeVisible()
}

test('pip · with Document Picture-in-Picture, the call goes into a small window showing who speaks; closed, the page is as it was', async ({
  page,
}) => {
  await browserHas(page, { document: true, video: true })
  await enter(page, 'people=2&speaking=1')
  await expect(keep(page)).toHaveAttribute('aria-pressed', 'false')
  // Its help, under the pointer.
  await expect(keep(page).locator('.tip')).toHaveText('Picture in picture')
  await keep(page).click()
  await expect.poll(() => pipAsked(page)).toEqual([expect.stringMatching(/^window:\d+x\d+$/)])
  await expect(keep(page)).toHaveAttribute('aria-pressed', 'true')
  // Marco speaks: he is what the small window shows.
  await expect.poll(() => pipText(page)).toContain('Marco')
  // Closed from the small window (its own close, or back to the tab): the button reads as off, the stage untouched.
  await page.evaluate(() => {
    const frame = document.querySelector<HTMLIFrameElement>('iframe[data-pip]')
    frame?.contentWindow?.dispatchEvent(new Event('pagehide'))
    frame?.remove()
  })
  await expect(keep(page)).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByRole('list', { name: 'In the room' })).toContainText('Marco')
})

test('pip · leaving the call closes the small window', async ({ page }) => {
  await browserHas(page, { document: true, video: true })
  await enter(page, 'people=2')
  await keep(page).click()
  await expect(keep(page)).toHaveAttribute('aria-pressed', 'true')
  await dock(page).getByRole('button', { name: 'Leave the room' }).click()
  await expect.poll(() => pipAsked(page)).toContain('close')
  await expect(page.locator('iframe[data-pip]')).toHaveCount(0)
})

test('pip · with video picture in picture only, a stage video goes into it; with no video on the stage, nothing is offered', async ({
  page,
}) => {
  await browserHas(page, { document: false, video: true })
  await enter(page, 'people=2&video=screen')
  await keep(page).click()
  // The shared screen is the stage's main video.
  await expect.poll(() => pipAsked(page)).toEqual(['video:screen-main'])
  await expect(keep(page)).toHaveAttribute('aria-pressed', 'true')
  await enter(page, 'people=2')
  await expect(keep(page)).toHaveCount(0)
})

test('pip · where the browser has neither, the dock offers no picture in picture', async ({ page }) => {
  await browserHas(page, { document: false, video: false })
  await enter(page, 'people=2&video=camera')
  await expect(dock(page).getByRole('button', { name: 'React', exact: true })).toBeVisible()
  await expect(keep(page)).toHaveCount(0)
})
