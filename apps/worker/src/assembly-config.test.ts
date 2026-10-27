// The worker's choice of assembly (0084, FND-B-ASK-ALTERNATIVE-01) from its environment: the login route unless the fixed
// mode is chosen, and then never an assembler login beside it, so neither route is ever a fallback for the other.
import assert from 'node:assert/strict'
import { it } from 'node:test'
import { assemblyConfig } from './runtime-dispatch.ts'

const workerUrl = 'postgres://worker@db.invalid/sophia'
const assemblerUrl = 'postgres://assembler@db.invalid/sophia'

it('unset or login: the assembler login if there is one, through the login route; otherwise none', () => {
  assert.deepEqual(assemblyConfig({ workerUrl }), { assemblerUrl: null, assemblyMode: 'login' })
  assert.deepEqual(assemblyConfig({ workerUrl, SOPHIA_ASSEMBLER_DATABASE_URL: ` ${assemblerUrl} ` }), {
    assemblerUrl,
    assemblyMode: 'login',
  })
  assert.deepEqual(
    assemblyConfig({ workerUrl, SOPHIA_CONVERSATION_ASSEMBLY: 'login', SOPHIA_ASSEMBLER_DATABASE_URL: assemblerUrl }),
    { assemblerUrl, assemblyMode: 'login' },
  )
})

it('fixed: the worker’s own login through the fixed readers', () => {
  assert.deepEqual(assemblyConfig({ workerUrl, SOPHIA_CONVERSATION_ASSEMBLY: 'fixed' }), {
    assemblerUrl: workerUrl,
    assemblyMode: 'fixed',
  })
})

it('fixed with an assembler login set as well is refused, and so is any other mode', () => {
  assert.throws(
    () =>
      assemblyConfig({ workerUrl, SOPHIA_CONVERSATION_ASSEMBLY: 'fixed', SOPHIA_ASSEMBLER_DATABASE_URL: assemblerUrl }),
    /unset SOPHIA_ASSEMBLER_DATABASE_URL/,
  )
  assert.throws(() => assemblyConfig({ workerUrl, SOPHIA_CONVERSATION_ASSEMBLY: 'owner' }), /login or fixed/)
})
