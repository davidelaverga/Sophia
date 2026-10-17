import { expect, test, type Page } from '@playwright/test'

// The check before joining (docs/plans/device-check.md): beside Join, «Check audio and video» opens a sheet with the
// camera's picture, a meter that moves with the voice, and the devices to choose; its Join enters the call with them.
// The browser's camera and microphone are stood in for here: a painted canvas and a steady tone, and every request
// for them is recorded. Every name and stream is synthetic.

declare global {
  interface Window {
    checkMedia?: { asked: MediaStreamConstraints[]; stopped: number; refuse: boolean }
  }
}

const dock = (page: Page) => page.getByRole('navigation', { name: 'Room controls' })
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Check your audio and video' })

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
  await page.addInitScript(() => {
    const media = { asked: [] as MediaStreamConstraints[], stopped: 0, refuse: location.search.includes('gum=refuse') }
    window.checkMedia = media
    navigator.mediaDevices.getUserMedia = (asked?: MediaStreamConstraints) => {
      media.asked.push(structuredClone(asked ?? {}))
      if (media.refuse) return Promise.reject(new DOMException('Permission denied', 'NotAllowedError'))
      const tracks: MediaStreamTrack[] = []
      if (asked?.video) {
        const canvas = document.createElement('canvas')
        canvas.width = 160
        canvas.height = 90
        const paint = canvas.getContext('2d')
        setInterval(() => {
          if (!paint) return
          paint.fillStyle = '#835'
          paint.fillRect(0, 0, 160, 90)
        }, 100)
        tracks.push(...canvas.captureStream(10).getVideoTracks())
      }
      if (asked?.audio) {
        const context = new AudioContext()
        const tone = context.createOscillator()
        const gain = context.createGain()
        gain.gain.value = 0.6
        const out = context.createMediaStreamDestination()
        tone.connect(gain).connect(out)
        tone.start()
        tracks.push(...out.stream.getAudioTracks())
      }
      for (const track of tracks) {
        const stop = track.stop.bind(track)
        track.stop = () => {
          media.stopped += 1
          stop()
        }
      }
      return Promise.resolve(new MediaStream(tracks))
    }
  })
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

const lastAsked = (page: Page) => page.evaluate(() => window.checkMedia?.asked.at(-1))

test('check · before joining, the camera’s picture, a meter that moves with the voice, and the devices to choose', async ({
  page,
}) => {
  await page.goto('/room.html')
  await dock(page).getByRole('button', { name: 'Check audio and video', exact: true }).click()
  await expect(sheet(page)).toBeVisible()
  // The camera's picture plays in the sheet.
  const preview = sheet(page).locator('video.device-preview-video')
  await expect
    .poll(() =>
      preview.evaluate((v: HTMLVideoElement) =>
        v.srcObject instanceof MediaStream ? v.srcObject.getVideoTracks().length : 0,
      ),
    )
    .toBe(1)
  // The meter moves with the voice (here a steady tone).
  const meter = sheet(page).getByRole('meter', { name: 'Microphone level' })
  await expect.poll(async () => Number(await meter.getAttribute('aria-valuenow'))).toBeGreaterThan(0)
  // Each device, named; a speaker where the browser can choose one.
  await expect(sheet(page).locator('.device-row-label')).toHaveText(['Microphone', 'Speaker', 'Camera'])
  await sheet(page).getByRole('button', { name: 'Microphone: Default — MacBook Microphone' }).click()
  await page.getByRole('menu', { name: 'Microphone' }).getByRole('menuitemradio', { name: 'USB headset' }).click()
  // The picture and the meter follow the choice.
  await expect.poll(() => lastAsked(page)).toMatchObject({ audio: { deviceId: { ideal: 'usb-mic' } } })
  await expect(sheet(page).getByRole('button', { name: 'Microphone: USB headset' })).toBeVisible()
  // Its Join enters the call with them, and lets the camera and microphone go first.
  const stoppedBefore = await page.evaluate(() => window.checkMedia?.stopped ?? 0)
  await sheet(page).getByRole('button', { name: 'Join the room' }).click()
  await expect(sheet(page)).toHaveCount(0)
  await expect(dock(page).getByRole('button', { name: 'Leave the room' })).toBeVisible()
  expect(await page.evaluate(() => window.checkMedia?.stopped ?? 0)).toBeGreaterThanOrEqual(stoppedBefore + 2)
  expect(await page.evaluate(() => window.fixture?.devicesOnJoin)).toMatchObject({ audioinput: 'usb-mic' })
})

test('check · the microphone and the camera are chosen on the picture, and Join enters with them', async ({ page }) => {
  await page.goto('/room.html')
  await dock(page).getByRole('button', { name: 'Check audio and video', exact: true }).click()
  const mic = sheet(page).getByRole('button', { name: 'Microphone', exact: true })
  const camera = sheet(page).getByRole('button', { name: 'Camera', exact: true })
  // As the join would start: the microphone as last chosen here (on by default), the camera off.
  await expect(mic).toHaveAttribute('aria-pressed', 'true')
  await expect(camera).toHaveAttribute('aria-pressed', 'false')
  await expect(sheet(page).locator('.device-preview')).toContainText('Your camera is off')
  const meter = sheet(page).getByRole('meter', { name: 'Microphone level' })
  await expect.poll(async () => Number(await meter.getAttribute('aria-valuenow'))).toBeGreaterThan(0)
  // The microphone off rests the meter; the camera on shows its picture. Nothing is asked of the browser again.
  const asked = await page.evaluate(() => window.checkMedia?.asked.length ?? 0)
  await mic.click()
  await expect(mic).toHaveAttribute('aria-pressed', 'false')
  await expect.poll(async () => Number(await meter.getAttribute('aria-valuenow'))).toBe(0)
  await camera.click()
  await expect(camera).toHaveAttribute('aria-pressed', 'true')
  await expect(sheet(page).locator('.device-preview')).not.toContainText('Your camera is off')
  await expect
    .poll(() =>
      sheet(page)
        .locator('video.device-preview-video')
        .evaluate(
          (v: HTMLVideoElement) => v.srcObject instanceof MediaStream && v.srcObject.getVideoTracks()[0]?.enabled,
        ),
    )
    .toBe(true)
  expect(await page.evaluate(() => window.checkMedia?.asked.length ?? 0)).toBe(asked)
  // Join enters muted, with the camera on.
  await sheet(page).getByRole('button', { name: 'Join the room' }).click()
  await expect(dock(page).getByRole('button', { name: 'Leave the room' })).toBeVisible()
  await expect(dock(page).getByRole('button', { name: 'Microphone', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  await expect(dock(page).getByRole('button', { name: 'Camera', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

test('check · where nothing can be kept on this device, the microphone chosen off still joins off', async ({
  page,
}) => {
  // Storage refusing writes: the choice can't be remembered, so the join must carry it (Codex P1 on #361).
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Blocked', 'SecurityError')
    }
  })
  await page.goto('/room.html')
  await dock(page).getByRole('button', { name: 'Check audio and video', exact: true }).click()
  await sheet(page).getByRole('button', { name: 'Microphone', exact: true }).click()
  await sheet(page).getByRole('button', { name: 'Join the room' }).click()
  await expect(dock(page).getByRole('button', { name: 'Leave the room' })).toBeVisible()
  await expect(dock(page).getByRole('button', { name: 'Microphone', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
})

test('check · a join that fails keeps the choices for Try again: muted, the camera on', async ({ page }) => {
  // Storage refusing writes, so the retry can't fall back on a kept microphone choice (Codex P1 on #361).
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Blocked', 'SecurityError')
    }
  })
  await page.goto('/room.html')
  await page.evaluate(() => window.fixture?.failToken())
  await dock(page).getByRole('button', { name: 'Check audio and video', exact: true }).click()
  await sheet(page).getByRole('button', { name: 'Microphone', exact: true }).click()
  await sheet(page).getByRole('button', { name: 'Camera', exact: true }).click()
  await sheet(page).getByRole('button', { name: 'Join the room' }).click()
  await dock(page)
    .getByRole('button', { name: /^Try again/ })
    .click()
  await expect(dock(page).getByRole('button', { name: 'Leave the room' })).toBeVisible()
  await expect(dock(page).getByRole('button', { name: 'Microphone', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  await expect(dock(page).getByRole('button', { name: 'Camera', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

test('check · closed without joining, the camera and the microphone are let go', async ({ page }) => {
  await page.goto('/room.html')
  await dock(page).getByRole('button', { name: 'Check audio and video', exact: true }).click()
  const meter = sheet(page).getByRole('meter', { name: 'Microphone level' })
  await expect.poll(async () => Number(await meter.getAttribute('aria-valuenow'))).toBeGreaterThan(0)
  await page.keyboard.press('Escape')
  await expect(sheet(page)).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => window.checkMedia?.stopped ?? 0)).toBeGreaterThanOrEqual(2)
  // Nothing joined.
  await expect(dock(page).getByRole('button', { name: /^Join the room/ })).toBeVisible()
})

test('check · with access refused, it says how to give it, and Join still enters', async ({ page }) => {
  await page.goto('/room.html?gum=refuse')
  await dock(page).getByRole('button', { name: 'Check audio and video', exact: true }).click()
  await expect(sheet(page).locator('.device-preview')).toHaveText(
    'Allow the camera and microphone in your browser’s site settings to check them here.',
  )
  await sheet(page).getByRole('button', { name: 'Join the room' }).click()
  await expect(dock(page).getByRole('button', { name: 'Leave the room' })).toBeVisible()
})
