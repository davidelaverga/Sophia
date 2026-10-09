// WBC-02: the registry now also holds the source reviewer, which writes Markdown too; research admission must never
// resolve to it.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { RESEARCH_SPECIALISTS, specialistFor } from './research-tools.ts'

describe('research specialists', () => {
  it('are the registry’s research roles only, never the source reviewer', () => {
    assert.ok(RESEARCH_SPECIALISTS.length > 0)
    assert.ok(RESEARCH_SPECIALISTS.every((s) => s.taskKind === 'research'))
    assert.equal(specialistFor(['markdown'])?.role, 'sophia-research-md-v1')
    assert.equal(specialistFor(['pdf', 'markdown'])?.role, 'sophia-research-pdf-v1')
  })
})
