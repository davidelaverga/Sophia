import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { BackgroundEffect } from './background-preference.ts'
import { BackgroundUnavailable, cameraBackground } from './camera-background.ts'
import { mediaMessage } from './room-view.ts'

/** A processor as the test sees it: the effects it was given, in order; its next switch may be held. */
class Drawer {
  effects: BackgroundEffect[]
  held: (() => void)[] = []
  holdNext = false
  constructor(first: BackgroundEffect) {
    this.effects = [first]
  }
  switchTo(effect: BackgroundEffect) {
    if (!this.holdNext) {
      this.effects.push(effect)
      return Promise.resolve()
    }
    this.holdNext = false
    return new Promise<void>((done) =>
      this.held.push(() => {
        this.effects.push(effect)
        done()
      }),
    )
  }
}

/** A camera track: what it was drawn with, and what was done to it. */
function track(told: string[]) {
  let processor: Drawer | undefined
  return {
    getProcessor: () => processor,
    setProcessor: (p: Drawer) => {
      processor = p
      told.push('set')
      return Promise.resolve()
    },
    stopProcessor: () => {
      processor = undefined
      told.push('stop processor')
      return Promise.resolve()
    },
    stop: () => void told.push('stop track'),
  }
}
type Track = ReturnType<typeof track>

const picture = (id: string) => `data:${id}`

/** Until a queued change reaches the point the test holds: changes take their turns a tick later. */
async function reached(held: readonly unknown[]) {
  for (let i = 0; i < 100 && held.length === 0; i++) await new Promise((tick) => setTimeout(tick, 0))
  assert.ok(held.length > 0, 'the change reached what the test holds')
}

/** The camera as LiveKit holds it: one published track or none, and each step said in `told`, in order. */
function room(options: { published?: boolean; drawn?: () => Promise<void>; make?: () => Promise<Drawer> } = {}) {
  const told: string[] = []
  let published: Track | null = options.published ? track(told) : null
  return {
    told,
    published: () => published,
    /** LiveKit's own camera, with no background: on publishes a plain track, off lets it go. */
    plain: (on: boolean) => () => {
      told.push(on ? 'plain on' : 'plain off')
      published = on ? track(told) : null
      return Promise.resolve()
    },
    ports: {
      camera: () => published,
      make: options.make ?? ((e: BackgroundEffect) => Promise.resolve(new Drawer(e))),
      picture,
      create: (p: Drawer) => {
        told.push('create')
        const t = track(told)
        void t.setProcessor(p)
        return Promise.resolve(t)
      },
      publish: (t: Track) => {
        told.push('publish')
        published = t
        return Promise.resolve()
      },
      unpublish: (t: Track) => {
        told.push('unpublish')
        t.stop()
        if (published === t) published = null
        return Promise.resolve()
      },
      drawnFrame: () => {
        told.push('waits for a drawn frame')
        return options.drawn?.() ?? Promise.resolve()
      },
    },
  }
}

describe('the camera’s background, as LiveKit draws it (call-backgrounds.md)', () => {
  it('a camera turning on with a background is published only once its processor has drawn a frame', async () => {
    const r = room()
    const drawing = cameraBackground({ ...r.ports, chosen: 'blur' })
    await drawing.turnOn(r.plain(true))
    assert.deepEqual(r.told, ['create', 'set', 'waits for a drawn frame', 'publish'])
  })

  it('a camera only muted is let go first, so no frame of it is ever unmuted raw', async () => {
    const r = room({ published: true })
    const drawing = cameraBackground({ ...r.ports, chosen: 'dusk' })
    await drawing.turnOn(r.plain(true))
    assert.deepEqual(r.told.slice(0, 2), ['unpublish', 'stop track'])
    assert.equal(r.told.at(-1), 'publish')
  })

  it('without a background the camera turns on as before; a camera drawn here turns off by being let go', async () => {
    const r = room()
    const plain = cameraBackground({ ...r.ports, chosen: 'none' })
    await plain.turnOn(r.plain(true))
    await plain.turnOff(r.plain(false))
    assert.deepEqual(r.told, ['plain on', 'plain off'])
    const drawing = cameraBackground({ ...r.ports, chosen: 'blur' })
    await drawing.turnOn(r.plain(true))
    await drawing.turnOff(r.plain(false))
    assert.equal(r.published(), null)
    assert.equal(r.told.at(-1), 'stop track')
    assert.equal(r.told.filter((t) => t.startsWith('plain')).length, 2)
  })

  it('no drawn frame, or no processor: the camera stays off and says why, nothing published', async () => {
    const late = room({ drawn: () => Promise.reject(new Error('No frame drawn')) })
    await assert.rejects(
      cameraBackground({ ...late.ports, chosen: 'blur' }).turnOn(late.plain(true)),
      BackgroundUnavailable,
    )
    assert.equal(late.published(), null)
    assert.equal(late.told.includes('publish'), false)
    assert.equal(late.told.at(-1), 'stop track')
    const none = room({ make: () => Promise.reject(new Error('No WebGL')) })
    await assert.rejects(
      cameraBackground({ ...none.ports, chosen: 'blur' }).turnOn(none.plain(true)),
      BackgroundUnavailable,
    )
    assert.equal(none.told.includes('plain on'), false)
    assert.equal(
      mediaMessage(new BackgroundUnavailable(new Error('No WebGL')), 'camera', true),
      'Couldn’t draw your background, so the camera stayed off. Choose None or try again.',
    )
  })

  it('choices take their turns: one made while another switches waits, and an earlier one never lands after it', async () => {
    const r = room({ published: true })
    const drawing = cameraBackground({ ...r.ports, chosen: 'none' })
    await drawing.set('blur')
    const drawer = r.published()?.getProcessor()
    assert.ok(drawer)
    drawer.holdNext = true
    const dusk = drawing.set('dusk')
    await reached(drawer.held)
    const dawn = drawing.set('dawn')
    drawer.held.shift()?.()
    await Promise.all([dusk, dawn])
    assert.deepEqual(drawer.effects.at(-1), { mode: 'virtual-background', imagePath: 'data:dawn' })
  })

  it('a choice made while an earlier one still loads wins: the earlier one never takes effect', async () => {
    const waiting: (() => void)[] = []
    const r = room({
      published: true,
      make: () => new Promise<Drawer>((made) => waiting.push(() => made(new Drawer({ mode: 'disabled' })))),
    })
    const drawing = cameraBackground({ ...r.ports, chosen: 'none' })
    const blur = drawing.set('blur')
    await reached(waiting)
    const none = drawing.set('none')
    waiting.shift()?.()
    await Promise.all([blur, none])
    assert.equal(r.published()?.getProcessor(), undefined)
  })

  it('a background chosen while a plain camera still starts lands on it, never left off (Codex P1 on #342)', async () => {
    const r = room()
    const starting: (() => void)[] = []
    const drawing = cameraBackground({ ...r.ports, chosen: 'none' })
    const on = drawing.turnOn(
      () => new Promise<void>((started) => starting.push(() => void r.plain(true)().then(started))),
    )
    await reached(starting)
    const blur = drawing.set('blur')
    starting.shift()?.()
    await Promise.all([on, blur])
    assert.equal(r.published()?.getProcessor()?.effects.at(-1)?.mode, 'background-blur')
  })

  it('a choice changed while the remembered one loads is followed: drawn with it, never a plain camera', async () => {
    const waiting: (() => void)[] = []
    const r = room({
      make: () => new Promise<Drawer>((made) => waiting.push(() => made(new Drawer({ mode: 'disabled' })))),
    })
    const drawing = cameraBackground({ ...r.ports, chosen: 'blur' })
    const on = drawing.turnOn(r.plain(true))
    await reached(waiting)
    const dusk = drawing.set('dusk')
    waiting.shift()?.()
    await Promise.all([on, dusk])
    assert.equal(r.told.includes('plain on'), false)
    assert.equal(r.told.filter((t) => t === 'publish').length, 1)
    assert.deepEqual(r.published()?.getProcessor()?.effects.at(-1), {
      mode: 'virtual-background',
      imagePath: 'data:dusk',
    })
  })

  it('None chosen while the remembered one loads starts the camera plain, nothing drawn published', async () => {
    const waiting: (() => void)[] = []
    const r = room({
      make: () => new Promise<Drawer>((made) => waiting.push(() => made(new Drawer({ mode: 'disabled' })))),
    })
    const drawing = cameraBackground({ ...r.ports, chosen: 'blur' })
    const on = drawing.turnOn(r.plain(true))
    await reached(waiting)
    const none = drawing.set('none')
    waiting.shift()?.()
    await Promise.all([on, none])
    assert.equal(r.told.includes('publish'), false)
    assert.equal(r.told.includes('plain on'), true)
    assert.equal(r.published()?.getProcessor(), undefined)
  })
})
