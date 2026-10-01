import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { deviceChange } from './device-change.ts'

const refused = () => Promise.reject(new Error('refused'))

describe('a device change', () => {
  it('took when LiveKit took it', async () => {
    await deviceChange(Promise.resolve(), () => false)
  })

  it('took when LiveKit refused it but the device is as asked (an off whose pending publication failed)', async () => {
    await deviceChange(refused(), () => true)
  })

  it('failed when LiveKit refused it and the device is not as asked', async () => {
    await assert.rejects(
      deviceChange(refused(), () => false),
      /refused/,
    )
  })
})
