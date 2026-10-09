import { expect, test, type Page } from '@playwright/test'
import { QUALIFICATION, TRACKS } from '../fixtures/data.ts'

// The Studio's page receipts for the voice qualification episode (docs/plans/voice-qualification-g7.md, amendment A15)
// on the room's fixture page: the Studio's own room controller and receipts, over the fake LiveKit. The room token names
// a grant only with `qualification=on`, as the API names one to the grant's principal alone. A check reads what the
// page dispatched on `window` and which listeners the voices' elements carry. Every id is synthetic; the tone played is
// made in the page and goes nowhere.

const SCHEMA = 'sophia.studio.voice_qualification.v1'
const SOPHIA_VOICE = 'audio[data-sophia-room-audio="sophia"]'
const MEMBER_VOICE = 'audio[data-sophia-room-audio="member"]'
const PHASES = ['emptied', 'ended', 'pause', 'play', 'playing', 'waiting']
const GRANT = { schema: SCHEMA, grantId: QUALIFICATION.grantId, runBindingSha256: QUALIFICATION.runBindingSha256 }

declare global {
  interface Window {
    /** What the page dispatched as `sophia:voice-qualification`, in order (this check's own listener). */
    voiceReceipts?: unknown[]
  }
}

const receipts = (page: Page) => page.evaluate(() => [...(window.voiceReceipts ?? [])])
const asked = (page: Page) => page.evaluate(() => [...(window.fixture?.asked ?? [])])
const leave = (page: Page) => page.getByRole('button', { name: 'Leave the room' })

/** Opens the room and waits for the call: connected, the microphone arrived, and the voices attached. */
async function enter(page: Page, query: string) {
  await page.addInitScript(() => {
    const seen: unknown[] = []
    window.voiceReceipts = seen
    window.addEventListener('sophia:voice-qualification', (e) => {
      if (e instanceof CustomEvent) seen.push(e.detail)
    })
  })
  await page.goto(`/room.html?call=on&people=1&sophia=speaking${query}`)
  await expect(leave(page)).toBeVisible()
  await expect.poll(() => asked(page)).toContain('microphone:on')
  await page.evaluate(() => window.fixture?.voices())
  await expect(page.locator(SOPHIA_VOICE)).toHaveCount(1)
  await expect(page.locator(MEMBER_VOICE)).toHaveCount(1)
}

/** The event types listened to on the element, as DevTools lists them: whatever added them. */
async function listenersOn(page: Page, selector: string): Promise<string[]> {
  const cdp = await page.context().newCDPSession(page)
  const { result } = await cdp.send('Runtime.evaluate', { expression: `document.querySelector('${selector}')` })
  expect(result.objectId, selector).toBeTruthy()
  const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId ?? '' })
  await cdp.detach()
  return listeners.map((l) => l.type).toSorted()
}

/** 2 s of a 440 Hz tone, 8 kHz mono 16-bit PCM, as a WAV data URL: made here, and it goes nowhere. */
function tone(): string {
  const samples = 16_000
  const wav = Buffer.alloc(44 + samples * 2)
  wav.write('RIFF', 0)
  wav.writeUInt32LE(36 + samples * 2, 4)
  wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16) // the format chunk's size
  wav.writeUInt16LE(1, 20) // PCM
  wav.writeUInt16LE(1, 22) // mono
  wav.writeUInt32LE(8000, 24) // samples a second
  wav.writeUInt32LE(16_000, 28) // bytes a second
  wav.writeUInt16LE(2, 32) // bytes a frame
  wav.writeUInt16LE(16, 34) // bits a sample
  wav.write('data', 36)
  wav.writeUInt32LE(samples * 2, 40)
  for (let i = 0; i < samples; i += 1)
    wav.writeInt16LE(Math.round(Math.sin((i * Math.PI * 880) / 8000) * 8000), 44 + i * 2)
  return `data:audio/wav;base64,${wav.toString('base64')}`
}

type Step = 'tone' | 'play' | 'pause' | 'waiting' | 'end' | 'empty'

/** Both voices, Sophia's and the member's, take one step together, each awaited until its element says it happened. */
const onBoth = (page: Page, step: Step) =>
  page.evaluate(
    async ({ selectors, which, src }) => {
      /** Each step: what it does, and the event that says it was done (none for one that is done at once). */
      const steps: Record<Step, { act: (el: HTMLMediaElement) => unknown; fired?: string }> = {
        tone: { act: (el) => (el.src = src) },
        play: { act: (el) => el.play(), fired: 'playing' },
        pause: { act: (el) => el.pause(), fired: 'pause' },
        // Stalled media's own event, as a stall would fire it.
        waiting: { act: (el) => el.dispatchEvent(new Event('waiting')) },
        end: {
          act: (el) => {
            el.currentTime = el.duration - 0.2
            return el.play()
          },
          fired: 'ended',
        },
        empty: {
          act: (el) => {
            el.removeAttribute('src')
            el.load()
          },
          fired: 'emptied',
        },
      }
      const { act, fired } = steps[which]
      for (const selector of selectors) {
        const el = document.querySelector(selector)
        if (!(el instanceof HTMLMediaElement)) throw new Error(`${selector} is not on the page`)
        const done = fired ? new Promise((resolve) => el.addEventListener(fired, resolve, { once: true })) : null
        await act(el)
        await done
      }
    },
    { selectors: [SOPHIA_VOICE, MEMBER_VOICE], which: step, src: step === 'tone' ? tone() : '' },
  )

/** A receipt's playback moment, if it names one. */
const phaseOf = (receipt: unknown) =>
  typeof receipt === 'object' && receipt !== null && 'phase' in receipt ? receipt.phase : undefined

/** A receipt's keys, in order. */
const keysOf = (receipt: unknown) => (typeof receipt === 'object' && receipt !== null ? Object.keys(receipt) : [])

/** Each voice plays, pauses, waits, plays to its end and is emptied: every moment a receipt names, on both. */
async function playThrough(page: Page) {
  for (const step of ['tone', 'play', 'pause', 'waiting', 'end', 'empty'] as const) await onBoth(page, step)
}

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.origin !== 'http://127.0.0.1:5199',
    (route) => route.abort(),
  )
})

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => [...(window.fixture?.unexpected ?? [])])).toEqual([])
})

test('voice qualification · under a grant, the page tells itself its microphone and Sophia’s playback, hers alone', async ({
  page,
}) => {
  await enter(page, '&qualification=on')
  const microphone = { trackSid: TRACKS.microphone }
  const published = { ...GRANT, atMs: expect.any(Number), event: 'mic_published', ...microphone }
  await expect.poll(() => receipts(page)).toStrictEqual([{ ...published, trackId: TRACKS.microphoneTrack }])
  expect(await listenersOn(page, SOPHIA_VOICE)).toEqual(PHASES)
  expect(await listenersOn(page, MEMBER_VOICE)).toEqual([])

  await playThrough(page)
  const playback = (await receipts(page)).slice(1)
  for (const receipt of playback) {
    expect(receipt).toStrictEqual({
      ...GRANT,
      atMs: expect.any(Number),
      event: 'sophia_playback',
      phase: expect.any(String),
      trackSid: TRACKS.sophia,
      mediaTimeMs: expect.any(Number),
    })
  }
  expect(new Set(playback.map(phaseOf))).toEqual(new Set(PHASES))
  // Its end, where the 2 s tone ends: the media's own time, in whole milliseconds.
  expect(playback.find((r) => phaseOf(r) === 'ended')).toMatchObject({ mediaTimeMs: expect.closeTo(2000, -2) })

  const before = (await receipts(page)).length
  await leave(page).click()
  await expect
    .poll(async () => (await receipts(page)).slice(before))
    .toStrictEqual([{ ...GRANT, atMs: expect.any(Number), event: 'mic_unpublished', ...microphone }])
  const all = await receipts(page)
  expect(JSON.stringify(all)).not.toContain(TRACKS.member)
  // Each receipt's keys, in order: the schema, the grant, when, the event, then its own fields; nothing else.
  const head = [...Object.keys(GRANT), 'atMs', 'event']
  expect(new Set(all.map((r) => keysOf(r).join()))).toEqual(
    new Set([
      [...head, 'trackSid', 'trackId'].join(),
      [...head, 'phase', 'trackSid', 'mediaTimeMs'].join(),
      [...head, 'trackSid'].join(),
    ]),
  )
})

test('voice qualification · without a grant, nothing is dispatched and no voice is listened to', async ({ page }) => {
  await enter(page, '')
  expect(await listenersOn(page, SOPHIA_VOICE)).toEqual([])
  expect(await listenersOn(page, MEMBER_VOICE)).toEqual([])
  await playThrough(page)
  await leave(page).click()
  await expect.poll(() => asked(page)).toContain('leave')
  await expect(page.locator(SOPHIA_VOICE)).toHaveCount(0)
  expect(await receipts(page)).toEqual([])
})
