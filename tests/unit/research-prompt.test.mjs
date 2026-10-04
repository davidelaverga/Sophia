/**
 * The research specialists' prompt section (SMC-M03 S4, plan §2.10): versioned and pinned, M01-style. A change to the
 * text is a new id and a new recorded hash here, reviewed with the evidence of what it changes.
 */

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { PDF_PROMPT, RESEARCH_PROMPT } from '../../packages/dsh-bundle/dist/research-prompt.js'
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

test("the PDF section is the recorded version, after the base, naming only what a PDF specialist is offered", () => {
  assert.equal(PDF_PROMPT.id, 'sophia.research-format-pdf.v1')
  assert.equal(createHash('sha256').update(PDF_PROMPT.text).digest('hex'), 'c95b8aa74e5a0fc2fe5d55deee0753cb732a51ed78339d3ff3c02bf71c6cc1f5')
  assert.ok(PDF_PROMPT.order > RESEARCH_PROMPT.order)
  const named = new Set(PDF_PROMPT.text.match(/\bresearch_[a-z_]+\b/g))
  assert.ok(named.has('research_render_pdf') && named.has('research_inspect_output'))
  const pdf = SPECIALISTS.filter((s) => s.nativeTools.includes('research_render_pdf'))
  assert.ok(pdf.length > 0)
  for (const name of named) {
    assert.ok(RESEARCH_TOOL_NAMES.includes(name), `${name} is a research tool`)
    for (const s of pdf) assert.ok(s.nativeTools.includes(name), `${s.id} offers ${name}`)
  }
  assert.equal(/\{\{|\}\}/.test(PDF_PROMPT.text), false, 'no template variables')
})
