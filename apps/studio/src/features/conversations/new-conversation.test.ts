import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { MissionDecision } from '@sophia/contracts'
import { askOf, fitQuestion, QUESTION_LIMIT, sameQuestion, startable, startersOf } from './new-conversation.ts'

const pending = (statement: string, day = 1) =>
  ({ statement, state: 'proposed', createdAt: `2026-10-0${String(day)}T09:00:00.000Z` }) as unknown as MissionDecision

describe('starting a conversation (C8)', () => {
  it('an empty first message is the question; words are trimmed', () => {
    assert.deepEqual(askOf({ title: '  Short or long briefs? ', text: '  ', askSophia: true }), {
      title: 'Short or long briefs?',
      text: 'Short or long briefs?',
      askSophia: true,
    })
    assert.deepEqual(askOf({ title: 'Q', text: ' More. ', askSophia: false }), {
      title: 'Q',
      text: 'More.',
      askSophia: false,
    })
  })

  it('a question is enough to start', () => {
    assert.equal(startable({ title: 'Q', text: '', askSophia: true }), true)
    assert.equal(startable({ title: '   ', text: 'Only context', askSophia: true }), false)
  })

  it('the starters: proposals waiting, newest first, three at most, none already the question', () => {
    const all = ['One page', 'Cite every claim', 'Name a setup owner', 'Map first, list second'].map((s, i) =>
      pending(s, i + 1),
    )
    assert.deepEqual(startersOf(all, '', 120), ['Map first, list second', 'Name a setup owner', 'Cite every claim'])
    assert.deepEqual(startersOf(all, 'Name a setup owner', 120), [
      'Map first, list second',
      'Cite every claim',
      'One page',
    ])
    assert.deepEqual(startersOf(undefined, '', 120), [])
  })

  it('a proposal longer than a question can be is not offered', () => {
    assert.deepEqual(startersOf([pending('x'.repeat(121)), pending('Short')], '', 120), ['Short'])
  })
})

/** A conversation here, by its title and when it last moved. */
const asked = (id: string, title: string, lastAt: string) => ({ id, title, lastAt })

describe('the same question, already asked here', () => {
  const here = [
    asked('c1', 'What makes a report worth reading?', '2026-10-06T05:42:00Z'),
    asked('c2', 'Short or long briefs?', '2026-10-05T10:00:00Z'),
    asked('c3', 'Who owns setup when an admin changes?', '2026-10-04T09:00:00Z'),
  ]
  it('finds the conversation that asks about the same thing, its words in any order', () => {
    assert.equal(sameQuestion('Should briefs be short or long?', here)?.id, 'c2')
    assert.equal(sameQuestion('What makes a good report?', here)?.id, 'c1')
    assert.equal(sameQuestion('who owns the setup after an admin change', here)?.id, 'c3')
  })
  it('says nothing for one shared word, only common words, or too few of the question’s', () => {
    assert.equal(sameQuestion('Budget for the Q4 hiring plan', here), null)
    assert.equal(sameQuestion('What should we do?', here), null)
    assert.equal(sameQuestion('A report', here), null)
    assert.equal(sameQuestion('Report deadlines, owners, reviewers and the launch budget', here), null)
    assert.equal(sameQuestion('', here), null)
  })
  it('takes the most shared, then the newest', () => {
    const two = [
      asked('old', 'Short briefs or long briefs?', '2026-10-01T00:00:00Z'),
      asked('new', 'Long or short briefs?', '2026-10-07T00:00:00Z'),
    ]
    assert.equal(sameQuestion('Should briefs be short or long?', two)?.id, 'new')
  })
})

describe('words given as a question', () => {
  it('fit its limit: as they are when short, cut at a word with an ellipsis when longer', () => {
    assert.equal(fitQuestion('  zebra crossings  '), 'zebra crossings')
    const long = Array.from({ length: 40 }, (_, i) => `word${String(i)}`).join(' ')
    const fitted = fitQuestion(long)
    assert.ok(fitted.length <= QUESTION_LIMIT, String(fitted.length))
    assert.ok(fitted.endsWith('…'))
    assert.ok(long.startsWith(fitted.slice(0, -1)))
  })
})

describe('the same question, its turning words (Codex on #266)', () => {
  const here = [
    asked('a', 'Should we enable dark mode?', '2026-10-01T00:00:00Z'),
    asked('b', 'Ship the export before the review?', '2026-10-01T00:00:00Z'),
  ]
  it('is not the same when one negates and the other does not, or says after where the other says before', () => {
    assert.equal(sameQuestion('Should we not enable dark mode?', here), null)
    assert.equal(sameQuestion('Shouldn\u2019t we enable dark mode?', here), null)
    assert.equal(sameQuestion('Ship the export after the review?', here), null)
    assert.equal(sameQuestion('Should we enable the dark mode?', here)?.id, 'a')
    assert.equal(sameQuestion('Ship export before review?', here)?.id, 'b')
  })
})

describe('words given as a question, whole characters (Codex on #267)', () => {
  it('never keeps half of a character crossing the cut', () => {
    const fitted = fitQuestion(`${'a'.repeat(118)}\u{1F600}${'b'.repeat(20)}`)
    assert.ok(fitted.length <= QUESTION_LIMIT)
    assert.ok(fitted.isWellFormed(), 'no lone surrogate')
    assert.ok(fitted.endsWith('…'))
  })
})

describe('the same question, words that make it another (Codex P2s on #266)', () => {
  const at = '2026-10-01T00:00:00Z'
  it('«cannot» negates, as «not» does', () => {
    assert.equal(sameQuestion('Can we enable dark mode?', [asked('a', 'We cannot enable dark mode', at)]), null)
    assert.equal(sameQuestion('Can we enable dark mode?', [asked('a', 'Can we enable the dark mode?', at)])?.id, 'a')
  })

  it('opposite actions ask opposite things', () => {
    const here = [
      asked('a', 'Should we enable email notifications?', at),
      asked('b', 'Should reports include charts?', at),
    ]
    assert.equal(sameQuestion('Should we disable email notifications?', here), null)
    assert.equal(sameQuestion('Should reports exclude charts?', here), null)
    // A paraphrase with turning words (a passive, another order) reads as another question: silence (round 10).
    assert.equal(
      sameQuestion('Should notifications be enabled?', [asked('a', 'Should we enable notifications?', at)]),
      null,
    )
    assert.equal(
      sameQuestion('Should we enable the notifications?', [asked('a', 'Should we enable notifications?', at)])?.id,
      'a',
    )
  })

  it('an action and its opposite both said on each side is the same question; the doubled forms count (Codex on #274)', () => {
    const both = [asked('a', 'Should we enable email and disable SMS?', at)]
    assert.equal(sameQuestion('Should we enable email and disable SMS?', both)?.id, 'a')
    assert.equal(sameQuestion('Should we enable email?', both), null)
    const start = [asked('a', 'Should we start email notifications?', at)]
    assert.equal(sameQuestion('Should email notifications be stopped?', start), null)
    assert.equal(sameQuestion('Stopping email notifications?', start), null)
  })

  it('the actions said of other things, numbers in labels, and irregular forms (Codex round 2 on #274)', () => {
    // Both actions said on each side, each of the other thing: the inverse question.
    const both = [asked('a', 'Should we enable email and disable SMS?', at)]
    assert.equal(sameQuestion('Should we disable email and enable SMS?', both), null)
    // A number inside a label («Q4») parts it from another («Q3»); the same number written with a separator meets.
    assert.equal(sameQuestion('Q3 revenue forecast', [asked('a', 'Q4 revenue forecast', at)]), null)
    assert.equal(sameQuestion('Goal of 1,000 active users', [asked('a', 'Goal of 1000 active users', at)])?.id, 'a')
    // «hidden» is «hide», «shown» is «show».
    const show = [asked('a', 'Should we show password input fields?', at)]
    assert.equal(sameQuestion('Should password input fields be hidden?', show), null)
    // A one-word thing across the voice meets; «password input fields» is read as «fields» against «password» (round 5's
    // declared limit: the form errs to silence).
    // A paraphrase with turning words (a passive, another order) reads as another question: silence (round 10).
    assert.equal(sameQuestion('Should passwords be shown?', [asked('a', 'Should we show passwords?', at)]), null)
    assert.equal(sameQuestion('Should we show the passwords?', [asked('a', 'Should we show passwords?', at)])?.id, 'a')
  })

  it('turning words read in the order they come: numbers by place, a passive voice, «before or after» (Codex round 3 on #274)', () => {
    // The same numbers in other places: another question.
    assert.equal(sameQuestion('Set tier 2 price to 1 dollars', [asked('a', 'Set tier 1 price to 2 dollars', at)]), null)
    // The same actions in the same order, said in the passive: the same question.
    const both = [asked('a', 'Should we enable email and disable SMS?', at)]
    // A paraphrase with turning words (a passive, another order) reads as another question: silence (round 10).
    assert.equal(sameQuestion('Should email be enabled and SMS disabled?', both), null)
    // «before or after review» against «before review or after review»: the same orders, in the same order.
    const orders = [asked('a', 'Ship the export before or after review?', at)]
    assert.equal(sameQuestion('Ship the export before review or after review?', orders)?.id, 'a')
  })

  it('two actions each keep their thing: the same actions on swapped things is another question (Codex round 4 on #274)', () => {
    const both = [asked('a', 'Should we enable email and disable SMS?', at)]
    assert.equal(sameQuestion('Should we enable SMS and disable email?', both), null)
    // The passive keeps them: the thing before its participle.
    // A paraphrase with turning words (a passive, another order) reads as another question: silence (round 10).
    assert.equal(sameQuestion('Should email be enabled and SMS disabled?', both), null)
    assert.equal(sameQuestion('Should SMS be enabled and email disabled?', both), null)
  })

  it('two orders or two numbers each keep their thing too (Codex round 5 on #274)', () => {
    const orders = [asked('a', 'Ship export before review and after approval', at)]
    assert.equal(sameQuestion('Ship export before approval and after review?', orders), null)
    const quarters = [asked('a', 'Compare Q1 revenue with Q2 costs', at)]
    assert.equal(sameQuestion('Compare Q1 costs with Q2 revenue', quarters), null)
    assert.equal(sameQuestion('Compare Q1 revenue with Q2 costs?', quarters)?.id, 'a')
  })

  it('a negation, an order or an action said once on each side keeps its thing; a decimal stays one (Codex round 7 on #274)', () => {
    assert.equal(sameQuestion('Should we use red, not blue?', [asked('a', 'Should we use blue, not red?', at)]), null)
    const order = [asked('a', 'Ship before review instead of approval', at)]
    assert.equal(sameQuestion('Ship before approval instead of review', order), null)
    assert.equal(sameQuestion('Ship before review, instead of approval?', order)?.id, 'a')
    assert.equal(sameQuestion('Target latency 1234 seconds', [asked('a', 'Target latency 1.234 seconds', at)]), null)
    assert.equal(sameQuestion('Goal of 1,000 active users', [asked('a', 'Goal of 1000 active users', at)])?.id, 'a')
  })

  it('a past tense is active, a passive needs its «be»; a contracted negation keeps its thing (Codex round 8 on #274)', () => {
    assert.equal(sameQuestion('Admins enabled dark mode?', [asked('a', 'Did admins enable dark mode?', at)])?.id, 'a')
    assert.equal(sameQuestion('Use red but don’t use blue?', [asked('a', 'Use blue but don’t use red?', at)]), null)
    assert.equal(sameQuestion('Use blue but do not use red?', [asked('a', 'Use blue but don’t use red?', at)])?.id, 'a')
  })

  it('with turning words on both sides, only the same words in the same order meet (Codex round 10 on #274)', () => {
    // A lone number moved between subjects, a spelled-out quantity: other questions.
    const budget = [asked('a', 'Set email budget to 5 instead of SMS', at)]
    assert.equal(sameQuestion('Set SMS budget to 5 instead of email', budget), null)
    assert.equal(
      sameQuestion('Compare two year revenue forecast', [asked('a', 'Compare one year revenue forecast', at)]),
      null,
    )
    assert.equal(sameQuestion('Set the email budget to 5, instead of SMS?', budget)?.id, 'a')
  })

  it('a compound ordinal is one number; a prefix keeps its own word (Codex round 28 on #274)', () => {
    assert.equal(sameQuestion('Twenty-first applicant?', [asked('a', '21st applicant?', at)])?.id, 'a')
    assert.equal(sameQuestion('Twenty-first applicant?', [asked('a', '20 and 1st applicants?', at)]), null)
    assert.equal(
      sameQuestion('Re-sign contracts with vendors?', [asked('a', 'Resign contracts with vendors?', at)]),
      null,
    )
    // Not a prefix: the hyphen still keeps the word whole.
    assert.equal(sameQuestion('Send the e-mail digest?', [asked('a', 'Send the email digest?', at)])?.id, 'a')
  })

  it('any punctuation ends a spelled number; a negating prefix stays a word of its own (Codex round 27 on #274)', () => {
    const total = [asked('a', 'Compare 10200 user budgets', at)]
    assert.equal(sameQuestion('Compare one hundred; two hundred user budgets', total), null)
    assert.equal(sameQuestion('Compare one hundred, two hundred user budgets', total), null)
    assert.equal(sameQuestion('Compare (one hundred) two hundred user budgets', total), null)
    const enabled = [asked('a', 'Should we use enabled email alerts?', at)]
    assert.equal(sameQuestion('Should we use never-enabled email alerts?', enabled), null)
    assert.equal(sameQuestion('Should we use non-enabled email alerts?', enabled), null)
  })

  it('a hyphen inside a word keeps the word whole; beside a number it is a boundary (Codex round 26 on #274)', () => {
    const email = [asked('a', 'Should we enable email alerts before launch?', at)]
    assert.equal(sameQuestion('Should we enable e-mail alerts before launch?', email)?.id, 'a')
    const art = [asked('a', 'Review the stateoftheart search plan', at)]
    assert.equal(sameQuestion('Review the state-of-the-art search plan', art)?.id, 'a')
    assert.equal(
      sameQuestion('Compare twenty-one year revenue forecast', [asked('a', 'Compare 21 year revenue forecast', at)])
        ?.id,
      'a',
    )
  })

  it('a compound number’s hyphen joins it; «had» and «has» read as the clitic does (Codex round 25 on #274)', () => {
    assert.equal(
      sameQuestion('Compare twenty-one year revenue forecast', [asked('a', 'Compare 21 year revenue forecast', at)])
        ?.id,
      'a',
    )
    const had = [asked('a', 'We had enabled email alerts before launch?', at)]
    assert.equal(sameQuestion('We\u2019d enabled email alerts before launch?', had)?.id, 'a')
    assert.equal(
      sameQuestion('She\u2019s enabled email alerts?', [asked('a', 'She has enabled email alerts?', at)])?.id,
      'a',
    )
  })

  it('a separator ends a spelled number; a clitic reads as its word (Codex round 24 on #274)', () => {
    const total = [asked('a', 'Compare 10200 user budgets', at)]
    assert.equal(sameQuestion('Compare one hundred/two hundred user budgets', total), null)
    assert.equal(sameQuestion('Compare one hundred\u2013two hundred user budgets', total), null)
    const ready = [asked('a', 'Should we enable email when we are ready?', at)]
    assert.equal(sameQuestion('Should we enable email when we\u2019re ready?', ready)?.id, 'a')
    const settings = [asked('a', 'Should we enable admin settings?', at)]
    assert.equal(sameQuestion('Should we enable the admin\u2019s settings?', settings)?.id, 'a')
  })

  it('a thousand and a million are two quantities (Codex round 23 on #274)', () => {
    assert.equal(
      sameQuestion('Compare one thousand and one million budgets', [asked('a', 'Compare 1001000000 budgets', at)]),
      null,
    )
    assert.equal(
      sameQuestion('Compare one thousand and one million budgets', [asked('a', 'Compare 1000 and 1000000 budgets', at)])
        ?.id,
      'a',
    )
  })

  it('a larger scale after «and» takes in the coefficient; a scale repeated multiplies (Codex round 22 on #274)', () => {
    const two = [asked('a', 'Set budget to 100 and 20000 dollars', at)]
    assert.equal(sameQuestion('Set budget to one hundred and twenty thousand dollars', two), null)
    const one = [asked('a', 'Set budget to 120000 dollars', at)]
    assert.equal(sameQuestion('Set budget to one hundred and twenty thousand dollars', one)?.id, 'a')
    assert.equal(
      sameQuestion('Set budget to one thousand thousand dollars', [asked('a', 'Set budget to 1000000 dollars', at)])
        ?.id,
      'a',
    )
  })

  it('every word but the filler keeps its place: quantifiers too (Codex round 21 on #274)', () => {
    const scope = [asked('a', 'Should we enable all alerts and disable some notices?', at)]
    assert.equal(sameQuestion('Should we enable some alerts and disable all notices?', scope), null)
    assert.equal(sameQuestion('Should we enable all the alerts and disable some notices?', scope)?.id, 'a')
  })

  it('an ordinal after a scale ends its number; a short figure still counts (Codex round 20 on #274)', () => {
    const two = [asked('a', 'Compare 100 and 1st applicant scores', at)]
    assert.equal(sameQuestion('Compare one hundred and first applicant score', two), null)
    const one = [asked('a', 'Compare 101st applicant score', at)]
    assert.equal(sameQuestion('Compare one hundred and first applicant score', one)?.id, 'a')
    assert.equal(sameQuestion('Version one?', [asked('a', 'Version one?', at)])?.id, 'a')
  })

  it('an «and» between two scaled quantities keeps them two (Codex round 19 on #274)', () => {
    assert.equal(
      sameQuestion('Compare one thousand and two thousand budgets', [asked('a', 'Compare 3000 budgets', at)]),
      null,
    )
    assert.equal(sameQuestion('Compare one hundred and five budgets', [asked('a', 'Compare 105 budgets', at)])?.id, 'a')
  })

  it('a demonstrative keeps its place; a larger scale takes in what came before (Codex round 18 on #274)', () => {
    assert.equal(
      sameQuestion('Should we allow that and block this?', [asked('a', 'Should we allow this and block that?', at)]),
      null,
    )
    const budget = [asked('a', 'Set budget to 1000000000 dollars', at)]
    assert.equal(sameQuestion('Set budget to one thousand million dollars', budget)?.id, 'a')
    assert.equal(
      sameQuestion('Set budget to one thousand million dollars', [asked('a', 'Set budget to 1001000 dollars', at)]),
      null,
    )
  })

  it('spelled numbers parsed whole, any ordinal; a double negation kept (Codex round 17 on #274)', () => {
    const budget = [asked('a', 'Set budgets to 1005 and 100 dollars', at)]
    assert.equal(sameQuestion('Set budget to one thousand five hundred dollars', budget), null)
    assert.equal(
      sameQuestion('Set budget to one thousand five hundred dollars', [asked('a', 'Set budget to 1500 dollars', at)])
        ?.id,
      'a',
    )
    const years = [asked('a', 'Compare thirteenth year revenue forecast', at)]
    assert.equal(sameQuestion('Compare fourteenth year revenue forecast', years), null)
    assert.equal(sameQuestion('Compare 13th year revenue forecast', years)?.id, 'a')
    assert.equal(
      sameQuestion('Compare twenty first year revenue forecast', [asked('a', 'Compare 21st year revenue forecast', at)])
        ?.id,
      'a',
    )
    const twice = [asked('a', 'Should we not enable email notifications?', at)]
    assert.equal(sameQuestion('Should we not not enable email notifications?', twice), null)
  })

  it('cannot and can’t are one negation; figures apart are not composed (Codex round 16 on #274)', () => {
    assert.equal(sameQuestion('We can’t enable dark mode?', [asked('a', 'We cannot enable dark mode?', at)])?.id, 'a')
    assert.equal(sameQuestion('Review release 20-1 status', [asked('a', 'Review release 21 status', at)]), null)
    assert.equal(
      sameQuestion('Review release twenty one status', [asked('a', 'Review release 21 status', at)])?.id,
      'a',
    )
  })

  it('what follows a scale is added to it (Codex round 15 on #274)', () => {
    const two = [asked('a', 'Compare 100- and 20-year revenue forecasts', at)]
    assert.equal(sameQuestion('Compare one hundred twenty year revenue forecast', two), null)
    const one = [asked('a', 'Compare 121 year revenue forecast', at)]
    assert.equal(sameQuestion('Compare one hundred twenty one year revenue forecast', one)?.id, 'a')
  })

  it('a scale composes; an ordinal reads the same in words and figures (Codex round 14 on #274)', () => {
    const hundred = [asked('a', 'Compare 100 year revenue forecast', at)]
    assert.equal(sameQuestion('Compare one hundred year revenue forecast', hundred)?.id, 'a')
    assert.equal(sameQuestion('Compare two hundred year revenue forecast', hundred), null)
    assert.equal(
      sameQuestion('Compare first year revenue forecast', [asked('a', 'Compare 1st year revenue forecast', at)])?.id,
      'a',
    )
    assert.equal(
      sameQuestion('Compare 2nd year revenue forecast', [asked('a', 'Compare first year revenue forecast', at)]),
      null,
    )
  })

  it('a pronoun keeps its place; a compound number is one (Codex round 13 on #274)', () => {
    assert.equal(
      sameQuestion('Should we allow us and block them?', [asked('a', 'Should we allow them and block us?', at)]),
      null,
    )
    const years = [asked('a', 'Compare 21 year revenue forecast', at)]
    assert.equal(sameQuestion('Compare twenty one year revenue forecast', years)?.id, 'a')
    assert.equal(sameQuestion('Compare twenty two year revenue forecast', years), null)
  })

  it('a repeated subject keeps its later place; an ordinal is a number (Codex round 12 on #274)', () => {
    const both = [asked('a', 'For email and SMS, should we enable email and disable SMS?', at)]
    assert.equal(sameQuestion('For email and SMS, should we enable SMS and disable email?', both), null)
    const years = [asked('a', 'Compare the first year revenue forecast', at)]
    assert.equal(sameQuestion('Compare the second year revenue forecast', years), null)
    assert.equal(sameQuestion('Compare the first year revenue forecast?', years)?.id, 'a')
  })

  it('a negation’s place, a decimal and a quantity past twelve count (Codex round 11 on #274)', () => {
    const choice = [asked('a', 'Should we enable email and not disable SMS?', at)]
    assert.equal(sameQuestion('Should we not enable email and disable SMS?', choice), null)
    assert.equal(sameQuestion('Support versions 1 and 2?', [asked('a', 'Support version 1.2?', at)]), null)
    const years = [asked('a', 'Compare thirteen year revenue forecast', at)]
    assert.equal(sameQuestion('Compare fourteen year revenue forecast', years), null)
    assert.equal(sameQuestion('Compare the thirteen year revenue forecast?', years)?.id, 'a')
  })

  it('a number’s sign is part of it (Codex round 9 on #274)', () => {
    const budget = [asked('a', 'Set budget change to 5 percent', at)]
    assert.equal(sameQuestion('Set budget change to -5 percent', budget), null)
    assert.equal(sameQuestion('Set the budget change to 5 percent?', budget)?.id, 'a')
  })

  it('a thing kept is read as scored: a final «s» dropped (Codex round 6 on #274)', () => {
    const both = [asked('a', 'Should we enable email and disable text?', at)]
    assert.equal(sameQuestion('Should we enable emails and disable texts?', both)?.id, 'a')
    const quarters = [asked('a', 'Compare Q1 revenue with Q2 cost', at)]
    assert.equal(sameQuestion('Compare Q1 revenues with Q2 costs', quarters)?.id, 'a')
  })

  it('different numbers on both sides ask about different things', () => {
    const here = [asked('a', '2025 revenue forecast', at)]
    assert.equal(sameQuestion('2026 revenue forecast', here), null)
    // A paraphrase with turning words (a passive, another order) reads as another question: silence (round 10).
    assert.equal(sameQuestion('Revenue forecast for 2025', here), null)
    assert.equal(sameQuestion('The 2025 revenue forecast?', here)?.id, 'a')
    assert.equal(sameQuestion('Revenue forecast', here)?.id, 'a')
  })

  it('with before and after both said, their order must match', () => {
    const here = [asked('a', 'Ship export before review and after approval', at)]
    assert.equal(sameQuestion('Ship export after review and before approval', here), null)
    assert.equal(sameQuestion('Ship the export before review, after approval?', here)?.id, 'a')
  })

  it('folds case the same whatever the device’s language (a Turkish locale’s dotless ı)', (t) => {
    // The device's locale for this check only: Turkish lowers «I» to a dotless «ı».
    t.mock.method(String.prototype, 'toLocaleLowerCase', function (this: string) {
      return this.replaceAll('I', 'ı').toLowerCase()
    })
    assert.equal('INVOICE'.toLocaleLowerCase(), 'ınvoıce', 'the locale stands in')
    assert.equal(sameQuestion('INVOICE STATUS', [asked('a', 'invoice status', at)])?.id, 'a')
  })
})

describe('the same question: the last words of #274 (docs/plans/same-question-words.md)', () => {
  const at = '2026-10-10T00:00:00Z'

  it('a long spelled number stays exact, meeting its figure (Codex P2 on #274)', () => {
    const big = [asked('a', 'Cap the ledger at 9000000000000000009 entries', at)]
    assert.equal(sameQuestion('Cap the ledger at nine million million million and nine entries', big)?.id, 'a')
  })

  it('a spelled negative is signed as a figure is (Codex P2 on #274)', () => {
    const budget = [asked('a', 'Set budget change to -5 percent', at)]
    assert.equal(sameQuestion('Set budget change to minus five percent', budget)?.id, 'a')
    assert.equal(sameQuestion('Set budget change to minus 5 percent', budget)?.id, 'a')
    assert.equal(sameQuestion('Set budget change to five percent', budget), null)
  })

  it('«let’s» keeps its «us» (Codex P2 on #274)', () => {
    const sms = [asked('a', 'Let us not enable SMS reminders', at)]
    assert.equal(sameQuestion('Let’s not enable SMS reminders', sms)?.id, 'a')
    assert.equal(sameQuestion("Let's not enable SMS reminders", sms)?.id, 'a')
  })

  it('the question is read once, however many conversations are compared (Codex P2 on #274)', (t) => {
    const question = 'Who owns setup when an admin changes?'
    const folds = (n: number) => {
      const normalize = t.mock.method(String.prototype, 'normalize')
      const many = Array.from({ length: n }, (_, i) => asked(`c${String(i)}`, `Setup owner number ${String(i)}`, at))
      sameQuestion(question, many)
      const count = normalize.mock.calls.filter((c) => String(c.this) === question).length
      normalize.mock.restore()
      return count
    }
    assert.equal(folds(20), folds(1))
  })
})
