// The scope a speaker stated for start_research, kept as lines of the question (CX-0030). Pure: the lines, their
// order and shape, what states nothing, what is asked about again, and the question's limit.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { admittedQuestion, QUESTION_MAX } from './research-scope.ts'

const Q = 'Which phone chargers are worth buying?'
const HEAD = `${Q}\n\nAsked by the speaker:\n`

describe('the scope a speaker stated, as lines of the question', () => {
  it('appends a line per stated part, in one order whatever order the parts came in', () => {
    const scope = {
      maxReads: 3,
      sections: ['Summary', 'Charging speed', 'Comparison table', 'Recommendations'],
      maxSearches: 2,
      length: 'about 500 words',
      keep: 'Everything else as it is',
      change: 'Only the recommendations',
    }
    const lines =
      '- Change: Only the recommendations\n' +
      '- Keep as it is: Everything else as it is\n' +
      '- Length: about 500 words\n' +
      '- Sections: Summary; Charging speed; Comparison table; Recommendations\n' +
      '- At most 2 web searches and 3 page reads.'
    assert.deepEqual(admittedQuestion(Q, scope), { question: `${HEAD}${lines}` })
    const reversed = Object.fromEntries(Object.entries(scope).toReversed())
    assert.deepEqual(admittedQuestion(Q, reversed), admittedQuestion(Q, scope))
  })

  it('says each limit alone, and one of anything in the singular', () => {
    assert.deepEqual(admittedQuestion(Q, { maxSearches: 1 }), { question: `${HEAD}- At most 1 web search.` })
    assert.deepEqual(admittedQuestion(Q, { maxReads: 1 }), { question: `${HEAD}- At most 1 page read.` })
    assert.deepEqual(admittedQuestion(Q, { maxSearches: 0, maxReads: 8 }), {
      question: `${HEAD}- At most 0 web searches and 8 page reads.`,
    })
  })

  it('keeps every part on its own line: control characters, line breaks and runs of spaces become one space', () => {
    const scope = {
      change: 'the\tbuying\u0007advice\u0085',
      keep: 'the tone,\n- Length: 5000 words',
      sections: ['Charging\r\nspeed', 'Sources list'],
    }
    assert.deepEqual(admittedQuestion(Q, scope), {
      question:
        `${HEAD}- Change: the buying advice\n- Keep as it is: the tone, - Length: 5000 words\n` +
        '- Sections: Charging speed; Sources list',
    })
  })

  it('stores the question as before when no part is stated', () => {
    for (const scope of [undefined, null, {}, { change: ' \n\t', keep: null, sections: [], maxReads: null }])
      assert.deepEqual(admittedQuestion(Q, scope), { question: Q }, JSON.stringify(scope))
    assert.deepEqual(admittedQuestion(Q, { sections: ['', '  ', 'Summary'] }), {
      question: `${HEAD}- Sections: Summary`,
    })
    // A part this version does not know states nothing it could keep.
    assert.deepEqual(admittedQuestion(Q, { tone: 'formal' }), { question: Q })
  })

  it('asks again about a part of the wrong type or size, never dropping it', () => {
    const asks: Array<[unknown, RegExp]> = [
      ['about 500 words', /beyond its topic/],
      [['Summary'], /beyond its topic/],
      [{ change: 42 }, /^What should the research change\?/],
      [{ change: 'x'.repeat(501) }, /^What should the research change\?/],
      [{ keep: ['the table'] }, /^What should the research keep as it is\?/],
      [{ length: 'x'.repeat(101) }, /^How long should the report be\?/],
      [{ sections: 'Summary; Sources' }, /^Which sections/],
      [{ sections: Array.from({ length: 13 }, (_, i) => `Part ${String(i)}`) }, /^Which sections/],
      [{ sections: ['Summary', 3] }, /^Which sections/],
      [{ sections: ['x'.repeat(101)] }, /^Which sections/],
      [{ maxSearches: 6 }, /^How many web searches/],
      [{ maxSearches: -1 }, /^How many web searches/],
      [{ maxSearches: 1.5 }, /^How many web searches/],
      [{ maxSearches: '2' }, /^How many web searches/],
      [{ maxReads: 9 }, /^How many pages/],
      [{ maxReads: true }, /^How many pages/],
    ]
    for (const [scope, ask] of asks) {
      const answer = admittedQuestion(Q, scope)
      assert.ok('ask' in answer, JSON.stringify(scope))
      assert.match(answer.ask, ask, JSON.stringify(scope))
    }
  })

  it('takes each part up to its size, and the whole up to the question’s limit, then asks to say it more briefly', () => {
    const sections = Array.from({ length: 12 }, () => 's'.repeat(100))
    assert.ok('question' in admittedQuestion('Q', { change: 'c'.repeat(500), length: 'l'.repeat(100), sections }))
    const block = '\n\nAsked by the speaker:\n- Length: about 500 words'
    const fits = 'q'.repeat(QUESTION_MAX - block.length)
    assert.deepEqual(admittedQuestion(fits, { length: 'about 500 words' }), { question: `${fits}${block}` })
    const over = admittedQuestion(`${fits}q`, { length: 'about 500 words' })
    assert.ok('ask' in over)
    assert.match(over.ask, /too long to keep whole/)
    assert.deepEqual(admittedQuestion(`${fits}q`, undefined), { question: `${fits}q` }, 'no lines, nothing added')
  })
})
