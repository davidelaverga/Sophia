import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { componentSchemas, openapi } from './index.ts'

const body = (p: string) => readFileSync(p, 'utf8').split('\n').slice(1).join('\n')

describe('@sophia/contracts', () => {
  it('keeps openapi.json identical to the frozen pack until an amendment changes it', () => {
    const pack = readFileSync('docs/pack/api/openapi.json', 'utf8')
    const ours = readFileSync('packages/contracts/openapi/openapi.json', 'utf8')
    assert.equal(ours, pack)
  })

  it("generates types equal to the pack's generator output (apart from the header line)", () => {
    const r = spawnSync(process.execPath, ['packages/contracts/scripts/generate-types.ts', '--check'], {
      encoding: 'utf8',
    })
    assert.deepEqual({ status: r.status, stderr: r.stderr }, { status: 0, stderr: '' })
    assert.equal(body('packages/contracts/src/generated-types.ts'), body('docs/pack/api/generated-types.ts'))
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
