import { expect, test, type Page } from '@playwright/test'

// Keep the call in view (docs/plans/call-picture-in-picture.md): the dock puts the call in picture in picture, through
// Document Picture-in-Picture where the browser has it, else the stage's video, and offers nothing where neither
// exists. The browser's API is stubbed here: a frame on the page stands in for the small window, and every call to
// it is recorded in `window.pipAsked`.

declare global {
  interface Window {
    pipAsked?: string[]
    /** A held request for the small window is answered (`held`). */
    pipRelease?: () => void
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
/** `held`: the browser answers a request for the small window only once the check lets it (`window.pipRelease`). */
async function browserHas(page: Page, has: { document: boolean; video: boolean; held?: boolean }) {
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
            if (!h.held) return Promise.resolve(made())
            return new Promise<Window>((resolve) => {
              const before = window.pipRelease
              window.pipRelease = () => {
                before?.()
                resolve(made())
              }
            })
          },
        },
      })
    }
    /** The small window, as Chromium opens it: a frame on the page stands in for it. */
    function made(): Window {
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
      return small
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
  // Lucía speaks; Marco, listed before her, doesn't.
  await enter(page, 'people=2&speaking=2')
  await expect(keep(page)).toHaveAttribute('aria-pressed', 'false')
  // Its help, under the pointer.
  await expect(keep(page).locator('.tip')).toHaveText('Picture in picture')
  await keep(page).click()
  await expect.poll(() => pipAsked(page)).toEqual([expect.stringMatching(/^window:\d+x\d+$/)])
  await expect(keep(page)).toHaveAttribute('aria-pressed', 'true')
  // Lucía speaks: she is what the small window shows.
  await expect.poll(() => pipText(page)).toContain('Lucía')
  expect(await pipText(page)).not.toContain('Marco')
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

test('pip · in a call of two, you speaking, the small window keeps showing the other', async ({ page }) => {
  await browserHas(page, { document: true, video: true })
  await enter(page, 'people=1&speaking=0')
  await keep(page).click()
  await expect.poll(() => pipText(page)).toContain('Marco')
  expect(await pipText(page)).not.toContain('you')
})

test('pip · pressed twice while the browser opens it, one window is asked for and kept', async ({ page }) => {
  await browserHas(page, { document: true, video: true, held: true })
  await enter(page, 'people=2')
  await keep(page).click()
  await keep(page).click()
  await page.evaluate(() => window.pipRelease?.())
  await expect(keep(page)).toHaveAttribute('aria-pressed', 'true')
  expect((await pipAsked(page)).filter((a) => a.startsWith('window:'))).toHaveLength(1)
  await expect(page.locator('iframe[data-pip]')).toHaveCount(1)
})

test('pip · leaving while the browser opens it: the window that comes is closed', async ({ page }) => {
  await browserHas(page, { document: true, video: true, held: true })
  await enter(page, 'people=2')
  await keep(page).click()
  await dock(page).getByRole('button', { name: 'Leave the room' }).click()
  await page.evaluate(() => window.pipRelease?.())
  await expect.poll(() => pipAsked(page)).toContain('close')
  await expect(page.locator('iframe[data-pip]')).toHaveCount(0)
})

test('pip · a theme changed while the small window is open reaches it', async ({ page }) => {
  await browserHas(page, { document: true, video: true })
  await enter(page, 'people=2')
  await keep(page).click()
  await expect(page.locator('iframe[data-pip]')).toHaveCount(1)
  const theme = () =>
    page.evaluate(
      () =>
        document.querySelector<HTMLIFrameElement>('iframe[data-pip]')?.contentDocument?.documentElement.dataset.theme,
    )
  const next = await page.evaluate(() => {
    const now = document.documentElement.dataset.theme
    const other = now === 'light' ? 'dark' : 'light'
    document.documentElement.dataset.theme = other
    return other
  })
  await expect.poll(theme).toBe(next)
})

test('pip · with video picture in picture only, your camera alone with your tile hidden offers nothing', async ({
  page,
}) => {
  await browserHas(page, { document: false, video: true })
  await enter(page, 'people=1')
  await dock(page).getByRole('button', { name: 'Camera', exact: true }).click()
  const mine = page.getByRole('list', { name: 'In the room' }).locator('.tile', { hasText: 'you' })
  await expect(mine.locator('video')).toHaveCount(1)
  await expect(keep(page)).toBeVisible()
  await mine.hover()
  await mine.getByRole('button', { name: 'Hide my tile' }).click()
  await expect(page.locator('.room-stage video')).toHaveCount(0)
  await expect(keep(page)).toHaveCount(0)
})
