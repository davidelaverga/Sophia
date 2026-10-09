/**
 * The source reviewer's prompt section (WBC-02 G3): versioned and pinned like the research section. A change to the
 * text is a new id and a new recorded hash here, reviewed with the evidence of what it changes.
 */

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { RESEARCH_PROMPT } from '../../packages/dsh-bundle/dist/research-prompt.js'
import { REVIEW_PROMPT } from '../../packages/dsh-bundle/dist/review-prompt.js'
import { REVIEW_TOOL_NAMES } from '../../packages/dsh-bundle/dist/review-tools.js'
import { SPECIALISTS } from '../../packages/dsh-bundle/dist/specialists.generated.js'

test('the review section is the recorded version, byte for byte, as the manifest names it', () => {
  assert.equal(REVIEW_PROMPT.id, 'sophia-source-review-instruction-v1')
  assert.equal(createHash('sha256').update(REVIEW_PROMPT.text).digest('hex'), 'c8a7afaf7c98af64dac019eefabc12e8819416039288e3671f26c09c8b5a6fba')
  assert.equal(REVIEW_PROMPT.order, 650)
})

test('it names exactly the three review tools, each one the reviewer is offered, and nothing of research', () => {
  const named = new Set(REVIEW_PROMPT.text.match(/\b(?:read_review_source|submit_source_review|report_review_blocker|research_[a-z_]+)\b/g))
  assert.deepEqual([...named].sort(), [...REVIEW_TOOL_NAMES].sort())
  const reviewers = SPECIALISTS.filter((s) => s.taskKind === 'source_review')
  assert.deepEqual(reviewers.map((s) => s.id), ['sophia-source-review-v1'])
  for (const s of reviewers) assert.deepEqual([...s.nativeTools].sort(), [...REVIEW_TOOL_NAMES].sort())
  assert.equal(/\{\{|\}\}/.test(REVIEW_PROMPT.text), false, 'no template variables')
  assert.notEqual(REVIEW_PROMPT.text, RESEARCH_PROMPT.text)
})

test('it keeps the five sections the service checks, and says a review accepts nothing', () => {
  for (const heading of ['Goal', 'Evidence inspected', 'Findings', 'What remains unknown', 'Suggested next action']) {
    assert.ok(REVIEW_PROMPT.text.includes(heading), heading)
  }
  assert.match(REVIEW_PROMPT.text, /does not accept the implementation/)
  assert.match(REVIEW_PROMPT.text, /Do not search the web, execute shell commands/)
})
