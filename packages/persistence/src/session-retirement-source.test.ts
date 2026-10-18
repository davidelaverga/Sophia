import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

// Migration 0075 replaces two functions whose latest definitions are elsewhere (dispatch_runtime_outbox in 0064,
// runtime_hello in 0071, which carries A40). Each replacement must be that definition byte for byte, plus its one
// marked insertion: an older copy would erase what later migrations added (conversations, executor advertisement).
const migration = (name: string) => readFileSync(new URL(`../../../db/migrations/${name}`, import.meta.url), 'utf8')

/** One `CREATE OR REPLACE FUNCTION sophia.<name>` statement of a migration, through its closing `END $$;`. */
function definition(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION sophia.${name}(`)
  assert.notEqual(start, -1, `${name} is defined`)
  const end = sql.indexOf('\nEND $$;', start)
  return sql.slice(start, end + '\nEND $$;'.length)
}

/** A marked 0075 insertion (RETIRE-<name>-BEGIN … -END), and nothing else, is what a replacement adds. */
const withoutInsertion = (body: string, name: string) => {
  const pattern = new RegExp(
    String.raw`^[ \t]*-- RETIRE-${name}-BEGIN[^\n]*\n[\s\S]*?^[ \t]*-- RETIRE-${name}-END[^\n]*\n`,
    'm',
  )
  assert.match(body, pattern, `marked RETIRE-${name}`)
  return body.replace(pattern, '')
}

describe('0075 replaces the latest definitions with one marked insertion each', () => {
  const retired = migration('0075_completed_goal_session_retirement.sql')

  it('dispatch_runtime_outbox is 0064’s, plus RETIRE-KIND: retire_sessions is sent as the runtime’s stop', () => {
    const latest = definition(migration('0064_conversation_runtime.sql'), 'dispatch_runtime_outbox')
    assert.equal(withoutInsertion(definition(retired, 'dispatch_runtime_outbox'), 'KIND'), latest)
  })

  it('runtime_hello is 0071’s, plus RETIRE-HELLO: a completed goal retired at its epoch reports its bindings stopped', () => {
    const latest = definition(migration('0071_conversation_context_before_dispatch.sql'), 'runtime_hello')
    assert.equal(withoutInsertion(definition(retired, 'runtime_hello'), 'HELLO'), latest)
  })

  it('leaves ordinary goal admission alone: admit_goal_command is not redefined', () => {
    assert.equal(retired.includes('FUNCTION sophia.admit_goal_command'), false)
  })
})
