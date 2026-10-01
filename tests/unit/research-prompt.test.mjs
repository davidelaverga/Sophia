/**
 * The research specialists' prompt section (SMC-M03 S4, plan §2.10): versioned and pinned, M01-style. A change to the
 * text is a new id and a new recorded hash here, reviewed with the evidence of what it changes.
 */

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { RESEARCH_PROMPT } from '../../packages/dsh-bundle/dist/research-prompt.js'
import { RESEARCH_TOOL_NAMES } from '../../packages/dsh-bundle/dist/research-tools.js'
import { SPECIALISTS } from '../../packages/dsh-bundle/dist/specialists.generated.js'

test('the research section is the recorded version, byte for byte', () => {
  assert.equal(RESEARCH_PROMPT.id, 'sophia.research-base.v1+markdown.v1')
  assert.equal(createHash('sha256').update(RESEARCH_PROMPT.text).digest('hex'), '30af50b80073037d0a64845654ffcb3837cad71fd678b8dbe0b6cd5deb5fa591')
  assert.equal(RESEARCH_PROMPT.order, 650)
})

test('it names only tools that exist, and each one a research specialist is offered', () => {
  const named = new Set(RESEARCH_PROMPT.text.match(/\bresearch_[a-z_]+\b/g))
  for (const name of named) assert.ok(RESEARCH_TOOL_NAMES.includes(name), `${name} is a research tool`)
  for (const s of SPECIALISTS) for (const name of named) assert.ok(s.nativeTools.includes(name), `${s.id} offers ${name}`)
  assert.equal(/\{\{|\}\}/.test(RESEARCH_PROMPT.text), false, 'no template variables')
})
