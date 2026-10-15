import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { BackgroundEffect } from './background-preference.ts'
import { BackgroundUnavailable, cameraBackground } from './camera-background.ts'
import { mediaMessage } from './room-view.ts'

/** A processor as the test sees it: the effects it was given, in order. */
class Drawer {
  effects: BackgroundEffect[]
  constructor(first: BackgroundEffect) {
    this.effects = [first]
  }
  switchTo(effect: BackgroundEffect) {
    this.effects.push(effect)
    return Promise.resolve()
  }
}

/** The camera's track as LiveKit gives it: what it was drawn with, and what it was told. */
function track() {
  const told: string[] = []
  let processor: Drawer | undefined
  return {
    told,
    getProcessor: () => processor,
    setProcessor: (p: Drawer) => {
      processor = p
      told.push('set')
      return Promise.resolve()
    },
    stopProcessor: () => {
      processor = undefined
      told.push('stop')
      return Promise.resolve()
    },
  }
}

const picture = (id: string) => `data:${id}`

/** A loader the test lets go of when it says, as a slow first download of the processor. */
function heldLoader() {
  const waiting: (() => void)[] = []
  return {
    release: () => waiting.shift()?.(),
    make: (effect: BackgroundEffect) =>
      new Promise<Drawer>((resolve) => waiting.push(() => resolve(new Drawer(effect)))),
  }
}

describe('the camera’s background, as LiveKit draws it (call-backgrounds.md)', () => {
  it('a camera turning on gets the chosen background ready before it is published, never after', async () => {
    const drawing = cameraBackground({
      camera: () => null,
      make: (e) => Promise.resolve(new Drawer(e)),
      chosen: 'blur',
      picture,
    })
    const options = await drawing.captureOptions()
    assert.ok(options.processor instanceof Drawer, 'the processor goes with the capture, so the first frame is drawn')
    assert.deepEqual(options.processor.effects, [{ mode: 'background-blur', blurRadius: 12 }])
    const none = cameraBackground({
      camera: () => null,
      make: () => Promise.reject(new Error('unused')),
      chosen: 'none',
      picture,
    })
    assert.deepEqual(await none.captureOptions(), {})
  })

  it('a camera only muted gets it on its own track before it is unmuted', async () => {
    const t = track()
    const drawing = cameraBackground({
      camera: () => t,
      make: (e) => Promise.resolve(new Drawer(e)),
      chosen: 'dusk',
      picture,
    })
    assert.deepEqual(await drawing.captureOptions(), {})
    assert.deepEqual(t.told, ['set'])
  })

  it('a background it can’t load keeps the camera off and says why, rather than sending what is behind', async () => {
    const drawing = cameraBackground({
      camera: () => null,
      make: () => Promise.reject(new Error('No WebGL')),
      chosen: 'blur',
      picture,
    })
    await assert.rejects(drawing.captureOptions(), BackgroundUnavailable)
    assert.equal(
      mediaMessage(new BackgroundUnavailable(new Error('No WebGL')), 'camera', true),
      'Couldn’t draw your background, so the camera stayed off. Choose None or try again.',
    )
  })

  it('a choice made while an earlier one still loads wins: the earlier one never takes effect', async () => {
    const t = track()
    const loader = heldLoader()
    const drawing = cameraBackground({ camera: () => t, make: loader.make, chosen: 'none', picture })
    const blur = drawing.set('blur')
    const none = drawing.set('none')
    loader.release()
    await Promise.all([blur, none])
    assert.equal(t.getProcessor(), undefined, 'None, as chosen last')
    assert.deepEqual(t.told, [])
  })

  it('on a camera that is on, a new background switches the one drawing; None stops it', async () => {
    const t = track()
    const drawing = cameraBackground({
      camera: () => t,
      make: (e) => Promise.resolve(new Drawer(e)),
      chosen: 'none',
      picture,
    })
    await drawing.set('blur')
    await drawing.set('dawn')
    const drawer = t.getProcessor()
    assert.ok(drawer)
    assert.deepEqual(drawer.effects, [
      { mode: 'background-blur', blurRadius: 12 },
      { mode: 'virtual-background', imagePath: 'data:dawn' },
    ])
    await drawing.set('none')
    assert.deepEqual(t.told, ['set', 'stop'])
  })
})
