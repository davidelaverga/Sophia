import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { describe, it } from 'node:test'
import type { SourceContent } from '@sophia/contracts'
import { ApiError } from '../../api/client.ts'
import {
  CITED_TEXT_WORDS,
  CitedTextMismatch,
  checkedCitedText,
  citedTextFailure,
  citedTextKey,
  citedTextPress,
  citedTextRegion,
  citedTextToggle,
  opensAsText,
  retryCitedText,
} from './cited-text.ts'

const SOURCE = '00000000-0000-4000-8000-0000000000e1'
const TEXT = 'Synthetic note — café ☕ <script>alert(1)</script>'

const content = (over: Partial<SourceContent> = {}): SourceContent => ({
  sourceId: SOURCE,
  sha256: createHash('sha256').update(TEXT, 'utf8').digest('hex'),
  mime: 'text/plain; charset=utf-8',
  byteLength: Buffer.byteLength(TEXT, 'utf8'),
  filename: 'source-00000000.txt',
  disposition: 'inline',
  text: TEXT,
  downloadUrl: null,
  expiresAt: null,
  ...over,
})

/** The same record with no inline text, as a stored file's read answers. */
function withoutText(over: Partial<SourceContent> = {}): SourceContent {
  const { text: _dropped, ...rest } = content(over)
  return rest
}

describe('a cited text is shown only once it is what its record says', () => {
  it('passes the exact text, plain text or Markdown, its hash case aside', async () => {
    assert.equal(await checkedCitedText(content(), SOURCE), TEXT)
    assert.equal(await checkedCitedText(content({ mime: 'text/markdown' }), SOURCE), TEXT)
    assert.equal(await checkedCitedText(content({ sha256: content().sha256.toUpperCase() }), SOURCE), TEXT)
  })

  it('refuses another source, a URL instead of text, no text, a type that is not text, another size or hash', async () => {
    await assert.rejects(
      checkedCitedText(withoutText({ downloadUrl: 'https://store.example/x' }), SOURCE),
      CitedTextMismatch,
    )
    await assert.rejects(checkedCitedText(withoutText(), SOURCE), CitedTextMismatch, 'no text')
    await assert.rejects(
      checkedCitedText(content({ downloadUrl: 'https://store.example/x' }), SOURCE),
      CitedTextMismatch,
    )
    const cases: [string, Partial<SourceContent>][] = [
      ['another source', { sourceId: '00000000-0000-4000-8000-0000000000e2' }],
      ['HTML', { mime: 'text/html' }],
      ['JSON', { mime: 'application/json' }],
      ['its length in characters, not bytes', { byteLength: TEXT.length }],
      ['one byte more', { text: `${TEXT} ` }],
      ['another hash', { sha256: '0'.repeat(64) }],
    ]
    for (const [why, over] of cases) {
      await assert.rejects(checkedCitedText(content(over), SOURCE), CitedTextMismatch, why)
    }
  })
})

describe('a row offers its text only where the read can open it', () => {
  it('plain text and Markdown, whatever their parameters or case', () => {
    for (const mime of ['text/plain', 'text/markdown', 'text/plain; charset=utf-8', 'Text/Markdown ; charset=UTF-8']) {
      assert.equal(opensAsText(mime), true, mime)
    }
  })

  it('no other type: a PDF, HTML, JSON, CSV, nothing at all', () => {
    for (const mime of ['application/pdf', 'text/html', 'application/json', 'text/csv', 'text/plainx', '']) {
      assert.equal(opensAsText(mime), false, mime)
    }
  })
})

describe('how a cited text that is not shown is said', () => {
  it('a refusal of any kind is one answer that names nothing; a mismatch and a failure are their own', () => {
    for (const status of [401, 403, 409, 422]) {
      assert.equal(citedTextFailure(new ApiError(status, 'not_found', 'x', 'never')), 'refused', String(status))
    }
    assert.equal(citedTextFailure(new CitedTextMismatch()), 'mismatch')
    assert.equal(citedTextFailure(new ApiError(503, 'unavailable', 'x', 'safe_read')), 'failed')
    assert.equal(citedTextFailure(new ApiError(0, 'outcome_unknown', 'No reply', 'safe_read')), 'failed')
    assert.equal(citedTextFailure(new Error('boom')), 'failed')
    assert.equal(CITED_TEXT_WORDS.refused, 'This source can’t be read here.')
  })

  it('asks again only after a failure, twice at most; never after a refusal or a mismatch', () => {
    const failed = new ApiError(503, 'unavailable', 'x', 'safe_read')
    assert.deepEqual(
      [0, 1, 2].map((n) => retryCitedText(n, failed)),
      [true, true, false],
    )
    assert.equal(retryCitedText(0, new ApiError(422, 'not_found', 'x', 'never')), false)
    assert.equal(retryCitedText(0, new CitedTextMismatch()), false)
  })

  it('names the press for what it does now, and the region for its citation', () => {
    assert.deepEqual([citedTextToggle(false), citedTextToggle(true)], ['Show text', 'Hide text'])
    assert.equal(citedTextRegion(1), 'Text of citation 1')
    assert.equal(citedTextRegion(null), 'Text of a source not cited in the text')
  })

  it('names each press for its citation, starting with the words it shows (WCAG 2.5.3)', () => {
    assert.equal(citedTextPress(false, 2), 'Show text of citation 2')
    assert.equal(citedTextPress(true, 2), 'Hide text of citation 2')
    assert.equal(citedTextPress(false, null), 'Show text of a source not cited in the text')
    for (const open of [false, true]) assert.ok(citedTextPress(open, 3).startsWith(citedTextToggle(open)))
  })

  it('keeps each open text under its account, report, version and source', () => {
    assert.deepEqual(citedTextKey('a@x', 'r', 'v', 's'), ['cited-text', 'a@x', 'r', 'v', 's'])
    assert.notDeepEqual(citedTextKey('a@x', 'r', 'v', 's'), citedTextKey('b@x', 'r', 'v', 's'))
  })
})
