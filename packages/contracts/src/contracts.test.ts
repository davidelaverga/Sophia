import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { componentSchemas, openapi } from './index.ts'
import { typesFromOpenApi, type OpenApi } from './openapi-types.ts'

/** Everything but the first line, which names the generator. */
const body = (text: string) => text.split('\n').slice(1).join('\n')
const run = (script: string) => {
  const r = spawnSync(process.execPath, [script, '--check'], { encoding: 'utf8' })
  return { status: r.status, stderr: r.stderr }
}

describe('@sophia/contracts', () => {
  it('equals the frozen pack contract plus the amendments, and nothing else', () => {
    assert.deepEqual(run('packages/contracts/scripts/apply-amendments.ts'), { status: 0, stderr: '' })
  })

  it("generates types from the contract, and exactly the pack's types from the pack's contract", () => {
    assert.deepEqual(run('packages/contracts/scripts/generate-types.ts'), { status: 0, stderr: '' })
    const pack = JSON.parse(readFileSync('docs/pack/api/openapi.json', 'utf8')) as OpenApi
    assert.equal(body(typesFromOpenApi(pack, '')), body(readFileSync('docs/pack/api/generated-types.ts', 'utf8')))
  })

  it('exposes every component schema with resolvable $refs', () => {
    const schemas = componentSchemas()
    const ids = new Set(schemas.map((s) => s.$id))
    assert.equal(ids.size, Object.keys(openapi.components.schemas).length)
    for (const s of schemas) {
      for (const [, ref] of JSON.stringify(s).matchAll(/"\$ref":"(\w+)#"/g))
        assert.ok(ref !== undefined && ids.has(ref), `unresolved $ref ${ref}`)
    }
  })
})
