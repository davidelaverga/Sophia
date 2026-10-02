import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { focusLater } from './focus.ts'

/** A page with the focus on the page itself, and controls that take it when focused. */
function page() {
  const body = { name: 'body' }
  const doc = { body, activeElement: body as unknown }
  const control = (name: string) => {
    const el = { name, focus: () => (doc.activeElement = el) }
    return el
  }
  Reflect.set(globalThis, 'document', doc)
  return { doc, body, control }
}

const done = () => Reflect.deleteProperty(globalThis, 'document')

describe('a focus move that waits (focusLater)', () => {
  it('moves the focus once its wait ends, when the person left it where the act did', () => {
    const { doc, control } = page()
    try {
      const pressed = control('Take back')
      const heading = control('Work')
      pressed.focus()
      const land = focusLater()
      land(heading as unknown as HTMLElement) // the pressed control is still on screen, about to go
      assert.equal(doc.activeElement, heading)
    } finally {
      done()
    }
  })

  it('moves it when it was dropped meanwhile (its control gone)', () => {
    const { doc, body, control } = page()
    try {
      const pressed = control('Take back')
      const heading = control('Work')
      pressed.focus()
      const land = focusLater()
      doc.activeElement = body
      land(heading as unknown as HTMLElement)
      assert.equal(doc.activeElement, heading)
    } finally {
      done()
    }
  })

  it('leaves it where the person put it when they moved on meanwhile', () => {
    const { doc, control } = page()
    try {
      const pressed = control('Talk instead')
      const field = control('Message Sophia')
      const elsewhere = control('Note this')
      pressed.focus()
      const land = focusLater()
      elsewhere.focus()
      land(field as unknown as HTMLElement)
      assert.equal(doc.activeElement, elsewhere)
    } finally {
      done()
    }
  })
})
