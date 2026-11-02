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
  assert.equal(RESEARCH_PROMPT.id, 'sophia.research-base.v2+markdown.v1')
  assert.equal(createHash('sha256').update(RESEARCH_PROMPT.text).digest('hex'), '127ba7f393670b6b05985ce1a20ab2e95eae93aaaf37358497e306dc9a2f61ee')
  assert.equal(RESEARCH_PROMPT.order, 650)
  // Base v2 (0091), Markdown v1: the Markdown section is the recorded v1, byte for byte.
  const markdown = RESEARCH_PROMPT.text.slice(RESEARCH_PROMPT.text.indexOf('## Markdown report'))
  assert.equal(createHash('sha256').update(markdown).digest('hex'), 'b32a25e8de3121f9b41f395be5c43012e09236a91331b408b9832ab40d372265')
})

test('base v2 says only what the worker did: no claim about formats it does not deliver or tools Sophia has', () => {
  const text = RESEARCH_PROMPT.text
  // The research worker delivers the formats its task names; an HTML design is Sophia's separate, later work.
  assert.match(text, /A format it does not name is not yours to deliver/)
  assert.match(text, /Sophia may design that page separately, after your result is published, if a designer is admitted and available/)
  assert.match(text, /Do not state whether any such format was or will be delivered/)
  assert.match(text, /do not infer which tools Sophia has from the tools you were given/)
  assert.match(text, /never about Sophia's other capabilities/)
  // Citations and inference: sourced premises, labelled conclusions, no citation for what a source does not say.
  assert.match(text, /Label a recommendation or an inference as yours, and cite the sources for the facts it rests on/)
  assert.match(text, /never attach a citation to a claim the source does not make/)
  // A source-only request stays source-only, and its gaps are stated, not filled.
  assert.match(text, /When the request limits you to the inputs it supplied, use only those and do not search/)
  // It grants nothing: no HTML or CSS, and the allowance, Hold and Stop rules stand.
  assert.equal(/\b(?:html|css)_[a-z_]+\b/i.test(text), false, 'no HTML or CSS tool is named')
  assert.match(text, /Hold and Stop come from the application/)
  assert.match(text, /never write HTML or CSS|No active HTML/)
})

test('it names only tools that exist, and each one every research specialist is offered', () => {
  const named = new Set(RESEARCH_PROMPT.text.match(/\bresearch_[a-z_]+\b/g))
  for (const name of named) assert.ok(RESEARCH_TOOL_NAMES.includes(name), `${name} is a research tool`)
  // The design roles (SDD-01) and the source reviewer (WBC-02) have their own prompt sections and tools; this section
  // is the research family's.
  const research = SPECIALISTS.filter((s) => s.taskKind === 'research')
  assert.ok(research.length > 0)
  for (const s of research) for (const name of named) assert.ok(s.nativeTools.includes(name), `${s.id} offers ${name}`)
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
