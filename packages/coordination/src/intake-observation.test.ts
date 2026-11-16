import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  INTAKE_OBSERVATION_POLICY,
  INTAKE_OBSERVATION_POLICY_VERSION,
  LEXICON,
  ZERO_EFFECTS,
  observeIntake,
  observeWithLedger,
  policyDigest,
  renderAddressee,
  renderTarget,
  type IntakeObservation,
  type ObservationLedger,
} from './intake-observation.ts'

// Inputs here are written for the rule under test, not copied from the development corpus: a test that replayed the
// corpus with its expected answers would only mirror a lookup.

const AUTO = { contract: 'automatic_v1' } as const

function observe(text: string, context: Record<string, unknown>, interaction: unknown = AUTO): IntakeObservation {
  const result = observeIntake({ interaction, text, context })
  assert.ok(result.ok, `expected a valid input: ${JSON.stringify(result)}`)
  return result.observation
}

function errorCodes(raw: unknown): string[] {
  const result = observeIntake(raw)
  assert.equal(result.ok, false, 'an invalid input must not be classified')
  return result.ok ? [] : result.errors.map((e) => e.code)
}

const kindOf = (o: IntakeObservation) => o.proposal.kind
const project = { audience: 'project' } as const
const running = { audience: 'project', activeMission: 'missionB', control: 'running' } as const

describe('input validation', () => {
  it('requires an explicit legacy Ask boolean: omitted is invalid, never normalized to false', () => {
    assert.deepEqual(errorCodes({ interaction: { contract: 'legacy_explicit_ask' }, text: 'hi', context: project }), [
      'legacy_ask_missing',
    ])
    assert.deepEqual(
      errorCodes({
        interaction: { contract: 'legacy_explicit_ask', askSophia: 'false' },
        text: 'hi',
        context: project,
      }),
      ['invalid_interaction'],
    )
  })

  it('never opts into automatic_v1 by absence, and an automatic input cannot carry a legacy flag', () => {
    assert.deepEqual(errorCodes({ text: 'hi', context: project }), ['invalid_interaction'])
    assert.deepEqual(
      errorCodes({ interaction: { contract: 'automatic_v1', askSophia: true }, text: 'hi', context: project }),
      ['invalid_interaction'],
    )
  })

  it('refuses labels, unknown fields and wrong types instead of reading them', () => {
    assert.deepEqual(errorCodes({ interaction: AUTO, text: 'hi', context: { ...project, expected: {} } }), [
      'label_in_context',
    ])
    assert.deepEqual(errorCodes({ interaction: AUTO, text: 'hi', context: project, caseId: 'X-1' }), [
      'label_in_context',
    ])
    assert.deepEqual(errorCodes({ interaction: AUTO, text: 'hi', context: { ...project, grantEverything: true } }), [
      'unknown_context_field',
    ])
    assert.deepEqual(errorCodes({ interaction: AUTO, text: 'hi', context: { ...project, accepted: 'yes' } }), [
      'invalid_field',
    ])
    assert.deepEqual(errorCodes({ interaction: AUTO, text: 'hi', context: { audience: 'everyone' } }), [
      'invalid_field',
    ])
  })

  it('bounds text, strings and lists', () => {
    assert.deepEqual(errorCodes({ interaction: AUTO, text: 'x'.repeat(4001), context: project }), ['text_too_long'])
    assert.deepEqual(errorCodes({ interaction: AUTO, text: '   ', context: project }), ['invalid_text'])
    assert.deepEqual(errorCodes({ interaction: AUTO, text: 'hi', context: { ...project, repo: 'r'.repeat(201) } }), [
      'invalid_field',
    ])
    const many = Array.from({ length: 17 }, (_, i) => `m${i}`)
    assert.deepEqual(errorCodes({ interaction: AUTO, text: 'hi', context: { ...project, trustedMentions: many } }), [
      'invalid_field',
    ])
    assert.deepEqual(errorCodes(null), ['invalid_input'])
  })
})

describe('legacy explicit Ask', () => {
  const buildable = { ...project, repo: 'Z', selectedArtifact: 'card@v2', accepted: true, nativePair: 'qualified' }

  it('false records the message with no assessment, answer or work, whatever the text asks', () => {
    const o = observe('Implement the selected card in repo Z now.', buildable, {
      contract: 'legacy_explicit_ask',
      askSophia: false,
    })
    assert.equal(kindOf(o), 'recorded_only')
    assert.equal(o.assessment, 'not_permitted')
    assert.deepEqual(o.addressee.ids, [])
    assert.equal(o.admission.reason, 'legacy_ask_false_no_assessment')
  })

  it('true takes the existing explicit reply path, not routing', () => {
    const o = observe('Implement the selected card in repo Z now.', buildable, {
      contract: 'legacy_explicit_ask',
      askSophia: true,
    })
    assert.equal(kindOf(o), 'answer')
    assert.equal(o.admission.reason, 'legacy_explicit_path')
    assert.equal(o.assessment, 'not_permitted')
  })

  it('the same words under automatic_v1 propose work, so the contract alone decides the difference', () => {
    assert.equal(kindOf(observe('Implement the selected card in repo Z now.', buildable)), 'build_start')
  })
})

describe('quoted and generated text is evidence, not instruction', () => {
  it('a clear Stop is a control; the same Stop inside quotes is something to explain', () => {
    assert.equal(kindOf(observe('Stop the deploy.', running)), 'control_stop')
    const quoted = observe('What does "stop the deploy" mean here?', running)
    assert.notEqual(kindOf(quoted), 'control_stop')
    assert.equal(quoted.fenced.quotedSpans, 1)
  })

  it('fences code blocks, backticks, curly quotes and declared quoted or imported text', () => {
    for (const text of ['Summarize ```stop now```', 'Summarize `halt it`', 'Summarize “pause the work”']) {
      assert.equal(kindOf(observe(text, { ...running, selectedArtifact: 'log@v1' })), 'answer', text)
    }
    const imported = observe('Hold on, summarize the note.', {
      ...running,
      attachment: 'note@v1',
      attachmentInstruction: 'hold on',
    })
    assert.equal(kindOf(imported), 'answer')
    assert.equal(imported.fenced.quotedSpans, 1)
  })

  it('agent results and receipts never become a human instruction', () => {
    for (const origin of ['agent_result', 'receipt', 'generated']) {
      const o = observe('Build it now and deploy to production.', { ...running, repo: 'Z', origin, causedBy: 'opQ' })
      assert.equal(kindOf(o), 'no_action', origin)
      assert.deepEqual(o.addressee.ids, [])
      assert.equal(o.fenced.generatedOrigin, true)
      assert.equal(renderTarget(o.proposal.target), 'opQ')
    }
  })

  it('a textual @mention is no recipient', () => {
    const o = observe('Tell @maria to take the build', { ...project, untrustedTextMentions: ['maria'] })
    assert.ok(!o.addressee.ids.includes('maria'))
  })
})

describe('audience and recipients', () => {
  it('a private mention of a member records the message and notifies nobody', () => {
    const o = observe('Maria, are you free on Friday?', { audience: 'personal', trustedMentions: ['maria'] })
    assert.equal(kindOf(o), 'recorded_only')
    assert.equal(o.audience.attention, 'none')
    assert.equal(o.audience.change, 'unchanged')
    assert.equal(o.audience.scope, 'personal')
  })

  it('a shared human-directed message stays with its audience and gets no AI response', () => {
    const o = observe('@maria please implement the selected card', {
      ...project,
      trustedMentions: ['maria'],
      repo: 'Z',
      selectedArtifact: 'card@v2',
    })
    assert.equal(kindOf(o), 'human_message')
    assert.equal(o.audience.attention, 'audience_members')
    assert.deepEqual(o.addressee.ids, ['maria'])
  })

  it('trusted structure beats the text: "Sophia, …" with only Maria mentioned stays human', () => {
    const o = observe('Sophia, research this card.', {
      ...project,
      trustedMentions: ['maria'],
      selectedArtifact: 'c@v1',
    })
    assert.equal(kindOf(o), 'human_message')
  })

  it('a human reply target addresses that human; a Sophia mention alongside adds one answer', () => {
    const reply = observe('Sounds good.', { ...project, replyTo: 'msg9', replyAuthor: 'maria' })
    assert.equal(kindOf(reply), 'human_message')
    assert.equal(renderTarget(reply.proposal.target), 'msg9')
    const both = observe('Maria decide; Sophia, explain the options.', {
      ...project,
      trustedMentions: ['maria', 'sophia'],
      selectedComparison: ['card@v1', 'card@v2'],
    })
    assert.equal(kindOf(both), 'answer')
    assert.equal(renderAddressee(both.addressee.ids), 'maria+sophia')
    assert.equal(renderTarget(both.proposal.target), 'card@v1..v2')
  })

  it('drops a mention of someone who is not a current member', () => {
    const o = observe('Can you check this?', { ...project, trustedMentions: ['eve'], currentMembers: ['maria'] })
    assert.ok(!o.addressee.ids.includes('eve'))
    assert.ok(o.uncertainty.includes('mention_not_current_member'))
  })

  it('an untagged shared question with no context is not assumed to be for Sophia', () => {
    const o = observe('Did anyone book the room?', project)
    assert.equal(kindOf(o), 'abstain')
    assert.ok(o.uncertainty.includes('addressee_unresolved_shared_thread'))
  })
})

describe('targets and versions', () => {
  it('several plausible targets ask which one; a single one does not', () => {
    const two = observe('Polish it.', { ...project, possibleTargets: ['card@v1', 'banner@v2'] })
    assert.equal(kindOf(two), 'clarify')
    assert.equal(two.admission.outcome, 'clarification_required')
    assert.equal(renderTarget(two.proposal.target), 'unresolved')
    assert.notEqual(kindOf(observe('Research this.', { ...project, possibleTargets: ['card@v1'] })), 'clarify')
  })

  it('keeps the selected version, never the latest', () => {
    const o = observe('Build the selected card.', {
      ...project,
      repo: 'Z',
      selectedArtifact: 'card@v2',
      latestArtifact: 'card@v7',
      acceptedVersion: 'v2',
    })
    assert.equal(renderTarget(o.proposal.target), 'Z/card@v2')
    const stale = observe('Build the selected card.', {
      ...project,
      repo: 'Z',
      selectedArtifact: 'card@v2',
      acceptedVersion: 'v3',
    })
    assert.equal(stale.admission.reason, 'selected_version_not_accepted')
  })

  it('a build without a resolved repository asks rather than guessing one', () => {
    assert.equal(kindOf(observe('Build the selected card.', { ...project, selectedArtifact: 'card@v2' })), 'clarify')
    const repos = { ...project, selectedArtifact: 'card@v2', possibleRepos: ['Z', 'W'] }
    assert.equal(kindOf(observe('Implement this.', repos)), 'clarify')
    assert.equal(kindOf(observe('Implement this.', { ...repos, repo: 'Z' })), 'build_start')
  })
})

describe('ongoing, held and stopped work', () => {
  it('a question about held work reads retained evidence, or waits; it never starts a fresh turn', () => {
    const held = { ...running, control: 'held' }
    const read = observe('Where did it get to?', { ...held, retainedEvidence: 'last_checkpoint' })
    assert.equal(kindOf(read), 'work_read')
    const wait = observe('Where did it get to?', held)
    assert.equal(kindOf(wait), 'manager_inquiry')
    assert.deepEqual(wait.admission, { outcome: 'waiting', reason: 'held_no_fresh_inquiry', authority: 'none' })
    const stopped = observe('Where did it get to?', { ...running, control: 'stopped' })
    assert.equal(stopped.admission.reason, 'held_no_fresh_inquiry')
  })

  it('running work without evidence proposes one inquiry, recorded only once manager and generation are known', () => {
    const known = { ...running, inquiryGrant: 'qualified', manager: 'pmB', managerGeneration: 2 }
    const o = observe('Why was that test removed?', known)
    assert.equal(kindOf(o), 'manager_inquiry')
    assert.equal(o.admission.outcome, 'recorded_only')
    assert.deepEqual(o.proposal.target, {
      kind: 'mission',
      id: 'missionB',
      manager: 'pmB',
      generation: 2,
      binding: null,
    })
    const idOnly = observe('Why was that test removed?', { ...running, inquiryGrant: 'qualified' })
    assert.equal(idOnly.admission.reason, 'manager_identity_unresolved')
  })

  it('a follow-up queues to the one current mission; held work makes it wait', () => {
    const o = observe('Also cover the error state.', running)
    assert.equal(kindOf(o), 'manager_followup')
    assert.equal(renderTarget(o.proposal.target), 'missionB')
    assert.equal(o.proposal.route, 'native')
    assert.equal(
      observe('Also cover the error state.', { ...running, control: 'held' }).admission.reason,
      'mission_held',
    )
    assert.equal(kindOf(observe('Also cover the error state.', project)), 'abstain')
  })

  it('an unrelated build waits for the occupied slot; a related one follows the mission; unknown asks', () => {
    const base = { ...running, repo: 'Z', selectedArtifact: 'card@v2' }
    const unrelated = observe('Implement the card.', { ...base, relatedToActive: false })
    assert.equal(kindOf(unrelated), 'build_start')
    assert.equal(unrelated.admission.reason, 'project_coding_slot_occupied')
    assert.equal(kindOf(observe('Implement the card.', { ...base, relatedToActive: true })), 'manager_followup')
    assert.equal(kindOf(observe('Implement the card.', base)), 'clarify')
  })

  it('resume of a stopped generation is denied; an unqualified hold waits', () => {
    const resume = observe('Resume it.', { ...running, control: 'stopped', resumeQualified: true })
    assert.equal(resume.admission.reason, 'stopped_generation_not_resumable')
    assert.equal(observe('Pause it.', { ...running, holdQualified: false }).admission.reason, 'hold_unqualified')
    assert.equal(kindOf(observe('Pause it.', project)), 'clarify')
  })
})

describe('operation identity', () => {
  const delivery = (text: string) => ({ interaction: AUTO, text, context: { ...running, operationId: 'op7' } })

  it('the same operation and payload return the stored observation itself', () => {
    const ledger: ObservationLedger = new Map()
    const first = observeWithLedger(ledger, delivery('Also cover the error state.'))
    const again = observeWithLedger(ledger, delivery('Also cover the error state.'))
    assert.ok(first.ok && again.ok)
    assert.equal(again.observation, first.observation)
  })

  it('a changed payload under the same identity conflicts and does not replace the original', () => {
    const ledger: ObservationLedger = new Map()
    const first = observeWithLedger(ledger, delivery('Also cover the error state.'))
    const changed = observeWithLedger(ledger, delivery('Also remove the header.'))
    assert.ok(first.ok && changed.ok)
    assert.equal(changed.observation.proposal.kind, 'conflict')
    assert.equal(changed.observation.admission.reason, 'operation_payload_changed')
    assert.equal(ledger.get('op7'), first.observation)
  })

  it('observations are deterministic and bound to the payload', () => {
    const a = observe('Explain the card.', { ...project, selectedArtifact: 'card@v2' })
    const b = observe('Explain the card.', { ...project, selectedArtifact: 'card@v2' })
    const c = observe('Explain the card!', { ...project, selectedArtifact: 'card@v2' })
    assert.deepEqual(a, b)
    assert.notEqual(a.observationId, c.observationId)
    assert.equal(a.policy, INTAKE_OBSERVATION_POLICY_VERSION)
    assert.match(policyDigest(), /^[0-9a-f]{64}$/)
  })

  it('a reported redelivery replays or conflicts by its payload fact', () => {
    const ctx = { ...running, redeliveryOf: 'op3', originalAdmission: 'op3' }
    assert.equal(kindOf(observe('Also cover it.', { ...ctx, samePayload: true })), 'replay_original')
    assert.equal(kindOf(observe('Also cover it.', { ...ctx, samePayload: false })), 'conflict')
  })

  it('a correction before dispatch supersedes; after a possible send it reconciles first', () => {
    const ctx = { ...project, originalOperation: 'op4', newTarget: 'card@v3', expectedRevision: 5, currentRevision: 5 }
    const before = observe('Switch it to v3.', { ...ctx, dispatchState: 'not_sent' })
    assert.equal(kindOf(before), 'correct_proposal')
    assert.equal(renderTarget(before.proposal.target), 'op4/card@v3')
    assert.equal(kindOf(observe('Switch it.', { ...ctx, dispatchState: 'not_sent', currentRevision: 6 })), 'conflict')
    const after = observe('Switch it to v3.', { ...ctx, dispatchState: 'possibly_sent' })
    assert.equal(after.admission.reason, 'original_effect_outcome_unknown')
    const { newTarget: _drop, ...retry } = ctx
    assert.equal(
      observe('Try again.', { ...retry, dispatchState: 'outcome_unknown' }).admission.outcome,
      'reconciliation_required',
    )
  })

  it('interim speech is provisional; a delayed answer is withheld from a changed audience', () => {
    const interim = observe('Start the build.', {
      ...project,
      origin: 'voice_interim',
      voiceUtterance: 'u9',
      isFinal: false,
    })
    assert.equal(kindOf(interim), 'record_provisional')
    const late = observe('Here is the answer.', {
      audience: 'voice_call',
      origin: 'delayed_output',
      originalAudience: 'personal',
      operationId: 'op8',
    })
    assert.equal(kindOf(late), 'withhold_from_current_call')
  })
})

describe('blockers deny or wait; nothing admits', () => {
  it('a strict pin waits even when an alternate is available', () => {
    const o = observe('Implement the card.', {
      ...project,
      repo: 'Z',
      selectedArtifact: 'card@v2',
      pin: 'nativeQ',
      pinUnavailable: true,
      alternateAvailable: true,
    })
    assert.deepEqual(o.admission, { outcome: 'waiting', reason: 'pin_unavailable', authority: 'none' })
  })

  it('a missing payer waits; an unknown payer is uncertainty, not a grant', () => {
    const missing = observe('Research the card.', { ...project, selectedArtifact: 'card@v2', apiGrant: null })
    assert.equal(missing.admission.reason, 'api_payer_missing')
    const unknown = observe('Research the card.', { ...project, selectedArtifact: 'card@v2' })
    assert.equal(unknown.admission.outcome, 'recorded_only')
    assert.ok(unknown.uncertainty.includes('api_payer_unknown'))
  })

  it('every positive fact still yields at most recorded_only, with zero effects', () => {
    const grants = {
      apiGrant: 'qualified',
      nativePair: 'qualified',
      inquiryGrant: 'qualified',
      accepted: true,
      stopQualified: true,
      holdQualified: true,
      resumeQualified: true,
      currentActorAuthorized: true,
      implementationAuthorized: true,
    }
    const texts = [
      'Stop it.',
      'Pause it.',
      'Resume it.',
      'Also add tests.',
      'Implement the card.',
      'Research it.',
      'Why?',
    ]
    const contexts = [
      { ...running, ...grants, repo: 'Z', selectedArtifact: 'card@v2', relatedToActive: false },
      { ...project, ...grants, repo: 'Z', selectedArtifact: 'card@v2' },
      { audience: 'personal', ...grants, selectedArtifact: 'card@v2' },
      { ...running, ...grants, control: 'held', selectedMission: 'missionB' },
    ]
    for (const text of texts) {
      for (const context of contexts) {
        const o = observe(text, context)
        assert.ok(['recorded_only', 'waiting', 'denied', 'clarification_required'].includes(o.admission.outcome), text)
        assert.equal(o.admission.authority, 'none')
        assert.deepEqual(o.effects, ZERO_EFFECTS)
        assert.equal(o.audience.change, 'unchanged')
      }
    }
  })

  it('source and membership facts deny new effects, also when the meaning is unclear', () => {
    const denied = observe('Explain the file.', { ...project, selectedArtifact: 'f@v1', currentSourceEligible: false })
    assert.equal(denied.admission.reason, 'source_ineligible')
    const unclear = observe('Tidy that.', { ...project, pendingOperation: 'opZ', grantRevokedBeforeSend: true })
    assert.equal(kindOf(unclear), 'abstain')
    assert.equal(unclear.admission.outcome, 'denied')
  })

  it('a no-reply hint quiets a remark but never swallows a Stop', () => {
    assert.equal(kindOf(observe('Thanks, all clear.', { ...running, needsReply: false })), 'no_action')
    assert.equal(kindOf(observe('Stop the deploy.', { ...running, needsReply: false })), 'control_stop')
  })

  it('an auxiliary opens a question only with a question mark', () => {
    const ctx = { ...project, directAddress: 'sophia', selectedArtifact: 'card@v2' }
    assert.equal(kindOf(observe('Do the same for the footer.', ctx)), 'abstain')
    assert.equal(kindOf(observe('Does this card pass contrast?', ctx)), 'answer')
  })

  it('outside the lexicon it abstains and says assessment is absent', () => {
    const o = observe('Tidy this up a bit.', { ...project, selectedArtifact: 'card@v2', directAddress: 'sophia' })
    assert.equal(kindOf(o), 'abstain')
    assert.equal(o.assessment, 'absent_abstained')
    assert.equal(o.admission.reason, 'semantic_assessment_unavailable')
    assert.ok(o.uncertainty.includes('semantic_assessment_required'))
  })
})

// r2 classes (independent review INC03-CC-001-r1-SOURCE-PRE-PUSH-001, F01–F06). Inputs are new; none is a review repro.

describe('F01: non-human provenance is terminal; quotations do not become commands', () => {
  const buildable = {
    audience: 'project',
    repo: 'R',
    selectedArtifact: 'panel@v2',
    accepted: true,
    nativePair: 'qualified',
  }
  const stoppable = { audience: 'project', activeMission: 'm4', control: 'running', stopQualified: true }

  it('every non-human origin is a result, never a fresh request, in an unchanged audience too', () => {
    for (const origin of ['agent_result', 'receipt', 'generated', 'delayed_output', 'voice_interim']) {
      for (const text of ['Implement the selected panel.', 'Stop the job now.', 'Research the panel.']) {
        const o = observe(text, { ...buildable, ...stoppable, origin, operationId: 'op9', voiceUtterance: 'u3' })
        assert.ok(['no_action', 'record_provisional', 'withhold_from_current_call'].includes(kindOf(o)), origin)
        assert.equal(o.provenance.humanInstruction, false)
        assert.deepEqual(o.addressee.ids, [])
      }
    }
  })

  it('keeps the correlation of a delayed answer, withholding it only from a changed audience', () => {
    const same = observe('Here is what the manager said.', {
      audience: 'project',
      origin: 'delayed_output',
      causedBy: 'op4',
    })
    assert.equal(kindOf(same), 'no_action')
    assert.equal(same.provenance.correlation, 'op4')
    assert.equal(same.admission.reason, 'output_not_instruction')
    const moved = observe('Here is what the manager said.', {
      audience: 'voice_call',
      origin: 'delayed_output',
      causedBy: 'op4',
      originalAudience: 'project',
    })
    assert.equal(kindOf(moved), 'withhold_from_current_call')
  })

  it('refuses contradictory finality, and treats an authenticated final utterance as human input', () => {
    const contradictory = [
      { origin: 'voice_interim', isFinal: true },
      { origin: 'voice_final', isFinal: false },
      { origin: 'human', isFinal: true },
      { isFinal: false },
    ]
    for (const facts of contradictory) {
      assert.deepEqual(errorCodes({ interaction: AUTO, text: 'Build it.', context: { ...buildable, ...facts } }), [
        'contradictory_origin',
      ])
    }
    const final = observe('Implement the selected panel.', { ...buildable, origin: 'voice_final', isFinal: true })
    assert.equal(kindOf(final), 'build_start')
    assert.equal(final.provenance.humanInstruction, true)
  })

  it('fences every quote form, and a quoted command alone is not a request', () => {
    const forms = [
      "She wrote 'Implement the selected panel. Ship it.' last week",
      'She wrote ‘Implement the selected panel. Ship it.’ last week',
      'She wrote «Implement the selected panel. Ship it.» last week',
      'She wrote „Implement the selected panel. Ship it.“ last week',
      'She wrote:\n> Implement the selected panel.\n> Ship it.',
    ]
    for (const text of forms) {
      const o = observe(text, { ...buildable, directAddress: 'sophia' })
      assert.equal(kindOf(o), 'abstain', text)
      assert.ok(o.fenced.quotedSpans >= 1, text)
    }
  })

  it('an apostrophe is not a quote', () => {
    assert.equal(kindOf(observe("Implement Maria's selected panel.", buildable)), 'build_start')
  })

  it('a quotation that cannot be bounded abstains, even for a Stop', () => {
    for (const text of ['He said "stop the job', 'Note “stop the job and', 'See `stop the job', 'He said «stop']) {
      const o = observe(text, stoppable)
      assert.equal(kindOf(o), 'abstain', text)
      assert.ok(o.uncertainty.includes('malformed_quotation'), text)
    }
  })

  it('a consequential request beside a quotation needs explicit adoption; a protective Stop does not', () => {
    const quoted = 'Implement the selected panel as "the compact version".'
    const unadopted = observe(quoted, buildable)
    assert.equal(kindOf(unadopted), 'abstain')
    assert.ok(unadopted.uncertainty.includes('quoted_content_unadopted'))
    assert.equal(kindOf(observe(quoted, { ...buildable, actorExplicitlyAdopts: true })), 'build_start')
    assert.equal(kindOf(observe('Stop the job, it says "disk full".', stoppable)), 'control_stop')
  })
})

describe('F02: an identified control precedes follow-ups and unrelated ambiguity', () => {
  const current = { audience: 'project', activeMission: 'm4', control: 'running', manager: 'pm4', managerGeneration: 1 }
  const ambiguous = { possibleTargets: ['logo@v1', 'banner@v3'], candidates: ['x@v1', 'y@v1'] }

  it('Stop and Hold stay controls after "also", beside other requests and beside unrelated ambiguity', () => {
    const cases: [string, Record<string, unknown>, string][] = [
      ['Also stop the job.', current, 'control_stop'],
      ['Also pause the job.', current, 'control_hold'],
      ['Stop the job.', { ...current, ...ambiguous }, 'control_stop'],
      ['Pause it please.', { ...current, ...ambiguous }, 'control_hold'],
      ['Stop the job and research the logo.', current, 'control_stop'],
    ]
    for (const [text, context, kind] of cases) {
      const o = observe(text, context)
      assert.equal(kindOf(o), kind, text)
      assert.equal(renderTarget(o.proposal.target), 'm4', text)
      assert.deepEqual(o.effects, ZERO_EFFECTS)
    }
    assert.ok(
      observe('Stop the job and research the logo.', current).uncertainty.includes('additional_requests_not_processed'),
    )
  })

  it('Resume has the same precedence but keeps its qualification and held-state preconditions', () => {
    const held = { ...current, control: 'held', ...ambiguous }
    assert.equal(observe('Also resume it.', { ...held, resumeQualified: true }).admission.outcome, 'recorded_only')
    assert.equal(observe('Resume it.', { ...held, resumeQualified: false }).admission.reason, 'resume_unqualified')
    assert.equal(observe('Resume it.', { ...current, resumeQualified: true }).admission.reason, 'resume_requires_held')
  })

  it('state checks still apply, and an unclear mission still asks', () => {
    assert.equal(observe('Stop it.', { ...current, control: 'stopped' }).admission.reason, 'mission_already_stopped')
    assert.equal(observe('Pause it.', { ...current, control: 'held' }).admission.reason, 'mission_not_running')
    const conflict = observe('Stop it.', { ...current, selectedMission: 'm5' })
    assert.equal(kindOf(conflict), 'clarify')
    assert.ok(conflict.uncertainty.includes('mission_identity_conflict'))
    assert.equal(kindOf(observe('Stop it.', { audience: 'project', ...ambiguous })), 'clarify')
  })
})

describe('F03: explicit human addressing outranks operation metadata', () => {
  const correction = { originalOperation: 'op2', newTarget: 'panel@v4', dispatchState: 'not_sent' }

  it('a project, private or reply-addressed message stays human whatever correction metadata it carries', () => {
    const shared = observe('Could you move it to v4?', {
      audience: 'project',
      trustedMentions: ['marta'],
      ...correction,
    })
    assert.equal(kindOf(shared), 'human_message')
    assert.deepEqual(shared.addressee.ids, ['marta'])
    assert.ok(shared.uncertainty.includes('operation_metadata_not_applied'))
    const personal = observe('Marta, v4 instead?', { audience: 'personal', trustedMentions: ['marta'], ...correction })
    assert.equal(kindOf(personal), 'recorded_only')
    assert.equal(personal.audience.attention, 'none')
    const reply = observe('Yes, v4.', { audience: 'project', replyTo: 'msg3', replyAuthor: 'marta', ...correction })
    assert.equal(kindOf(reply), 'human_message')
  })

  it('the same metadata on a message to Sophia, or with no addressee, is a correction', () => {
    assert.equal(
      kindOf(observe('Use v4 instead.', { audience: 'project', directAddress: 'sophia', ...correction })),
      'correct_proposal',
    )
    assert.equal(kindOf(observe('Use v4 instead.', { audience: 'project', ...correction })), 'correct_proposal')
  })

  it('transport redelivery returns the bound operation without inventing a Sophia addressee for a human message', () => {
    const o = observe('Could you move it?', {
      audience: 'project',
      trustedMentions: ['marta'],
      redeliveryOf: 'op6',
      samePayload: true,
    })
    assert.equal(kindOf(o), 'replay_original')
    assert.deepEqual(o.addressee.ids, ['marta'])
  })
})

describe('F05: a follow-up names the exact manager and generation or waits', () => {
  const base = { audience: 'project', activeMission: 'm8', control: 'running' }

  it('carries mission, manager, generation and binding exactly as supplied', () => {
    const o = observe('Also add a loading state.', {
      ...base,
      manager: 'pm8',
      managerGeneration: 4,
      missionBinding: 'b8',
    })
    assert.deepEqual(o.proposal.target, { kind: 'mission', id: 'm8', manager: 'pm8', generation: 4, binding: 'b8' })
    assert.equal(o.admission.outcome, 'recorded_only')
  })

  it('a mission id without manager and generation is not a queue: it waits', () => {
    for (const extra of [{}, { manager: 'pm8' }, { managerGeneration: 4 }]) {
      const o = observe('Also add a loading state.', { ...base, ...extra })
      assert.equal(kindOf(o), 'manager_followup')
      assert.equal(o.admission.reason, 'manager_identity_unresolved')
    }
  })

  it('selected/current and manager/mission crossings ask instead of guessing', () => {
    const known = { manager: 'pm8', managerGeneration: 4 }
    const crossed = observe('Also add a loading state.', { ...base, ...known, selectedMission: 'm9' })
    assert.ok(crossed.uncertainty.includes('mission_identity_conflict'))
    const foreign = observe('Also add a loading state.', { ...base, ...known, managerMission: 'm2' })
    assert.equal(kindOf(foreign), 'clarify')
    assert.ok(foreign.uncertainty.includes('manager_mission_mismatch'))
    assert.equal(observe('How far along?', { ...base, ...known, selectedMission: 'm9' }).proposal.kind, 'clarify')
  })

  it('states that its audience is a coarse scope only', () => {
    assert.equal(observe('Also add a loading state.', base).audience.exactness, 'scope_only')
  })
})

describe('F06: comparisons keep every ref or are refused', () => {
  const ctx = { audience: 'project', directAddress: 'sophia' }

  it('refuses one, three or malformed refs instead of dropping any', () => {
    for (const refs of [
      ['w@v1'],
      ['w@v1', 'w@v2', 'secret@v9'],
      ['w@v1', 'w@v2..v3'],
      ['w', 'w@v2'],
      ['w@v1@x', 'w@v2'],
    ]) {
      assert.deepEqual(
        errorCodes({ interaction: AUTO, text: 'Compare them.', context: { ...ctx, selectedComparison: refs } }),
        ['unsupported_comparison'],
        refs.join(','),
      )
    }
    const pairs = [
      ['a@v1', 'a@v2'],
      ['b@v1', 'b@v2', 'c@v3'],
    ]
    assert.deepEqual(
      errorCodes({ interaction: AUTO, text: 'Use that one.', context: { ...ctx, possibleComparisons: pairs } }),
      ['unsupported_comparison'],
    )
  })

  it('keeps both refs, with versions and regions, in the structured target', () => {
    const o = observe('Compare them.', { ...ctx, selectedComparison: ['w@v1:intro', 'w@v2:intro'] })
    assert.deepEqual(o.proposal.target, { kind: 'comparison', refs: ['w@v1:intro', 'w@v2:intro'] })
    const mixed = observe('Compare them.', { ...ctx, selectedComparison: ['w@v1', 'z@v1'] })
    assert.equal(renderTarget(mixed.proposal.target), 'w@v1..z@v1')
  })
})

// r3 (independent review of r2, SHA-256 1d568e04…: F01 straight-quote class, F04 known negatives). New inputs only.

describe('F01 (r3): straight single quotes are bounded across lines or the input abstains', () => {
  const live = {
    audience: 'project',
    activeMission: 'm6',
    control: 'running',
    stopQualified: true,
    holdQualified: true,
    manager: 'pm6',
    managerGeneration: 2,
    repo: 'R',
    selectedArtifact: 'tile@v2',
    accepted: true,
    nativePair: 'qualified',
  }
  const directive = ['Stop the job.', 'Pause the job.', 'Implement the tile.', 'Also add a retry.']

  it('a multiline quotation hides every directive inside it, in each quote form', () => {
    const wraps: [string, string][] = [
      ["'", "'"],
      ['"', '"'],
      ['“', '”'],
      ['‘', '’'],
      ['«', '»'],
      ['```\n', '\n```'],
    ]
    for (const [open, close] of wraps) {
      for (const line of directive) {
        const text = `The trace read ${open}step one.\n${line}\nstep three${close} yesterday`
        const o = observe(text, live)
        assert.equal(kindOf(o), 'abstain', text)
        assert.ok(o.fenced.quotedSpans >= 1, text)
      }
    }
  })

  it('an opening quote that never closes abstains, a Stop or Hold included', () => {
    for (const open of ["'", '"', '“', '‘', '«', '`']) {
      for (const line of directive) {
        const text = `The trace read ${open}step one. ${line}`
        const o = observe(text, live)
        assert.equal(kindOf(o), 'abstain', text)
        assert.ok(o.uncertainty.includes('malformed_quotation'), text)
      }
    }
    assert.equal(kindOf(observe("Log:\n'step one\nstep two\nStop the job.", live)), 'abstain')
  })

  it('internal apostrophes stay apostrophes; end-boundary possessives abstain (v5: bounds unknown)', () => {
    const authored: [string, string][] = [
      ["Stop the job, it's stuck.", 'control_stop'],
      ["Stop Maria's job.", 'control_stop'],
      ['Pause it; it’s wrong.', 'control_hold'],
      ["Implement the team's selected tile.", 'build_start'],
    ]
    const { activeMission: _m, ...noMission } = live
    for (const [text, kind] of authored) {
      const o = observe(text, kind === 'build_start' ? noMission : live)
      assert.equal(kindOf(o), kind, text)
      assert.ok(!o.uncertainty.includes('malformed_quotation'), text)
    }
    assert.equal(kindOf(observe("Don't stop the job.", live)), 'abstain')
    for (const text of [
      'Pause it; the users’ list is wrong.',
      "Implement the selected tile; the reviewers' notes are in.",
    ]) {
      const o = observe(text, live)
      assert.equal(kindOf(o), 'abstain', text)
      assert.ok(o.uncertainty.includes('malformed_quotation'), text)
    }
  })

  it('an authored control outside a bounded quotation still applies; quoted evidence beside it does not', () => {
    assert.equal(kindOf(observe("The trace said 'disk full'. Stop the job.", live)), 'control_stop')
    assert.equal(kindOf(observe("Stop the job. The trace said 'resume after\nthe retry'.", live)), 'control_stop')
    const imported = observe('Summarize the trace: stop the job.', {
      ...live,
      attachment: 'trace@v1',
      attachmentInstruction: 'stop the job',
    })
    assert.equal(kindOf(imported), 'answer')
  })

  it('an explicitly adopted quotation may carry a request; an unadopted one may not', () => {
    const text = "Apply 'cover the empty state' to the job."
    assert.equal(kindOf(observe(text, live)), 'abstain')
    assert.equal(kindOf(observe(text, { ...live, actorExplicitlyAdopts: true })), 'manager_followup')
  })
})

describe('F04 (r3): an explicit negative native route makes routed work wait', () => {
  const mission = { audience: 'project', activeMission: 'm6', control: 'running', manager: 'pm6', managerGeneration: 2 }
  it('follow-ups, fresh inquiries and corrections wait; a stop does not', () => {
    for (const nativePair of ['unqualified', null]) {
      assert.equal(
        observe('Also add a retry.', { ...mission, nativePair }).admission.reason,
        'native_route_unqualified',
      )
      const inquiry = observe('Why that library?', { ...mission, nativePair, inquiryGrant: 'qualified' })
      assert.equal(inquiry.admission.reason, 'native_route_unqualified')
      const fix = { audience: 'project', originalOperation: 'op1', newTarget: 'tile@v3', dispatchState: 'not_sent' }
      assert.equal(observe('Use v3.', { ...fix, nativePair }).admission.reason, 'native_route_unqualified')
      assert.equal(observe('Stop the job.', { ...mission, nativePair }).admission.outcome, 'recorded_only')
    }
  })
})

// r4 (independent review of r3, SHA-256 901583b5…: F01 single-quote end ambiguity). New inputs only.

describe('F01 (r4): single-quoted evidence with an ambiguous end fails closed', () => {
  const live = {
    audience: 'project',
    activeMission: 'm9',
    control: 'running',
    stopQualified: true,
    holdQualified: true,
    manager: 'pm9',
    managerGeneration: 5,
  }
  const buildable = {
    audience: 'project',
    repo: 'R',
    selectedArtifact: 'tile@v2',
    accepted: true,
    nativePair: 'qualified',
  }
  const forms: [string, string][] = [
    ["'", "'"],
    ['‘', '’'],
  ]
  const possessives = ["the editors' draft", "the editors' and the authors' drafts", "the boss' desk"]
  const breaks = [' ', '\n']

  it('a closing-position apostrophe inside an outer single quote never exposes the rest as a control or build', () => {
    const lines = [
      ['Stop the job.', live],
      ['Pause the job.', live],
      ['Implement the tile.', buildable],
    ] as const
    const cases = forms.flatMap(([open, close]) =>
      possessives.flatMap((owner) =>
        breaks.flatMap((gap) =>
          lines.map(
            ([line, ctx]) =>
              [`The memo read ${open}${owner.replaceAll("'", close)}.${gap}${line}${gap}end${close}`, ctx] as const,
          ),
        ),
      ),
    )
    assert.equal(cases.length, 36)
    for (const [text, ctx] of cases) {
      const o = observe(text, ctx)
      assert.equal(kindOf(o), 'abstain', text)
      assert.ok(o.uncertainty.includes('malformed_quotation'), text)
      assert.deepEqual(o.effects, ZERO_EFFECTS)
    }
  })

  it('explicit adoption cannot repair unknown bounds', () => {
    const text = "Apply 'the editors' notes. Also add a retry.' to the job."
    const o = observe(text, { ...live, actorExplicitlyAdopts: true })
    assert.equal(kindOf(o), 'abstain')
    assert.ok(o.uncertainty.includes('malformed_quotation'))
  })

  it('two single-quoted spans of one family, or a straight opener closed by a typographic mark, abstain', () => {
    for (const text of [
      "The memo read 'disk full' and 'retry'. Stop the job.",
      'The memo read ‘disk full’ and ‘retry’. Stop the job.',
      "The memo read 'disk full’. Stop the job.",
    ]) {
      assert.equal(kindOf(observe(text, live)), 'abstain', text)
    }
  })

  it('one single-quoted span with one certain end still leaves an authored control outside it', () => {
    for (const text of [
      "The memo read 'disk full'. Stop the job.",
      'The memo read ‘disk full’. Stop the job.',
      "The memo read 'it's full'. Stop the job.",
      'The memo read ‘it’s full’.\nStop the job.',
    ]) {
      const o = observe(text, live)
      assert.equal(kindOf(o), 'control_stop', text)
      assert.equal(o.fenced.quotedSpans, 1, text)
    }
  })

  it('an internal apostrophe stays ordinary; a lone end-boundary possessive or a possessive inside a pair abstains', () => {
    const internal = observe('Stop the job; it’s stuck.', live)
    assert.equal(kindOf(internal), 'control_stop')
    assert.ok(!internal.uncertainty.includes('malformed_quotation'))
    for (const text of [
      "Stop the job, the editors' draft is wrong.",
      "Pause the boss' job.",
      "The memo read 'the editors’ draft'. Stop the job.",
    ]) {
      const o = observe(text, live)
      assert.equal(kindOf(o), 'abstain', text)
      assert.ok(o.uncertainty.includes('malformed_quotation'), text)
    }
  })

  it('single quotes inside a double-quoted span are never examined', () => {
    const o = observe('He wrote "the editors\' draft, stop the job". Stop the job.', live)
    assert.equal(kindOf(o), 'control_stop')
  })
})

// r5 (independent review of r4, SHA-256 df9abc94…: unrecognised quote-opener boundaries). A generated matrix, not a
// list of examples: the invariant is that a directive inside single-quote-like evidence is never an authored request,
// whatever character, symbol, escape or formatting surrounds the quote mark.

const closerOf = (g: string) => (g === '‘' ? '’' : g)

describe('F01 (r5): any single-quote-like boundary is fenced as one exact pair or the input abstains', () => {
  const live = {
    audience: 'project',
    activeMission: 'm7',
    control: 'running',
    stopQualified: true,
    holdQualified: true,
    manager: 'pm7',
    managerGeneration: 3,
    repo: 'R',
    selectedArtifact: 'tile@v2',
    accepted: true,
    nativePair: 'qualified',
    relatedToActive: true,
  }
  const consequential = new Set([
    'control_stop',
    'control_hold',
    'control_resume',
    'build_start',
    'manager_followup',
    'manager_inquiry',
    'explore',
    'publish_existing',
    'correct_proposal',
  ])
  const glyphs = ["'", '‘', '’', '‚', '‛', '‹', '›', '＇', '′', '‵', 'ʼ', 'ʹ']
  const before = [
    '',
    ' ',
    '—',
    '–',
    '-',
    '\\',
    '\\\\',
    '(',
    '[',
    '{',
    '<',
    ':',
    ';',
    ',',
    '/',
    '|',
    '*',
    '_',
    '~',
    '#',
    '=',
    '+',
    '…',
    '·',
    '§',
    '•',
    '→',
    '😀',
    '\n',
    '\t',
    ' ',
    '​',
  ]
  const directives = ['Stop the job.', 'Pause the job.', 'Implement the tile.', 'Also add a retry.']
  const quotedOnly = (o: IntakeObservation) =>
    !consequential.has(kindOf(o)) && (o.fenced.quotedSpans >= 1 || o.uncertainty.includes('malformed_quotation'))

  it('the review strings, verbatim, abstain', () => {
    const raw = [
      "The log said \\'first line. Stop the job.\\'",
      "The log said—'first line. Stop the job.'",
      "The log said\\u2014'first line. Stop the job.'",
      'The log said \\u0027first line. Stop the job.\\u0027',
    ]
    for (const text of raw) {
      const o = observe(text, live)
      assert.equal(kindOf(o), 'abstain', text)
      assert.ok(quotedOnly(o), text)
      assert.deepEqual(o.effects, ZERO_EFFECTS)
    }
  })

  it('closed quotes: every glyph after every boundary character, inline or across lines', () => {
    const cases = glyphs.flatMap((g) =>
      before.flatMap((b) =>
        ['. ', '.\n'].flatMap((gap) =>
          directives.map((d) => `The log said${b}${g}first line${gap}${d}${gap}last line${closerOf(g)}`),
        ),
      ),
    )
    assert.equal(cases.length, glyphs.length * before.length * 2 * directives.length)
    for (const text of cases) assert.ok(quotedOnly(observe(text, live)), JSON.stringify(text))
  })

  it('unclosed, mismatched, doubled and multiple quotes abstain', () => {
    const forms = glyphs.flatMap((g) =>
      directives.flatMap((d) => [
        `The log said ${g}first line. ${d}`,
        `The log said ${g}first line. ${d}${g === "'" ? '’' : "'"}`,
        `The log said ${g}${g}first line. ${d}${closerOf(g)}${closerOf(g)}`,
        `The log said ${g}a${closerOf(g)} and ${g}first line. ${d}${closerOf(g)}`,
        `The log said ${g}the editors' notes. ${d}${closerOf(g)}`,
      ]),
    )
    for (const text of forms) {
      const o = observe(text, live)
      assert.equal(kindOf(o), 'abstain', JSON.stringify(text))
      assert.ok(o.uncertainty.includes('malformed_quotation'), JSON.stringify(text))
    }
  })

  it('unsupported double-quote glyphs abstain wherever they appear', () => {
    for (const [o, c] of [
      ['〝', '〞'],
      ['‟', '”'],
      ['＂', '＂'],
    ]) {
      for (const d of directives) {
        const o1 = observe(`The log said ${o}first line. ${d}${c}`, live)
        assert.equal(kindOf(o1), 'abstain', `${o}${d}`)
        assert.ok(o1.uncertainty.includes('malformed_quotation'), `${o}${d}`)
      }
    }
  })

  it('escaped and encoded quotes abstain, adoption or not', () => {
    const quotes = ["\\'", '\\"', '\\’', '\\‘', '\\u0027', '\\u2019', '\\x27', '&#39;', '&apos;', '&quot;', '&rsquo;']
    for (const q of quotes) {
      for (const d of directives) {
        for (const adopts of [false, true]) {
          const text = `The log said ${q}first line. ${d}${q}`
          const o = observe(text, { ...live, actorExplicitlyAdopts: adopts })
          assert.equal(kindOf(o), 'abstain', text)
          assert.ok(o.uncertainty.includes('malformed_quotation'), text)
        }
      }
    }
  })

  it('unknown bounds stay unknown with adoption: the quoted directive is never adopted', () => {
    for (const g of glyphs) {
      const text = `Apply ${g}the editors' notes. Also add a retry.${closerOf(g)} to the job.`
      assert.equal(kindOf(observe(text, { ...live, actorExplicitlyAdopts: true })), 'abstain', text)
    }
  })

  it('internal apostrophes stay ordinary, and a command outside one exact pair stays authored', () => {
    const unquoted: [string, string][] = [
      ["Stop the job, it's stuck.", 'control_stop'],
      ['Pause it; it’s wrong.', 'control_hold'],
      ["Stop O'Brien's job.", 'control_stop'],
      ['Pause the teamʼs job.', 'control_hold'],
    ]
    for (const [text, kind] of unquoted) assert.equal(kindOf(observe(text, live)), kind, text)
    for (const b of [' ', '—', '(', '\n']) {
      for (const [g, c] of [
        ["'", "'"],
        ['‘', '’'],
      ]) {
        const text = `The log said${b}${g}disk full${c}. Stop the job.`
        const o = observe(text, live)
        assert.equal(kindOf(o), 'control_stop', JSON.stringify(text))
        assert.equal(o.fenced.quotedSpans, 1, JSON.stringify(text))
      }
    }
  })
})

// r6 (independent review of r5, SHA-256 110918ad…: between-letter marks hid both bounds of a cross-token quotation).
// Generated over glyphs, token alphabets, gaps and directives; no fixed sentence frame is special-cased.

describe('F01 (r6): a mark between letters is an apostrophe only in a provable token shape', () => {
  const live = {
    audience: 'project',
    activeMission: 'm8',
    control: 'running',
    stopQualified: true,
    holdQualified: true,
    manager: 'pm8',
    managerGeneration: 2,
    repo: 'R',
    selectedArtifact: 'tile@v2',
    accepted: true,
    nativePair: 'qualified',
    relatedToActive: true,
  }
  const apostropheGlyphs = ["'", '’', 'ʼ', '＇']
  const frames = ['The log said', 'Notes', 'Ticket 42 reads', 'Журнал гласит', 'Le journal dit', '記録']
  const leftTokens = ['said', 'note5', 'naïve', 'журнал', 'Ωmega', '記録']
  const rightTokens = ['first', 'x2', 'élan', 'строка', '行']
  const gaps = ['. ', '.\n', '; ', ', then ', ' — ']
  const directives = ['Stop the job', 'Pause the job', 'Implement the tile', 'Also add a retry']
  const tails = ['next', 'z9', 'ü', '終']

  it('a pair of glued marks around words, clauses or lines abstains, for every glyph, alphabet and adoption', () => {
    const cases = apostropheGlyphs.flatMap((g, gi) =>
      leftTokens.flatMap((left, li) =>
        gaps.flatMap((gap, ki) =>
          directives.map((d, di) => {
            const frame = frames[(gi + li + ki + di) % frames.length] ?? ''
            const right = rightTokens[(li + di) % rightTokens.length] ?? ''
            const tail = tails[(gi + ki) % tails.length] ?? ''
            return `${frame} ${left}${g}${right} line${gap}${d}${g}${tail}`
          }),
        ),
      ),
    )
    assert.equal(cases.length, apostropheGlyphs.length * leftTokens.length * gaps.length * directives.length)
    for (const text of cases) {
      for (const adopts of [false, true]) {
        const o = observe(text, { ...live, actorExplicitlyAdopts: adopts })
        assert.equal(kindOf(o), 'abstain', JSON.stringify(text))
        assert.ok(o.uncertainty.includes('malformed_quotation'), JSON.stringify(text))
        assert.deepEqual(o.effects, ZERO_EFFECTS)
      }
    }
  })

  it('glued marks before words that merely begin with suffix letters are boundaries, not contractions', () => {
    const suffixLike: [string, string][] = [
      ['sample', 'today'],
      ['triage', 'mode'],
      ['records', 'result'],
      ['venue', 'llama'],
    ]
    for (const g of apostropheGlyphs) {
      for (const [right, tail] of suffixLike) {
        for (const d of directives) {
          const text = `Notes said${g}${right} line. ${d}${g}${tail}`
          const o = observe(text, live)
          assert.equal(kindOf(o), 'abstain', JSON.stringify(text))
          assert.ok(o.uncertainty.includes('malformed_quotation'), JSON.stringify(text))
        }
      }
    }
  })

  it('mixed glyphs and repeated glued marks abstain', () => {
    for (const [a, b] of [
      ["'", '’'],
      ['’', 'ʼ'],
      ['ʼ', '＇'],
      ['＇', "'"],
    ]) {
      for (const d of directives) {
        for (const text of [`Notes said${a}first line. ${d}${b}next`, `Notes said${a}a${b}b. ${d}${a}c`]) {
          assert.equal(kindOf(observe(text, live)), 'abstain', JSON.stringify(text))
        }
      }
    }
  })

  it('a mark between letters outside the provable shapes abstains even inside one token', () => {
    for (const text of ["Stop the dell'arte job.", 'Pause the x’y job.', 'Stop the jobʼnext.']) {
      const o = observe(text, live)
      assert.equal(kindOf(o), 'abstain', text)
      assert.ok(o.uncertainty.includes('malformed_quotation'), text)
    }
  })

  it('contractions, possessives and o/d/l names in every apostrophe glyph stay ordinary text', () => {
    const forms = [
      'it{g}s stuck',
      'don{g}t wait',
      'we{g}re done',
      'I{g}ll check',
      'Maria{g}s draft',
      'O{g}Brien{g}s job',
      'd{g}Arcy{g}s note',
      'the 90{g}s log',
      'it{g}d help',
      'I{g}m here',
      'we{g}ve seen',
      'l{g}Oréal',
    ]
    for (const g of apostropheGlyphs) {
      for (const form of forms) {
        const text = `Stop the job; ${form.replaceAll('{g}', g)}.`
        const o = observe(text, live)
        assert.equal(kindOf(o), 'control_stop', text)
        assert.ok(!o.uncertainty.includes('malformed_quotation'), text)
      }
    }
  })
})

// r7 (independent review of r6, SHA-256 6229777b…: two marks that each fit a contraction or name shape still bounded
// a cross-token quotation). Generated over both bounds' shapes, glyphs, gaps, directives and adoption.

describe('F01 (r7): marks that could enclose words are judged together, whatever each looks like alone', () => {
  const live = {
    audience: 'project',
    activeMission: 'm6',
    control: 'running',
    stopQualified: true,
    holdQualified: true,
    manager: 'pm6',
    managerGeneration: 4,
    repo: 'R',
    selectedArtifact: 'tile@v2',
    accepted: true,
    nativePair: 'qualified',
    relatedToActive: true,
  }
  const glyphs = ["'", '’', 'ʼ', '＇']
  // Left bounds: a contraction suffix or a one-letter name prefix; right bounds: a contraction suffix.
  const opens = ['said{g}s first', 'note o{g}first', 'it{g}s', 'd{g}first', 'l{g}first', 'we{g}re told']
  const closes = ['job{g}s next', 'job{g}t', 'it{g}ll end', 'we{g}ve done', 'I{g}m out', 'job{g}d']
  const gaps = [' line. ', ' line.\n', '; ', ', then ', ' — ']
  const directives = ['Stop the job', 'Pause the job', 'Implement the tile', 'Also add a retry']

  it('the review strings abstain in every apostrophe glyph, adoption off and on', () => {
    for (const g of glyphs) {
      for (const text of [
        `The log said${g}s first line. Stop the job${g}s next`,
        `The log said o${g}first line. Pause the job${g}s next`,
      ]) {
        for (const adopts of [false, true]) {
          const o = observe(text, { ...live, actorExplicitlyAdopts: adopts })
          assert.equal(kindOf(o), 'abstain', JSON.stringify(text))
          assert.ok(o.uncertainty.includes('malformed_quotation'), JSON.stringify(text))
          assert.deepEqual(o.effects, ZERO_EFFECTS)
        }
      }
    }
  })

  it('every combination of shaped bounds around a directive abstains', () => {
    const cases = glyphs.flatMap((g, gi) =>
      opens.flatMap((open, oi) =>
        directives.map((d, di) => {
          const close = closes[(oi + di + gi) % closes.length] ?? ''
          const gap = gaps[(oi + gi) % gaps.length] ?? ''
          return `Notes ${open.replaceAll('{g}', g)}${gap}${d} ${close.replaceAll('{g}', g)}`
        }),
      ),
    )
    assert.equal(cases.length, glyphs.length * opens.length * directives.length)
    for (const text of cases) {
      for (const adopts of [false, true]) {
        const o = observe(text, { ...live, actorExplicitlyAdopts: adopts })
        assert.equal(kindOf(o), 'abstain', JSON.stringify(text))
        assert.ok(o.uncertainty.includes('malformed_quotation'), JSON.stringify(text))
      }
    }
  })

  it('a provable apostrophe on each side of a fenced quotation, or separated by a zero-width character, abstains', () => {
    for (const text of ["It's 'disk full'. Stop the job; we're sure.", 'Stop the job, it’s​we’re done.']) {
      assert.equal(kindOf(observe(text, live)), 'abstain', JSON.stringify(text))
    }
  })

  it('precision kept: one apostrophe, marks within one token, or one apostrophe beside one fenced pair', () => {
    const kept: [string, string][] = [
      ["Stop the job, it's stuck.", 'control_stop'],
      ['Pause the job; don’t wait.', 'control_hold'],
      ["Stop O'Brien's job.", 'control_stop'],
      ['Pause d’Arcy’s run.', 'control_hold'],
      ["'disk full'. Stop the job, it's stuck.", 'control_stop'],
      ["It's 'disk full'. Stop the job.", 'control_stop'],
    ]
    for (const [text, kind] of kept) assert.equal(kindOf(observe(text, live)), kind, text)
  })

  it('recall loss, stated: apostrophes in two different words abstain even when nothing is quoted', () => {
    for (const text of ["Stop the job; it's stuck and we're done.", 'Pause the job, I’ll check what’s left.']) {
      const o = observe(text, live)
      assert.equal(kindOf(o), 'abstain', text)
      assert.ok(o.uncertainty.includes('malformed_quotation'), text)
    }
  })
})

// r8 (automatic review of published r7 cf5f82e8 on PR 504, reconciled by the independent gate SHA-256 0114e54c…).

const legacy = (askSophia: boolean) => ({ contract: 'legacy_explicit_ask', askSophia })

describe('F01 (r8): origin and redelivery are terminal before any interaction contract', () => {
  const nonHuman = ['generated', 'agent_result', 'receipt', 'delayed_output', 'voice_interim']
  const base = { audience: 'project', operationId: 'op4', voiceUtterance: 'u4', selectedArtifact: 'tile@v1' }

  it('every non-human origin is a result under legacy Ask true, legacy Ask false and automatic', () => {
    for (const origin of nonHuman) {
      for (const interaction of [legacy(true), legacy(false), AUTO]) {
        for (const text of ['Explain the tile.', 'Stop the job.', 'Implement the tile.']) {
          const o = observe(text, { ...base, origin }, interaction)
          assert.ok(['no_action', 'record_provisional'].includes(kindOf(o)), `${origin} ${JSON.stringify(interaction)}`)
          assert.equal(o.provenance.humanInstruction, false, origin)
          assert.deepEqual(o.addressee.ids, [], origin)
          assert.notEqual(o.admission.reason, 'legacy_explicit_path', origin)
          assert.deepEqual(o.effects, ZERO_EFFECTS)
        }
      }
    }
  })

  it('a delayed answer to a changed audience is withheld under a legacy contract too', () => {
    const o = observe(
      'Here is the answer.',
      { audience: 'voice_call', origin: 'delayed_output', causedBy: 'op5', originalAudience: 'personal' },
      legacy(true),
    )
    assert.equal(kindOf(o), 'withhold_from_current_call')
    assert.equal(o.provenance.correlation, 'op5')
  })

  it('a transport redelivery replays or conflicts under a legacy contract and is not a fresh instruction', () => {
    for (const askSophia of [true, false]) {
      const same = observe(
        'Explain it.',
        { audience: 'project', redeliveryOf: 'op6', samePayload: true },
        legacy(askSophia),
      )
      assert.equal(kindOf(same), 'replay_original')
      assert.equal(same.provenance.humanInstruction, false)
      assert.equal(
        kindOf(
          observe('Explain it.', { audience: 'project', redeliveryOf: 'op6', samePayload: false }, legacy(askSophia)),
        ),
        'conflict',
      )
    }
  })

  it('actual human and final-speech legacy inputs keep the existing explicit semantics', () => {
    for (const origin of [undefined, 'human', 'voice_final']) {
      const ctx = {
        audience: 'project',
        selectedArtifact: 'tile@v1',
        ...(origin === undefined ? {} : { origin }),
        ...(origin === 'voice_final' ? { isFinal: true } : {}),
      }
      const yes = observe('Explain the tile.', ctx, legacy(true))
      assert.equal(kindOf(yes), 'answer', String(origin))
      assert.equal(yes.admission.reason, 'legacy_explicit_path')
      assert.equal(yes.provenance.humanInstruction, true)
      const no = observe('Explain the tile.', ctx, legacy(false))
      assert.equal(kindOf(no), 'recorded_only', String(origin))
      assert.equal(no.assessment, 'not_permitted')
    }
    assert.deepEqual(
      errorCodes({
        interaction: { contract: 'legacy_explicit_ask' },
        text: 'x',
        context: { ...base, origin: 'receipt' },
      }),
      ['legacy_ask_missing'],
    )
  })
})

describe('F02 (r8): declared imports are removed before any authored quotation analysis', () => {
  const live = {
    audience: 'project',
    activeMission: 'm5',
    control: 'running',
    stopQualified: true,
    holdQualified: true,
    manager: 'pm5',
    managerGeneration: 1,
  }
  const literals = [
    "'broken quote",
    '‘also broken',
    "\\'escaped quote",
    '\\u0027encoded quote',
    "ticket's first and job's next",
    'note’s draft and plan’s end',
    "it's a 'mixed’ thing",
  ]
  const directives: [string, string][] = [
    ['Stop the job.', 'control_stop'],
    ['Pause the job.', 'control_hold'],
  ]

  it('an import with unmatched, escaped, encoded or paired marks does not taint an authored control, in either field', () => {
    const cases = ['quotedText', 'attachmentInstruction'].flatMap((field) =>
      literals.flatMap((literal) =>
        directives.flatMap(([directive, kind]) =>
          [`${literal}\n${directive}`, `${directive} ${literal}`, `${literal} ${literal}\n${directive}`].map(
            (text) => [field, literal, text, kind] as const,
          ),
        ),
      ),
    )
    assert.equal(cases.length, 2 * literals.length * directives.length * 3)
    for (const [field, literal, text, kind] of cases) {
      const o = observe(text, { ...live, [field]: literal })
      assert.equal(kindOf(o), kind, `${field} ${JSON.stringify(text)}`)
      assert.ok(o.fenced.quotedSpans >= 1, JSON.stringify(text))
    }
  })

  it('a directive inside the import stays data, and malformed authored text outside it still abstains', () => {
    const imported = observe('Summarize: stop the job.', {
      ...live,
      attachment: 'doc@v1',
      attachmentInstruction: 'stop the job',
    })
    assert.equal(kindOf(imported), 'answer')
    for (const text of ["'broken\nHe said 'stop. Stop the job.", "'broken\nStop the job, it's done and we're out."]) {
      const o = observe(text, { ...live, quotedText: "'broken" })
      assert.equal(kindOf(o), 'abstain', JSON.stringify(text))
      assert.ok(o.uncertainty.includes('malformed_quotation'), JSON.stringify(text))
    }
  })

  it('without the declaration the same text abstains: the fix is the declared span, not a looser quote rule', () => {
    for (const literal of literals) {
      const o = observe(`${literal}\nStop the job.`, live)
      assert.equal(kindOf(o), 'abstain', literal)
    }
  })
})

const decision = (o: IntakeObservation) => ({ proposal: o.proposal, admission: o.admission, addressee: o.addressee })

describe('F01 (r9): an acknowledgement is a prefix, never the whole clause, when a request follows', () => {
  const live = {
    audience: 'project',
    activeMission: 'm9',
    control: 'running',
    stopQualified: true,
    holdQualified: true,
  }
  const contexts: Record<string, Record<string, unknown>> = {
    'running, qualified': live,
    'running, unqualified': { ...live, stopQualified: false, holdQualified: false },
    'qualification unknown': { audience: 'project', activeMission: 'm9', control: 'running' },
    held: { ...live, control: 'held' },
    stopped: { ...live, control: 'stopped' },
    'no mission': { audience: 'project' },
    'conflicting missions': { ...live, selectedMission: 'm8' },
  }
  const acks = ['thanks', 'thank you', 'thx', 'got it', 'ok', 'okay', 'great', 'perfect']
  const verbs = ['stop', 'halt', 'hold', 'pause']

  it('every acknowledgement before every protective verb decides exactly as the bare verb, in every control state', () => {
    for (const [name, ctx] of Object.entries(contexts))
      for (const verb of verbs) {
        const bare = decision(observe(`${verb[0]?.toUpperCase()}${verb.slice(1)} the job.`, ctx))
        for (const ack of acks) {
          const text = `${ack[0]?.toUpperCase()}${ack.slice(1)} ${verb} the job.`
          assert.deepEqual(decision(observe(text, ctx)), bare, `${name}: ${text}`)
        }
      }
    assert.equal(kindOf(observe('Thanks stop.', live)), 'control_stop')
    assert.equal(kindOf(observe('Okay hold.', live)), 'control_hold')
    // Text the lexicon cannot read abstains with or without the acknowledgement.
    assert.equal(kindOf(observe('Thanks\u2026 stop', live)), 'abstain')
    assert.equal(kindOf(observe('Stop\u2026', live)), 'abstain')
  })

  it('polite, filler, repeated, punctuated and capitalised prefixes still leave the control', () => {
    for (const text of [
      'Thanks please stop.',
      'Ok sophia, stop the job.',
      'Okay just stop',
      'Thanks thank you halt.',
      'Ok ok stop',
      'Got it — stop the job.',
      'Thanks - stop!',
      'THANKS STOP',
      'Perfect, thanks, now stop.',
    ])
      assert.equal(kindOf(observe(text, live)), 'control_stop', text)
    for (const text of ['Great hold on the deploy.', 'Thx kindly pause.', 'Okay, okay hold'])
      assert.equal(kindOf(observe(text, live)), 'control_hold', text)
  })

  it('a request of any existing family after an acknowledgement is read as that request, Stop first', () => {
    const ctx = { ...project, selectedArtifact: 'card@v2', directAddress: 'sophia' }
    assert.equal(kindOf(observe('Thanks explain the card.', ctx)), kindOf(observe('Explain the card.', ctx)))
    assert.equal(kindOf(observe('Okay research the market.', ctx)), kindOf(observe('Research the market.', ctx)))
    assert.equal(kindOf(observe('Ok start the research.', ctx)), kindOf(observe('Start the research.', ctx)))
    assert.equal(kindOf(observe('Great what is next?', ctx)), kindOf(observe('What is next?', ctx)))
    const followup = observe('Thanks also add a loading state.', { ...live, manager: 'pm9', managerGeneration: 2 })
    const bareFollowup = observe('Also add a loading state.', { ...live, manager: 'pm9', managerGeneration: 2 })
    assert.deepEqual(decision(followup), decision(bareFollowup))
    assert.equal(kindOf(observe('Thanks build the feature and stop the job.', live)), 'control_stop')
    assert.ok(
      observe('Thanks build the feature and stop the job.', live).uncertainty.includes(
        'additional_requests_not_processed',
      ),
    )
  })

  // r10: this list once also held acknowledgements followed by unread words ("Thanks for the update."); those now
  // abstain like the unread words alone (r9 review INC03-R9-F01, below).
  it('a standalone acknowledgement stays silent', () => {
    for (const text of ['Thanks!', 'Okay.', 'Got it, thanks.', 'Ok ok', 'Perfect, thank you!'])
      assert.equal(kindOf(observe(text, live)), 'no_action', text)
  })

  it('fences, origins and the legacy contract still decide before the remainder is read', () => {
    assert.equal(kindOf(observe('Thanks "stop the job".', live)), 'no_action')
    assert.equal(kindOf(observe('Thanks stop the job.', { ...live, quotedText: 'stop the job' })), 'no_action')
    assert.equal(kindOf(observe('Thanks stop the job.', { ...live, origin: 'agent_result' })), 'no_action')
    const legacyFalse = observe('Thanks stop the job.', live, legacy(false))
    assert.equal(kindOf(legacyFalse), 'recorded_only')
    assert.equal(legacyFalse.admission.reason, 'legacy_ask_false_no_assessment')
    assert.equal(observe('Thanks stop the job.', live, legacy(true)).proposal.rule, 'legacy.ask_true')
    assert.equal(kindOf(observe('Thanks stop the job.', { ...live, needsReply: false })), 'control_stop')
    assert.deepEqual(observe('Okay hold the job.', live).effects, ZERO_EFFECTS)
  })
})

describe('F02 (r9): a transport redelivery keeps the addressing it carries and invents none', () => {
  const interactions = { automatic: AUTO, 'legacy true': legacy(true), 'legacy false': legacy(false) }
  const siblings: Record<string, { context: Record<string, unknown>; ids: string[]; basis: string }> = {
    'project, no addressing': { context: { audience: 'project' }, ids: [], basis: 'unresolved' },
    'project, human mention': {
      context: { audience: 'project', trustedMentions: ['marta'] },
      ids: ['marta'],
      basis: 'structured_mention',
    },
    'project, human and Sophia': {
      context: { audience: 'project', trustedMentions: ['marta', 'sophia'] },
      ids: ['marta', 'sophia'],
      basis: 'structured_mention',
    },
    'project, non-member mention': {
      context: { audience: 'project', trustedMentions: ['ghost'], currentMembers: ['marta'] },
      ids: [],
      basis: 'unresolved',
    },
    'project, Sophia reply target': {
      context: { audience: 'project', replyTo: 'msg1', replyAuthor: 'sophia' },
      ids: ['sophia'],
      basis: 'reply_target',
    },
    'project, direct human address': {
      context: { audience: 'project', directAddress: 'luis' },
      ids: ['luis'],
      basis: 'direct_address',
    },
    'personal, no addressing': { context: { audience: 'personal' }, ids: ['sophia'], basis: 'personal_default' },
  }

  it('each sibling, under each contract, replays or conflicts with only its resolved addressee and no attention', () => {
    for (const [name, s] of Object.entries(siblings))
      for (const [contract, interaction] of Object.entries(interactions))
        for (const same of [true, false]) {
          const label = `${name} / ${contract} / same=${String(same)}`
          const o = observe('Explain it.', { ...s.context, redeliveryOf: 'op9', samePayload: same }, interaction)
          assert.equal(kindOf(o), same ? 'replay_original' : 'conflict', label)
          assert.equal(renderTarget(o.proposal.target), 'op9', label)
          assert.deepEqual(o.addressee.ids, s.ids, label)
          assert.equal(o.addressee.basis, s.basis, label)
          assert.notEqual(o.addressee.basis, 'operation_reference', label)
          assert.equal(o.audience.attention, 'none', label)
          assert.equal(o.provenance.humanInstruction, false, label)
          assert.equal(o.admission.outcome, same ? 'replay_original' : 'conflict', label)
          assert.deepEqual(o.effects, ZERO_EFFECTS, label)
        }
  })

  it('the dropped non-member is still reported, and a fresh correction keeps its operation reference', () => {
    const dropped = observe('Explain it.', {
      audience: 'project',
      trustedMentions: ['ghost'],
      currentMembers: ['marta'],
      redeliveryOf: 'op9',
      samePayload: true,
    })
    assert.deepEqual(dropped.addressee.ids, [])
    assert.ok(dropped.uncertainty.includes('mention_not_current_member'))
    const correction = observe('Use v3 instead.', {
      audience: 'project',
      originalOperation: 'op9',
      newTarget: 'card@v3',
      dispatchState: 'not_sent',
      expectedRevision: 2,
      currentRevision: 2,
    })
    assert.equal(kindOf(correction), 'correct_proposal')
    assert.deepEqual(correction.addressee.ids, ['sophia'])
    assert.equal(correction.addressee.basis, 'operation_reference')
  })
})

const cap = (t: string) => `${t[0]?.toUpperCase()}${t.slice(1)}`
/** Every placement of an acknowledgement around the same words: prefix, comma, sentence, trailing, repeated. */
const ackPlacements = (ack: string, rest: string) => [
  `${cap(ack)} ${rest}.`,
  `${cap(ack)}, ${rest}.`,
  `${cap(ack)}. ${cap(rest)}.`,
  `${cap(rest)}, ${ack}.`,
  `${cap(ack)} ${ack} please ${rest}.`,
]

describe('r10 (INC03-R9-F01): an acknowledgement never decides words the lexicon cannot read', () => {
  const live = {
    audience: 'project',
    activeMission: 'm9',
    control: 'running',
    stopQualified: true,
    holdQualified: true,
  }
  const acks = ['thanks', 'thank you', 'thx', 'got it', 'ok', 'okay', 'great', 'perfect']
  const verbs = ['stop', 'halt', 'hold', 'pause']
  // Words outside the lexicon, chosen for this class (not the review's probe words); any such word behaves the same.
  const unread = ['urgently', 'right', 'definitely']

  it('after any acknowledgement, in any position, unread words decide exactly as they do alone', () => {
    for (const word of unread)
      for (const verb of verbs) {
        const rest = `${word} ${verb} the job`
        const alone = observe(`${cap(rest)}.`, live)
        assert.equal(kindOf(alone), 'abstain', rest)
        assert.ok(alone.uncertainty.includes('outside_lexicon'), rest)
        assert.equal(alone.assessment, 'absent_abstained', rest)
        for (const text of acks.flatMap((ack) => ackPlacements(ack, rest)))
          assert.deepEqual(decision(observe(text, live)), decision(alone), text)
      }
  })

  it('ordinary words after an acknowledgement abstain too, and a no-reply hint still quiets them', () => {
    for (const text of ['Thanks for the update.', 'Great job everyone.', 'Thank you so much!', 'Thanks, all clear.']) {
      const o = observe(text, live)
      assert.equal(kindOf(o), 'abstain', text)
      assert.ok(o.uncertainty.includes('semantic_assessment_required'), text)
      assert.equal(kindOf(observe(text, { ...live, needsReply: false })), 'no_action', text)
    }
  })

  it('a recognised request after an acknowledgement still decides, and a hint never quiets a control', () => {
    assert.equal(kindOf(observe('Thanks urgently, stop the job.', live)), 'control_stop')
    assert.equal(kindOf(observe('Okay, definitely hold the job, then pause it.', live)), 'control_hold')
    assert.equal(kindOf(observe('Thanks right, stop the job.', { ...live, needsReply: false })), 'control_stop')
    assert.equal(
      kindOf(
        observe('Thanks, explain the card.', { ...project, selectedArtifact: 'card@v2', directAddress: 'sophia' }),
      ),
      'answer',
    )
  })

  it('quoted, imported, non-human and legacy crossings keep their own outcome', () => {
    assert.equal(kindOf(observe('Thanks, she wrote "stop the job".', live)), 'abstain')
    assert.equal(kindOf(observe('Thanks "urgently stop the job".', live)), 'no_action')
    assert.equal(
      kindOf(observe('Thanks urgently stop the job.', { ...live, quotedText: 'urgently stop the job' })),
      'no_action',
    )
    assert.equal(kindOf(observe('Thanks urgently stop the job.', { ...live, origin: 'receipt' })), 'no_action')
    assert.equal(kindOf(observe('Thanks urgently stop the job.', live, legacy(false))), 'recorded_only')
    assert.equal(observe('Thanks urgently stop the job.', live, legacy(true)).proposal.rule, 'legacy.ask_true')
    assert.deepEqual(observe('Thanks urgently stop the job.', live).effects, ZERO_EFFECTS)
  })
})

describe('r11 (P2 discussion_r4520830076): a null inquiry qualification is known absence, not an unknown', () => {
  const known = {
    audience: 'project',
    activeMission: 'm11',
    control: 'running',
    manager: 'pm11',
    managerGeneration: 3,
  }
  const ask = 'Why was that test removed?'

  it('null waits as inquiry_unqualified exactly as explicit unqualified; omitted stays unknown; qualified stays unassessed', () => {
    const omitted = observe(ask, known)
    const none = observe(ask, { ...known, inquiryGrant: null })
    const unqualified = observe(ask, { ...known, inquiryGrant: 'unqualified' })
    const qualified = observe(ask, { ...known, inquiryGrant: 'qualified' })
    for (const o of [omitted, none, unqualified, qualified]) assert.equal(kindOf(o), 'manager_inquiry')
    assert.deepEqual(none.admission, { outcome: 'waiting', reason: 'inquiry_unqualified', authority: 'none' })
    assert.deepEqual(decision(none), decision(unqualified))
    assert.deepEqual(none.uncertainty, unqualified.uncertainty)
    assert.ok(!none.uncertainty.includes('inquiry_grant_unknown'))
    assert.deepEqual(omitted.admission, {
      outcome: 'recorded_only',
      reason: 'observation_unqualified',
      authority: 'none',
    })
    assert.ok(omitted.uncertainty.includes('inquiry_grant_unknown'))
    assert.deepEqual(qualified.admission, omitted.admission)
    assert.ok(!qualified.uncertainty.includes('inquiry_grant_unknown'))
    for (const o of [omitted, none, unqualified, qualified]) assert.deepEqual(o.effects, ZERO_EFFECTS)
  })

  it('in every sibling context null decides as explicit unqualified, and the earlier gates keep their order', () => {
    const siblings: Record<string, Record<string, unknown>> = {
      'retained evidence': { ...known, retainedEvidence: 'checkpoint7' },
      held: { ...known, control: 'held' },
      stopped: { ...known, control: 'stopped' },
      'manager unresolved': { audience: 'project', activeMission: 'm11', control: 'running' },
      'source ineligible': { ...known, currentSourceEligible: false },
      'actor unauthorized': { ...known, currentActorAuthorized: false },
    }
    for (const [name, ctx] of Object.entries(siblings))
      assert.deepEqual(
        decision(observe(ask, { ...ctx, inquiryGrant: null })),
        decision(observe(ask, { ...ctx, inquiryGrant: 'unqualified' })),
        name,
      )
    assert.equal(kindOf(observe(ask, { ...siblings['retained evidence'], inquiryGrant: null })), 'work_read')
    assert.equal(observe(ask, { ...siblings.held, inquiryGrant: null }).admission.reason, 'held_no_fresh_inquiry')
    assert.equal(observe(ask, { ...siblings.stopped, inquiryGrant: null }).admission.reason, 'held_no_fresh_inquiry')
    assert.equal(
      observe(ask, { ...siblings['manager unresolved'], inquiryGrant: null }).admission.reason,
      'inquiry_unqualified',
    )
    assert.equal(observe(ask, { ...siblings['manager unresolved'] }).admission.reason, 'manager_identity_unresolved')
  })
})

describe('r12 (P1 discussion_r4529211530): structured addressing that names no current recipient abstains', () => {
  const live = {
    audience: 'project',
    activeMission: 'm12',
    control: 'running',
    stopQualified: true,
    selectedArtifact: 'panel@v4',
  }
  const gone = { trustedMentions: ['ines'], currentMembers: ['marta'] }
  const contexts: Record<string, Record<string, unknown>> = {
    'project, one removed human': { ...live, ...gone },
    'project, two removed humans': { ...live, trustedMentions: ['ines', 'tomas'], currentMembers: ['marta'] },
    'no current members at all': { ...live, trustedMentions: ['ines'], currentMembers: [] },
    'reply to Sophia would otherwise decide': { ...live, ...gone, replyTo: 'msg12', replyAuthor: 'sophia' },
    'direct address to Sophia would otherwise decide': { ...live, ...gone, directAddress: 'sophia' },
    'personal default would otherwise decide': { ...live, ...gone, audience: 'personal' },
    'correction metadata would otherwise decide': {
      ...live,
      ...gone,
      originalOperation: 'op12',
      newTarget: 'panel@v5',
      dispatchState: 'not_sent',
      expectedRevision: 3,
      currentRevision: 3,
    },
  }
  const texts = ['Implement the selected panel.', 'Stop the job.', 'Explain the panel.', 'Use v5 instead.']

  it('every fallback is refused: abstain, no recipient, no attention, the failure said', () => {
    for (const [name, ctx] of Object.entries(contexts))
      for (const text of texts) {
        const o = observe(text, ctx)
        const label = `${name}: ${text}`
        assert.equal(kindOf(o), 'abstain', label)
        assert.equal(o.proposal.rule, 'address.structured_unresolved', label)
        assert.deepEqual(o.addressee, { ids: [], basis: 'unresolved' }, label)
        assert.equal(o.audience.attention, 'none', label)
        assert.ok(o.uncertainty.includes('structured_addressing_failed'), label)
        assert.ok(o.uncertainty.includes('mention_not_current_member'), label)
        assert.ok(!JSON.stringify(o).includes('ines') && !JSON.stringify(o).includes('tomas'), label)
        assert.deepEqual(o.effects, ZERO_EFFECTS, label)
      }
  })

  it('absent and empty mentions are the same and are not a failure; partial, mixed and current recipients keep theirs', () => {
    const text = 'Implement the selected panel.'
    const without = observe(text, live)
    assert.deepEqual(decision(observe(text, { ...live, trustedMentions: [] })), decision(without))
    assert.ok(!without.uncertainty.includes('structured_addressing_failed'))
    const partial = observe(text, { ...live, trustedMentions: ['marta', 'ines'], currentMembers: ['marta'] })
    assert.equal(kindOf(partial), 'human_message')
    assert.deepEqual(partial.addressee.ids, ['marta'])
    const mixed = observe(text, { ...live, trustedMentions: ['sophia', 'ines'], currentMembers: ['marta'] })
    assert.notEqual(kindOf(mixed), 'abstain')
    assert.deepEqual(mixed.addressee.ids, ['sophia'])
    assert.ok(mixed.uncertainty.includes('mention_not_current_member'))
    const rejoined = observe(text, { ...live, trustedMentions: ['ines'], currentMembers: ['marta', 'ines'] })
    assert.equal(kindOf(rejoined), 'human_message')
    const unknownMembers = observe(text, { ...live, trustedMentions: ['ines'] })
    assert.equal(kindOf(unknownMembers), 'human_message')
  })

  it('origin, transport redelivery and the legacy contract still decide first', () => {
    const ctx = contexts['project, one removed human'] ?? {}
    assert.equal(kindOf(observe('Stop the job.', { ...ctx, origin: 'agent_result' })), 'no_action')
    const redelivered = observe('Stop the job.', { ...ctx, redeliveryOf: 'op12', samePayload: true })
    assert.equal(kindOf(redelivered), 'replay_original')
    assert.deepEqual(redelivered.addressee.ids, [])
    assert.equal(kindOf(observe('Stop the job.', ctx, legacy(false))), 'recorded_only')
    assert.equal(observe('Stop the job.', ctx, legacy(true)).proposal.rule, 'legacy.ask_true')
  })
})

describe('r12 (P2 discussion_r4529211542): a legacy Ask names explicit selection only when there is one', () => {
  it('without a selection: the current thread, said as current_thread, in every audience', () => {
    for (const audience of ['project', 'personal', 'voice_call']) {
      const o = observe('What changed?', { audience }, legacy(true))
      assert.equal(kindOf(o), 'answer', audience)
      assert.deepEqual(o.proposal.target, { kind: 'thread', scope: audience }, audience)
      assert.equal(o.proposal.targetBasis, 'current_thread', audience)
      assert.equal(o.admission.reason, 'legacy_explicit_path', audience)
    }
  })

  it('with an artifact, a comparison or a decision selected: that exact target, as explicit_selection', () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ selectedArtifact: 'panel@v4' }, 'panel@v4'],
      [{ selectedComparison: ['panel@v3', 'panel@v4'] }, 'panel@v3..v4'],
      [{ uniqueDecision: 'decision12' }, 'decision12'],
    ]
    for (const [selection, rendered] of cases) {
      const o = observe('What changed?', { audience: 'project', ...selection }, legacy(true))
      assert.equal(o.proposal.targetBasis, 'explicit_selection', rendered)
      assert.equal(renderTarget(o.proposal.target), rendered)
    }
  })

  it('legacy false stays quiet on the thread, and a generated legacy true is still a result', () => {
    const quiet = observe('What changed?', { audience: 'project' }, legacy(false))
    assert.deepEqual([kindOf(quiet), quiet.proposal.targetBasis], ['recorded_only', 'current_thread'])
    assert.equal(
      kindOf(observe('What changed?', { audience: 'project', origin: 'generated' }, legacy(true))),
      'no_action',
    )
  })
})

describe('r13 (P1 discussion_r4529758474): a dash directly after an acknowledgement separates it', () => {
  const live = {
    audience: 'project',
    activeMission: 'm13',
    control: 'running',
    stopQualified: true,
    holdQualified: true,
  }
  const acks = ['thanks', 'thank you', 'thx', 'got it', 'ok', 'okay', 'great', 'perfect']
  const dashes = ['-', '–', '—']

  it('every acknowledgement joined to a Stop or Hold by any documented dash decides as the spaced form', () => {
    for (const ack of acks)
      for (const dash of dashes)
        for (const verb of ['stop', 'hold']) {
          const joined = observe(`${cap(ack)}${dash}${verb} the job.`, live)
          const spaced = observe(`${cap(ack)} ${dash} ${verb} the job.`, live)
          assert.equal(kindOf(joined), verb === 'stop' ? 'control_stop' : 'control_hold', `${ack}${dash}${verb}`)
          assert.deepEqual(decision(joined), decision(spaced), `${ack}${dash}${verb}`)
        }
  })

  it('repeated and multi-word acknowledgements, fillers and mixed dashes still peel', () => {
    for (const text of ['Thanks—thanks—stop.', 'Thank you–please stop.', 'Got it-ok-hold the job.', 'OK—just pause.'])
      assert.ok(['control_stop', 'control_hold'].includes(kindOf(observe(text, live))), text)
  })

  it('a longer word is no acknowledgement, unread words still abstain, and fences, origins and people still decide', () => {
    assert.notEqual(observe('Thanksgiving.', live).proposal.rule, 'family.acknowledgement')
    assert.notEqual(observe('Okayish.', live).proposal.rule, 'family.acknowledgement')
    // A word that merely begins with an acknowledgement is not one, so nothing after it is peeled into a control.
    for (const text of ['Okstop the job.', 'Thanksstop.', 'Greathold the job.'])
      assert.equal(kindOf(observe(text, live)), 'abstain', text)
    assert.equal(kindOf(observe('Thanks—urgently stop the job.', live)), 'abstain')
    assert.equal(kindOf(observe('Thanks—"stop the job".', live)), 'no_action')
    assert.equal(kindOf(observe('Thanks—stop the job.', { ...live, quotedText: 'stop the job' })), 'no_action')
    assert.equal(kindOf(observe('Thanks—stop the job.', { ...live, origin: 'receipt' })), 'no_action')
    assert.equal(kindOf(observe('Thanks—stop the job.', { ...live, trustedMentions: ['marta'] })), 'human_message')
    assert.equal(kindOf(observe('Thanks—stop the job.', live, legacy(false))), 'recorded_only')
  })
})

describe('r13 (P2 discussion_r4529758477): comparison refs follow name@version[:region] exactly', () => {
  const malformed = [
    'w@:intro',
    'w@v1:',
    'w@v1:a:b',
    'w@v1/x',
    'w/x@v1',
    '@v1',
    'w@',
    'w@@v1',
    'w@v1\\x',
    'w@v1 ',
    'w@v1#x',
  ]

  it('every malformed ref is refused in the selected pair and in any possible pair', () => {
    for (const bad of malformed) {
      assert.deepEqual(
        errorCodes({
          interaction: AUTO,
          text: 'Compare them.',
          context: { ...project, selectedComparison: [bad, 'w@v2'] },
        }),
        ['unsupported_comparison'],
        bad,
      )
      assert.deepEqual(
        errorCodes({
          interaction: AUTO,
          text: 'Compare them.',
          context: {
            ...project,
            possibleComparisons: [
              ['w@v1', 'w@v2'],
              ['w@v2', bad],
            ],
          },
        }),
        ['unsupported_comparison'],
        bad,
      )
    }
  })

  it('names, versions and regions with letters, digits, dots, hyphens and underscores stay supported', () => {
    for (const pair of [
      ['w@v1', 'w@v2'],
      ['w@v1:intro', 'w@v2:intro'],
      ['deck-2.final@1.2.0-rc_3:slide-4', 'deck-2.final@1.3.0:slide-4'],
      ['café@v1', 'café@v2'],
    ]) {
      const o = observe('Compare them.', { ...project, directAddress: 'sophia', selectedComparison: pair })
      assert.deepEqual(o.proposal.target, { kind: 'comparison', refs: pair }, pair.join(' '))
    }
  })
})

describe('r14 (F01 discussion_r4530868593, F02 discussion_r4530868599): every exact selection is one notion', () => {
  const base = { audience: 'project', directAddress: 'sophia' }
  const selectors: Record<string, [Record<string, unknown>, unknown]> = {
    artifact: [{ selectedArtifact: 'card@v2' }, { kind: 'artifact', ref: 'card@v2' }],
    attachment: [{ attachment: 'brief@v1' }, { kind: 'artifact', ref: 'brief@v1' }],
    comparison: [{ selectedComparison: ['card@v1', 'card@v2'] }, { kind: 'comparison', refs: ['card@v1', 'card@v2'] }],
    decision: [{ uniqueDecision: 'decision14' }, { kind: 'reference', id: 'decision14' }],
    date: [{ uniqueDate: 'date14' }, { kind: 'reference', id: 'date14' }],
  }
  const lists: Record<string, Record<string, unknown>> = {
    'no generic list': {},
    'two candidates': { candidates: ['x1', 'x2'] },
    'two possible targets': { possibleTargets: ['x1', 'x2'] },
  }

  it('each selector kind, with or without a generic list, is the exact explicit target', () => {
    for (const [name, [selector, target]] of Object.entries(selectors))
      for (const [variant, list] of Object.entries(lists)) {
        const o = observe('Remind me.', { ...base, ...selector, ...list })
        assert.equal(kindOf(o), 'answer', `${name} / ${variant}`)
        assert.deepEqual(o.proposal.target, target, `${name} / ${variant}`)
        assert.equal(o.proposal.targetBasis, 'explicit_selection', `${name} / ${variant}`)
        assert.equal(o.admission.reason, 'observation_unqualified', `${name} / ${variant}`)
        assert.deepEqual(o.effects, ZERO_EFFECTS)
      }
  })

  it('a legacy Ask true keeps a supplied date or any other selection as its explicit target', () => {
    for (const [name, [selector, target]] of Object.entries(selectors)) {
      const o = observe('Remind me.', { audience: 'project', ...selector }, legacy(true))
      assert.deepEqual([o.proposal.target, o.proposal.targetBasis], [target, 'explicit_selection'], name)
    }
  })

  it('a date is an opaque reference: words in the text are never read as one', () => {
    const o = observe('Remind me tomorrow at noon.', base)
    assert.notEqual(o.proposal.targetBasis, 'explicit_selection')
    assert.deepEqual(observe('Remind me.', { ...base, uniqueDate: 'tomorrow' }).proposal.target, {
      kind: 'reference',
      id: 'tomorrow',
    })
  })

  it('several exact selectors resolve by the documented precedence', () => {
    const date = { uniqueDate: 'date14' }
    const cases: [Record<string, unknown>, unknown][] = [
      [
        { ...date, uniqueDecision: 'decision14' },
        { kind: 'reference', id: 'decision14' },
      ],
      [
        { ...date, attachment: 'brief@v1' },
        { kind: 'artifact', ref: 'brief@v1' },
      ],
      [
        { ...date, attachment: 'brief@v1', selectedArtifact: 'card@v2' },
        { kind: 'artifact', ref: 'card@v2' },
      ],
      [
        { ...date, selectedArtifact: 'card@v2', selectedComparison: ['card@v1', 'card@v2'] },
        { kind: 'comparison', refs: ['card@v1', 'card@v2'] },
      ],
    ]
    for (const [ctx, target] of cases)
      assert.deepEqual(observe('Remind me.', { ...base, ...ctx }).proposal.target, target)
  })

  it('ambiguity stays where nothing exact resolves it', () => {
    const generic = { candidates: ['x1', 'x2'] }
    for (const ctx of [{}, { selectedArtifact: null }, { unrelatedNativeHistory: true }]) {
      const o = observe('Remind me.', { ...base, ...generic, ...ctx })
      assert.equal(o.proposal.rule, 'target.ambiguous', JSON.stringify(ctx))
      assert.ok(o.uncertainty.includes('multiple_plausible_targets'))
    }
    const comparisons = observe('Remind me.', {
      ...base,
      uniqueDate: 'date14',
      possibleComparisons: [
        ['card@v1', 'card@v2'],
        ['card@v2', 'card@v3'],
      ],
    })
    assert.ok(comparisons.uncertainty.includes('multiple_plausible_comparisons'))
    const repos = observe('Remind me.', { ...base, uniqueDate: 'date14', possibleRepos: ['r1', 'r2'] })
    assert.ok(repos.uncertainty.includes('multiple_plausible_repositories'))
  })

  it('people, origins, legacy false and an identified Stop still decide before any target', () => {
    const ctx = { ...base, uniqueDate: 'date14', candidates: ['x1', 'x2'] }
    const toMarta = { audience: 'project', uniqueDate: 'date14', candidates: ['x1', 'x2'], trustedMentions: ['marta'] }
    assert.equal(kindOf(observe('Remind me.', toMarta)), 'human_message')
    assert.equal(kindOf(observe('Remind me.', { ...ctx, origin: 'receipt' })), 'no_action')
    assert.equal(kindOf(observe('Remind me.', ctx, legacy(false))), 'recorded_only')
    const stop = observe('Stop the job.', { ...ctx, activeMission: 'm14', control: 'running', stopQualified: true })
    assert.equal(kindOf(stop), 'control_stop')
    // An imported request beside authored words is data: the authored acknowledgement decides, not the selection.
    assert.equal(kindOf(observe('Remind me. Thanks.', { ...ctx, quotedText: 'Remind me.' })), 'no_action')
  })
})

/** A context with an explicit no-reply hint. */
const hint = (ctx: Record<string, unknown>, needsReply: boolean) => ({ ...ctx, needsReply })

describe('r15 (F01 discussion_r4531614346, F02 discussion_r4531614354): a no-reply hint never quiets a request or a malformed quotation', () => {
  const base = { audience: 'project', directAddress: 'sophia', selectedArtifact: 'plan@v3' }

  it('an imperative answer request decides the same with and without the hint', () => {
    for (const text of [
      'Explain the plan.',
      'Describe the diagram.',
      'Summarise this result.',
      'Tell me the answer.',
      'Compare them.',
      'Can you explain the plan?',
      'Thanks, now explain the plan.',
    ]) {
      const quiet = observe(text, hint(base, false))
      assert.equal(kindOf(quiet), 'answer', text)
      assert.deepEqual(decision(quiet), decision(observe(text, hint(base, true))), text)
    }
  })

  it('a question, a remark and an acknowledgement are still quieted; other requests are untouched', () => {
    for (const text of ['What changed?', 'All clear.', 'Thanks!', 'Why?'])
      assert.equal(kindOf(observe(text, hint(base, false))), 'no_action', text)
    assert.equal(kindOf(observe('What changed?', hint(base, true))), 'answer')
    const work = {
      audience: 'project',
      directAddress: 'sophia',
      activeMission: 'm15',
      control: 'running',
      stopQualified: true,
    }
    assert.equal(kindOf(observe('Stop the job.', hint(work, false))), 'control_stop')
    assert.equal(kindOf(observe('Research the market.', hint({ ...base }, false))), 'explore')
    assert.equal(kindOf(observe('Implement this change.', hint({ ...base, repo: 'repo15' }, false))), 'build_start')
  })

  it('malformed authored quotation abstains with or without the hint', () => {
    for (const text of [
      'Explain "the plan.',
      'Thanks “stop',
      'What is `this?',
      "Describe 'the diagram.",
      'All clear "x',
    ])
      for (const needsReply of [false, true]) {
        const o = observe(text, hint(base, needsReply))
        assert.equal(kindOf(o), 'abstain', `${text} needsReply=${String(needsReply)}`)
        assert.ok(o.uncertainty.includes('malformed_quotation'), text)
      }
  })

  it('balanced and imported evidence, origins, people, legacy and controls keep their precedence', () => {
    assert.equal(kindOf(observe('Thanks, "great".', hint(base, false))), 'no_action')
    assert.equal(kindOf(observe('Thanks. Explain "x', hint({ ...base, quotedText: 'Explain "x' }, false))), 'no_action')
    assert.equal(kindOf(observe('Explain "the plan.', hint({ ...base, origin: 'agent_result' }, false))), 'no_action')
    const toMarta = { audience: 'project', trustedMentions: ['marta'], needsReply: false }
    assert.equal(kindOf(observe('Explain "the plan.', toMarta)), 'human_message')
    assert.equal(kindOf(observe('Explain "the plan.', hint(base, false), legacy(false))), 'recorded_only')
    const work = { ...base, activeMission: 'm15', control: 'running', stopQualified: true }
    assert.deepEqual(
      decision(observe('Stop "the job.', hint(work, false))),
      decision(observe('Stop "the job.', hint(work, true))),
    )
  })
})

describe('r15 (F03 discussion_r4531614362): a build uses the exact selection it was resolved by, or says it cannot', () => {
  const base = { audience: 'project', directAddress: 'sophia', repo: 'repo15' }
  const lists: Record<string, Record<string, unknown>> = {
    'no list': {},
    candidates: { candidates: ['a', 'b'] },
    'possible targets': { possibleTargets: ['a', 'b'] },
  }
  const text = 'Implement this change.'

  it('an attachment is the build item, beside any generic list, with its explicit basis', () => {
    for (const [name, list] of Object.entries(lists)) {
      const o = observe(text, { ...base, ...list, attachment: 'spec@frozen-7' })
      assert.equal(kindOf(o), 'build_start', name)
      assert.deepEqual(o.proposal.target, { kind: 'repository_work', repo: 'repo15', item: 'spec@frozen-7' }, name)
      assert.equal(o.proposal.targetBasis, 'explicit_selection', name)
      assert.ok(!o.uncertainty.includes('objective_from_text_unverified'), name)
      assert.equal(o.admission.reason, 'observation_unqualified', name)
      assert.deepEqual(o.effects, ZERO_EFFECTS)
    }
  })

  it('the selected artifact and an issue keep precedence over an attachment', () => {
    const both = observe(text, { ...base, selectedArtifact: 'card@v2', attachment: 'spec@frozen-7' })
    assert.deepEqual(both.proposal.target, { kind: 'repository_work', repo: 'repo15', item: 'card@v2' })
    const issue = observe(text, { ...base, issue: '#42', attachment: 'spec@frozen-7' })
    assert.deepEqual(issue.proposal.target, { kind: 'repository_work', repo: 'repo15', item: 'issue#42' })
  })

  it('a selected comparison, decision or date is no build item: the build clarifies, with or without a list', () => {
    for (const selection of [
      { selectedComparison: ['card@v1', 'card@v2'] },
      { uniqueDecision: 'decision15' },
      { uniqueDate: 'date15' },
    ])
      for (const [name, list] of Object.entries(lists)) {
        const o = observe(text, { ...base, ...list, ...selection })
        assert.equal(o.proposal.rule, 'family.build_selection_unsupported', `${JSON.stringify(selection)} / ${name}`)
        assert.ok(o.uncertainty.includes('selected_context_not_buildable'))
      }
  })

  it('without any selection, the text objective and the generic ambiguity are as before; the guards still decide', () => {
    assert.ok(observe(text, base).uncertainty.includes('objective_from_text_unverified'))
    assert.equal(observe(text, { ...base, candidates: ['a', 'b'] }).proposal.rule, 'target.ambiguous')
    const attach = { ...base, attachment: 'spec@v7' }
    assert.equal(observe(text, { ...attach, acceptedVersion: 'v6' }).admission.reason, 'selected_version_not_accepted')
    assert.notEqual(
      observe(text, { ...attach, acceptedVersion: 'v7' }).admission.reason,
      'selected_version_not_accepted',
    )
    assert.ok(
      observe(text, { audience: 'project', directAddress: 'sophia', attachment: 'spec@v7' }).uncertainty.includes(
        'repository_unresolved',
      ),
    )
    assert.equal(observe(text, { ...attach, activeMission: 'm15' }).proposal.rule, 'family.build_relation_unknown')
  })
})

describe('r16 (INC03-R15-F01): the accepted-version guard reads only the item the build consumes', () => {
  const base = { audience: 'project', directAddress: 'sophia', repo: 'repo16' }
  const text = 'Implement the requested change.'
  const reason = (ctx: Record<string, unknown>) => observe(text, { ...base, ...ctx }).admission.reason

  it('an issue build keeps its conservative wait whatever an unused attachment says', () => {
    for (const issue of ['#431', '#77'])
      for (const attachment of [{}, { attachment: 'ignored@r8' }, { attachment: 'ignored@r7' }]) {
        const o = observe(text, { ...base, issue, acceptedVersion: 'r8', ...attachment })
        const label = `${issue} ${JSON.stringify(attachment)}`
        assert.deepEqual(o.proposal.target, { kind: 'repository_work', repo: 'repo16', item: `issue${issue}` }, label)
        assert.equal(o.proposal.targetBasis, 'explicit_selection', label)
        assert.equal(o.admission.reason, 'selected_version_not_accepted', label)
      }
    assert.equal(reason({ issue: '#431', attachment: 'ignored@r8' }), 'observation_unqualified')
  })

  it('the consumed artifact decides: a selected artifact over an attachment, an attachment when it is the item', () => {
    assert.equal(
      reason({ selectedArtifact: 'card@r7', attachment: 'att@r8', acceptedVersion: 'r8' }),
      'selected_version_not_accepted',
    )
    assert.equal(
      reason({ selectedArtifact: 'card@r7', attachment: 'att@r8', acceptedVersion: 'r7' }),
      'observation_unqualified',
    )
    assert.equal(reason({ attachment: 'att@r8', acceptedVersion: 'r8' }), 'observation_unqualified')
    assert.equal(reason({ attachment: 'att@r8', acceptedVersion: 'r7' }), 'selected_version_not_accepted')
    assert.equal(reason({ attachment: 'att@r8' }), 'observation_unqualified')
    assert.equal(reason({ attachment: 'att@r8:intro', acceptedVersion: 'r8' }), 'observation_unqualified')
  })

  it('a text objective and unsupported selections keep their existing outcomes', () => {
    assert.equal(reason({ acceptedVersion: 'r8' }), 'selected_version_not_accepted')
    const unsupported = observe(text, { ...base, uniqueDecision: 'decision16', acceptedVersion: 'r8' })
    assert.equal(unsupported.proposal.rule, 'family.build_selection_unsupported')
  })
})

describe('r17 (F01 discussion_r4532833094): a declared import is removed only as a complete span', () => {
  const live = {
    audience: 'project',
    activeMission: 'm5',
    control: 'running',
    stopQualified: true,
    holdQualified: true,
    manager: 'pm5',
    managerGeneration: 1,
  }
  // Each literal sits inside an authored token: removing it would leave a command the author never wrote.
  const inside: [string, string][] = [
    ['Stopping the job.', 'ping'],
    ['Holding the job.', 'ing'],
    ['Xhold the job.', 'x'],
    ['Non-stop the job.', 'non-'],
    ['Stop2 the job.', '2'],
    ['Stopé the job.', 'é'],
    ['Stoṕ the job.', '́'],
    ['停止stop the job.', '停止'],
    ['Stop.pause the job.', 'stop.'],
    ['Hold’s the job.', '’s'],
    // The rest of the token is a non-ASCII letter or mark only: an ASCII word test would call these complete.
    ['Ñping. Stop the job.', 'ping'],
    ['Pingñ. Stop the job.', 'ping'],
    ['停止ping. Stop the job.', 'ping'],
    ['Ping\u0301. Stop the job.', 'ping'],
  ]

  it('an occurrence inside an authored token is never sliced: the input abstains, in either field', () => {
    for (const field of ['quotedText', 'attachmentInstruction'])
      for (const [text, literal] of inside) {
        const o = observe(text, { ...live, [field]: literal })
        assert.equal(kindOf(o), 'abstain', `${field} ${JSON.stringify(text)}`)
        assert.ok(o.uncertainty.includes('malformed_quotation'), `${field} ${JSON.stringify(text)}`)
        assert.equal(o.fenced.quotedSpans, 0, JSON.stringify(text))
        assert.deepEqual(o.effects, ZERO_EFFECTS)
      }
  })

  it('a token-internal occurrence beside a complete one still abstains; repeated complete spans are all removed', () => {
    const text = '"Stop the job" and stop the jobs. Thanks.'
    assert.equal(kindOf(observe(text, { ...live, quotedText: 'stop the job' })), 'abstain')
    const repeated = observe('"Stop the job" and "stop the job". Thanks.', { ...live, quotedText: 'stop the job' })
    assert.equal(kindOf(repeated), 'no_action')
    // Two imports, then the two emptied quote pairs around them.
    assert.equal(repeated.fenced.quotedSpans, 4)
  })

  it('partially overlapping imports leave the bounds unknown; a contained or identical one is part of the larger', () => {
    const attached = { ...live, attachment: 'doc@v1' }
    const text = 'Summarize: stop the job.'
    const partial = observe(text, { ...attached, quotedText: 'stop the', attachmentInstruction: 'the job' })
    assert.equal(kindOf(partial), 'abstain')
    assert.ok(partial.uncertainty.includes('malformed_quotation'))
    for (const inner of ['the job', 'stop the job']) {
      const o = observe(text, { ...attached, quotedText: 'stop the job', attachmentInstruction: inner })
      assert.equal(kindOf(o), 'answer', inner)
      assert.equal(o.fenced.quotedSpans, 1, inner)
    }
    const self = observe('Thanks. Hold hold hold.', { ...live, quotedText: 'hold hold' })
    assert.equal(kindOf(self), 'abstain')
  })

  it('complete spans bounded by whitespace, punctuation or a clause dash stay data; authored controls beside them act', () => {
    const cases: [string, string, string][] = [
      ['"Stoppe den Job" stop the job.', 'Stoppe den Job', 'control_stop'],
      ['«Stoppe den Job». Pause the job.', 'Stoppe den Job', 'control_hold'],
      ['(halt the job), hold the job.', 'halt the job', 'control_hold'],
      ['Stop the job — "resume the job".', 'resume the job', 'control_stop'],
      ['Thanks—stop the job.', 'stop the job', 'no_action'],
      ['Thanks – stop the job!', 'stop the job', 'no_action'],
      ['停止 stop the job.', '停止', 'control_stop'],
    ]
    for (const field of ['quotedText', 'attachmentInstruction'])
      for (const [text, literal, kind] of cases) {
        const o = observe(text, { ...live, [field]: literal })
        assert.equal(kindOf(o), kind, `${field} ${JSON.stringify(text)}`)
        assert.ok(o.fenced.quotedSpans >= 1, JSON.stringify(text))
      }
  })

  it('a wholly imported command stays data, and the same text without a declaration is still read', () => {
    assert.equal(kindOf(observe('Stop the job.', { ...live, quotedText: 'stop the job.' })), 'abstain')
    assert.equal(kindOf(observe('Stopping the job.', live)), 'abstain')
    assert.equal(kindOf(observe('Stop the job.', live)), 'control_stop')
  })
})

describe('r17 (F02 discussion_r4532833098): ambiguity counts distinct candidates', () => {
  const repo = { audience: 'project', directAddress: 'sophia' }

  it('a repeated candidate is one candidate, decided exactly as the single list, never as an exact target', () => {
    const lists: [string, string, unknown, unknown][] = [
      ['Explain the card.', 'possibleTargets', ['card@v1', 'card@v1'], ['card@v1']],
      ['Explain the card.', 'candidates', ['card@v1', 'card@v1', 'card@v1'], ['card@v1']],
      [
        'Compare the cards.',
        'possibleComparisons',
        [
          ['card@v1', 'card@v2'],
          ['card@v1', 'card@v2'],
        ],
        [['card@v1', 'card@v2']],
      ],
      ['Implement the card.', 'possibleRepos', ['web', 'web'], ['web']],
    ]
    for (const [text, field, repeated, single] of lists) {
      const twice = observe(text, { ...project, [field]: repeated })
      const once = observe(text, { ...project, [field]: single })
      assert.deepEqual(decision(twice), decision(once), field)
      assert.deepEqual(twice.uncertainty, once.uncertainty, field)
      assert.notEqual(twice.proposal.rule, 'target.ambiguous', field)
      assert.notEqual(twice.proposal.targetBasis, 'explicit_selection', field)
    }
    const build = observe('Implement the card.', { ...repo, possibleRepos: ['web', 'web'] })
    assert.equal(build.proposal.rule, 'family.build_without_repository')
    assert.ok(build.uncertainty.includes('repository_unresolved'))
  })

  it('genuine multiples stay ambiguous; a comparison is its whole ordered pair', () => {
    const lists: [string, string, unknown, string][] = [
      ['Explain the card.', 'possibleTargets', ['card@v1', 'card@v2', 'card@v1'], 'multiple_plausible_targets'],
      ['Explain the card.', 'candidates', ['card@v1', 'Card@v1'], 'multiple_plausible_targets'],
      [
        'Compare the cards.',
        'possibleComparisons',
        [
          ['card@v1', 'card@v2'],
          ['card@v2', 'card@v1'],
        ],
        'multiple_plausible_comparisons',
      ],
      ['Implement the card.', 'possibleRepos', ['web', 'api', 'web'], 'multiple_plausible_repositories'],
    ]
    for (const [text, field, list, reason] of lists) {
      const o = observe(text, { ...project, [field]: list })
      assert.equal(o.proposal.rule, 'target.ambiguous', field)
      assert.deepEqual(o.uncertainty, [reason], field)
      assert.equal(o.admission.outcome, 'clarification_required', field)
    }
  })

  it('exact selections, a named repository, controls and people keep precedence; ordered selections keep their order', () => {
    const selected = observe('Compare the cards.', {
      ...project,
      selectedComparison: ['card@v2', 'card@v1'],
      possibleComparisons: [
        ['card@v1', 'card@v2'],
        ['card@v2', 'card@v1'],
      ],
    })
    assert.deepEqual(selected.proposal.target, { kind: 'comparison', refs: ['card@v2', 'card@v1'] })
    const named = observe('Implement the card.', { ...repo, repo: 'web', possibleRepos: ['web', 'api'] })
    assert.equal(named.proposal.kind, 'build_start')
    const stop = observe('Stop the job.', {
      ...running,
      stopQualified: true,
      possibleTargets: ['a', 'a', 'b'],
    })
    assert.equal(kindOf(stop), 'control_stop')
    const human = observe('Marta, explain the card.', {
      ...project,
      trustedMentions: ['marta'],
      currentMembers: ['marta'],
      possibleTargets: ['card@v1', 'card@v1'],
    })
    assert.equal(kindOf(human), 'human_message')
    for (const origin of ['generated', 'receipt'])
      assert.equal(
        kindOf(observe('Explain the card.', { ...project, origin, causedBy: 'opG', possibleTargets: ['a', 'b'] })),
        'no_action',
        origin,
      )
  })

  it('duplicates remain bounded by the list limits and still refused when malformed', () => {
    const tooMany = Array.from({ length: 1000 }, () => 'card@v1')
    assert.ok(
      errorCodes({ interaction: AUTO, text: 'Explain the card.', context: { ...project, possibleTargets: tooMany } })
        .length > 0,
    )
    assert.ok(
      errorCodes({
        interaction: AUTO,
        text: 'Compare the cards.',
        context: { ...project, possibleComparisons: [['card@v1'], ['card@v1']] },
      }).length > 0,
    )
  })
})

/** The r17 conflict expected for a payload rejected under operation op17: audit facts only. */
const conflictFor = (stored: IntakeObservation, payload: Record<string, unknown>): IntakeObservation => {
  const alone = observeIntake(payload)
  assert.ok(alone.ok)
  return {
    policy: INTAKE_OBSERVATION_POLICY_VERSION,
    observationId: '(checked separately)',
    inputSha256: alone.observation.inputSha256,
    contract: alone.observation.contract,
    audience: { scope: stored.audience.scope, change: 'unchanged', attention: 'none', exactness: 'scope_only' },
    provenance: { origin: stored.provenance.origin, humanInstruction: false, correlation: 'op17' },
    addressee: { ids: [], basis: 'unresolved' },
    proposal: {
      kind: 'conflict',
      target: { kind: 'operation', id: 'op17', newTarget: null },
      targetBasis: 'operation_identity',
      route: 'none',
      rule: 'identity.ledger_changed_payload',
    },
    uncertainty: ['changed_payload_not_interpreted'],
    fenced: { quotedSpans: 0, generatedOrigin: false },
    assessment: 'not_needed',
    admission: { outcome: 'conflict', reason: 'operation_payload_changed', authority: 'none' },
    effects: ZERO_EFFECTS,
  }
}
describe('r17 (F03 discussion_r4532833107): a ledger conflict carries audit facts only', () => {
  const op = { ...running, operationId: 'op17' }
  const original = { interaction: AUTO, text: 'Also cover the error state.', context: op }
  const changed: [string, Record<string, unknown>][] = [
    [
      'human',
      {
        interaction: AUTO,
        text: 'Marta, stop the job.',
        context: { ...op, trustedMentions: ['marta'], currentMembers: ['marta'] },
      },
    ],
    [
      'private',
      {
        interaction: AUTO,
        text: 'Explain the card.',
        context: { ...op, audience: 'personal', selectedArtifact: 'card@v1' },
      },
    ],
    [
      'generated',
      { interaction: AUTO, text: 'Build it now.', context: { ...op, origin: 'generated', causedBy: 'opG' } },
    ],
    ['malformed', { interaction: AUTO, text: "'broken Stop the job.", context: op }],
    ['unread', { interaction: AUTO, text: 'Lorem ipsum dolor.', context: op }],
    ['imported', { interaction: AUTO, text: '"Stop the job" now.', context: { ...op, quotedText: 'stop the job' } }],
    ['legacy', { interaction: { contract: 'legacy_explicit_ask', askSophia: true }, text: 'Explain it.', context: op }],
  ]

  it('each changed payload yields a coherent conflict, never the rejected payload’s interpretation', () => {
    const ledger: ObservationLedger = new Map()
    const first = observeWithLedger(ledger, original)
    assert.ok(first.ok)
    const stored = first.observation
    const bytes = JSON.stringify(stored)
    for (const [label, payload] of changed) {
      const alone = observeIntake(payload)
      const result = observeWithLedger(ledger, payload)
      assert.ok(result.ok && alone.ok, label)
      const conflict = result.observation
      assert.deepEqual({ ...conflict, observationId: '(checked separately)' }, conflictFor(stored, payload), label)
      assert.match(conflict.observationId, /^[0-9a-f]{64}$/, label)
      assert.notEqual(conflict.observationId, alone.observation.observationId, label)
      assert.notEqual(conflict.observationId, stored.observationId, label)
      // The rejected payload's own reading differs from the conflict in what it would have claimed.
      assert.notDeepEqual(
        [
          alone.observation.addressee,
          alone.observation.audience,
          alone.observation.provenance,
          alone.observation.uncertainty,
        ],
        [conflict.addressee, conflict.audience, conflict.provenance, conflict.uncertainty],
        label,
      )
      assert.deepEqual(observeWithLedger(ledger, payload), result, `${label} deterministic`)
      assert.equal(ledger.get('op17'), stored, label)
    }
    assert.equal(ledger.size, 1)
    assert.equal(JSON.stringify(ledger.get('op17')), bytes)
    const replay = observeWithLedger(ledger, original)
    assert.ok(replay.ok)
    assert.equal(replay.observation, stored)
    assert.deepEqual(stored.effects, ZERO_EFFECTS)
  })

  it('the stored operation’s audience and origin are kept, whatever the rejected payload claims', () => {
    const ledger: ObservationLedger = new Map()
    const first = observeWithLedger(ledger, {
      interaction: AUTO,
      text: 'Explain the card.',
      context: { audience: 'personal', selectedArtifact: 'card@v1', operationId: 'op17' },
    })
    assert.ok(first.ok)
    const result = observeWithLedger(ledger, {
      interaction: AUTO,
      text: 'Explain the card.',
      context: {
        audience: 'project',
        origin: 'agent_result',
        causedBy: 'opA',
        selectedArtifact: 'card@v1',
        operationId: 'op17',
      },
    })
    assert.ok(result.ok)
    assert.equal(result.observation.audience.scope, 'personal')
    assert.deepEqual(result.observation.provenance, {
      origin: 'unspecified',
      humanInstruction: false,
      correlation: 'op17',
    })
  })

  it('without an operation identity nothing is keyed, and an invalid payload is an error, never a conflict', () => {
    const ledger: ObservationLedger = new Map()
    assert.ok(observeWithLedger(ledger, { interaction: AUTO, text: 'Explain it.', context: running }).ok)
    assert.equal(ledger.size, 0)
    assert.ok(observeWithLedger(ledger, original).ok)
    const invalid = observeWithLedger(ledger, { interaction: AUTO, text: '', context: op })
    assert.equal(invalid.ok, false)
    assert.equal(ledger.size, 1)
  })
})

describe('r18 (R17-F01 comment 4542825715): trusted recipients are distinct before addressing', () => {
  const live = { audience: 'project', activeMission: 'm18', control: 'running', stopQualified: true }
  const text = 'Can you check the panel?'

  it('a repeated current human is one recipient; distinct people stay distinct, first occurrence first', () => {
    const once = observe(text, { ...live, trustedMentions: ['person-a'], currentMembers: ['person-a'] })
    const twice = observe(text, { ...live, trustedMentions: ['person-a', 'person-a'], currentMembers: ['person-a'] })
    assert.equal(kindOf(twice), 'human_message')
    assert.deepEqual(twice.addressee, { ids: ['person-a'], basis: 'structured_mention' })
    assert.deepEqual(decision(twice), decision(once))
    const people = observe(text, { ...live, trustedMentions: ['person-b', 'person-a', 'person-b', 'person-a'] })
    assert.deepEqual(people.addressee.ids, ['person-b', 'person-a'])
    // First occurrence, not last: a, b, a is a then b.
    const order = observe(text, { ...live, trustedMentions: ['person-a', 'person-b', 'person-a'] })
    assert.deepEqual(order.addressee.ids, ['person-a', 'person-b'])
    const duplicateMembers = observe(text, {
      ...live,
      trustedMentions: ['person-a', 'person-a'],
      currentMembers: ['person-a', 'person-a'],
    })
    assert.deepEqual(duplicateMembers.addressee.ids, ['person-a'])
  })

  it('repeated humans beside a repeated Sophia: each recipient once, Sophia last as before', () => {
    const mixed = observe('Explain the panel.', {
      ...live,
      selectedArtifact: 'panel@v4',
      trustedMentions: ['person-b', 'person-a', 'sophia', 'person-b', 'person-a', 'sophia'],
    })
    assert.deepEqual(mixed.addressee, { ids: ['person-b', 'person-a', 'sophia'], basis: 'structured_mention' })
    assert.equal(kindOf(mixed), 'answer')
  })

  it('dedupe never restores a departed member or invents a Sophia fallback', () => {
    const partial = observe(text, {
      ...live,
      trustedMentions: ['person-a', 'gone', 'person-a', 'gone'],
      currentMembers: ['person-a'],
    })
    assert.deepEqual(partial.addressee.ids, ['person-a'])
    assert.ok(partial.uncertainty.includes('mention_not_current_member'))
    assert.ok(!JSON.stringify(partial).includes('gone'))
    const allGone = observe(text, { ...live, trustedMentions: ['gone', 'gone'], currentMembers: ['person-a'] })
    assert.equal(kindOf(allGone), 'abstain')
    assert.equal(allGone.proposal.rule, 'address.structured_unresolved')
    assert.deepEqual(allGone.addressee, { ids: [], basis: 'unresolved' })
    const unknownMembers = observe(text, { ...live, trustedMentions: ['person-a', 'person-a'] })
    assert.deepEqual(unknownMembers.addressee.ids, ['person-a'])
  })

  it('origin, legacy and the list bound still decide; effects stay zero', () => {
    const repeated = { ...live, trustedMentions: ['person-a', 'person-a'], currentMembers: ['person-a'] }
    const generated = observe(text, { ...repeated, origin: 'generated', causedBy: 'opG' })
    assert.equal(kindOf(generated), 'no_action')
    assert.deepEqual(generated.addressee.ids, [])
    assert.equal(kindOf(observe(text, repeated, legacy(false))), 'recorded_only')
    assert.deepEqual(observe(text, repeated).effects, ZERO_EFFECTS)
    const many = Array.from({ length: 1000 }, () => 'person-a')
    assert.ok(errorCodes({ interaction: AUTO, text, context: { ...live, trustedMentions: many } }).length > 0)
  })
})

describe('r19 (R18-F01 comment 4543231220): a redelivery keeps its original operation as its correlation', () => {
  const live = { audience: 'project', activeMission: 'm19', control: 'running', stopQualified: true }
  const payloads: [boolean | undefined, string][] = [
    [true, 'identity.redelivery_same_payload'],
    [false, 'identity.redelivery_changed_payload'],
    [undefined, 'identity.redelivery_payload_unknown'],
  ]
  const contracts: [string, unknown][] = [
    ['automatic', AUTO],
    ['legacy true', legacy(true)],
    ['legacy false', legacy(false)],
  ]
  const delivery = (same: boolean | undefined, extra: Record<string, unknown> = {}) => ({
    ...live,
    redeliveryOf: 'op19',
    ...(same === undefined ? {} : { samePayload: same }),
    ...extra,
  })

  it('every payload state and contract: the correlation is the operation the target names', () => {
    for (const [same, rule] of payloads)
      for (const [name, interaction] of contracts) {
        const label = `${String(same)} ${name}`
        const o = observe('Stop the job.', delivery(same), interaction)
        assert.equal(o.proposal.rule, rule, label)
        assert.deepEqual(o.proposal.target, { kind: 'operation', id: 'op19', newTarget: null }, label)
        assert.deepEqual(o.provenance, { origin: 'unspecified', humanInstruction: false, correlation: 'op19' }, label)
        assert.deepEqual(o.effects, ZERO_EFFECTS, label)
      }
  })

  it('an original admission overrides the redelivered id for the target and the correlation alike', () => {
    for (const [same] of payloads)
      for (const [name, interaction] of contracts) {
        const o = observe('Stop the job.', delivery(same, { originalAdmission: 'adm19' }), interaction)
        assert.equal(o.proposal.target.kind === 'operation' && o.proposal.target.id, 'adm19', name)
        assert.equal(o.provenance.correlation, 'adm19', `${String(same)} ${name}`)
      }
  })

  it('a supplied causedBy, operationId or voiceUtterance does not replace the retained operation', () => {
    for (const extra of [{ causedBy: 'cause19' }, { operationId: 'transport19' }, { voiceUtterance: 'utt19' }]) {
      for (const [same] of payloads) {
        const o = observe('Stop the job.', delivery(same, extra))
        assert.equal(o.provenance.correlation, 'op19', JSON.stringify(extra))
        const admitted = observe('Stop the job.', delivery(same, { ...extra, originalAdmission: 'adm19' }))
        assert.equal(admitted.provenance.correlation, 'adm19', JSON.stringify(extra))
      }
    }
  })

  it('generated origin still decides before redelivery, with its own cause; other rules keep their chain', () => {
    const generated = observe('Stop the job.', delivery(true, { origin: 'generated', causedBy: 'cause19' }))
    assert.equal(generated.proposal.rule, 'origin.output_not_instruction')
    assert.equal(generated.provenance.correlation, 'cause19')
    const noCause = observe('Stop the job.', delivery(false, { origin: 'agent_result' }))
    assert.equal(noCause.proposal.rule, 'origin.output_not_instruction')
    assert.equal(noCause.provenance.correlation, null)
    const fresh = observe('Stop the job.', { ...live, operationId: 'op-fresh' })
    assert.equal(fresh.proposal.kind, 'control_stop')
    assert.equal(fresh.provenance.correlation, 'op-fresh')
    const voice = observe('Stop the job.', { ...live, origin: 'voice_final', voiceUtterance: 'utt19' })
    assert.equal(voice.provenance.correlation, 'utt19')
    assert.equal(observe('Stop the job.', live).provenance.correlation, null)
  })

  it('replay, conflict, addressee, quiet attention and admission are unchanged', () => {
    const replay = observe('Stop the job.', delivery(true, { trustedMentions: ['marta'] }))
    assert.equal(replay.proposal.kind, 'replay_original')
    assert.deepEqual(replay.admission, {
      outcome: 'replay_original',
      reason: 'operation_redelivered',
      authority: 'none',
    })
    assert.deepEqual(replay.addressee, { ids: ['marta'], basis: 'structured_mention' })
    assert.equal(replay.audience.attention, 'none')
    const conflict = observe('Stop the job.', delivery(false))
    assert.deepEqual(conflict.admission, {
      outcome: 'conflict',
      reason: 'operation_payload_changed',
      authority: 'none',
    })
    assert.deepEqual(conflict.addressee, { ids: [], basis: 'unresolved' })
  })
})

describe('r20 (R19-F01 comment 4544262973): a no-reply hint quiets the answer, never the addressees', () => {
  const shared = { audience: 'project' }
  const texts = ['Thanks.', 'What changed?', 'Lorem ipsum.']
  const addressings: [string, Record<string, unknown>, string[]][] = [
    ['human then Sophia', { trustedMentions: ['maria', 'sophia'] }, ['maria', 'sophia']],
    ['Sophia then human', { trustedMentions: ['sophia', 'maria'] }, ['maria', 'sophia']],
    [
      'repeats, first occurrence',
      { trustedMentions: ['luis', 'maria', 'sophia', 'luis'] },
      ['luis', 'maria', 'sophia'],
    ],
    [
      'a departed member dropped',
      { trustedMentions: ['maria', 'gone', 'sophia'], currentMembers: ['maria'] },
      ['maria', 'sophia'],
    ],
    ['every human departed', { trustedMentions: ['gone', 'sophia'], currentMembers: ['maria'] }, ['sophia']],
    ['Sophia only', { trustedMentions: ['sophia'] }, ['sophia']],
  ]

  it('ack, question and remark keep the resolved humans beside Sophia, as without the hint', () => {
    for (const text of texts)
      for (const [name, ctx, ids] of addressings) {
        const label = `${text} ${name}`
        const quiet = observe(text, { ...shared, ...ctx, needsReply: false })
        assert.equal(quiet.proposal.rule, 'family.no_reply_needed', label)
        assert.equal(kindOf(quiet), 'no_action', label)
        assert.deepEqual(quiet.addressee, { ids, basis: 'structured_mention' }, label)
        for (const given of [undefined, true]) {
          const asked = observe(text, { ...shared, ...ctx, ...(given === undefined ? {} : { needsReply: given }) })
          assert.deepEqual(asked.addressee, quiet.addressee, `${label} hint ${String(given)}`)
          assert.equal(asked.audience.attention, quiet.audience.attention, `${label} hint ${String(given)}`)
        }
        assert.ok(!JSON.stringify(quiet.addressee).includes('gone'), label)
        assert.deepEqual(quiet.admission.authority, 'none', label)
        assert.deepEqual(quiet.effects, ZERO_EFFECTS, label)
      }
  })

  it('attention follows the audience rule, not the hint: shared members may see it, a personal message stays private', () => {
    const inShared = observe('Thanks.', { ...shared, trustedMentions: ['maria', 'sophia'], needsReply: false })
    assert.equal(inShared.audience.attention, 'audience_members')
    const personal = observe('Thanks.', {
      audience: 'personal',
      trustedMentions: ['maria', 'sophia'],
      needsReply: false,
    })
    assert.deepEqual(personal.addressee.ids, ['maria', 'sophia'])
    assert.equal(personal.audience.attention, 'none')
  })

  it('human-only, protective controls, quotation, generated origin and legacy keep their precedence', () => {
    const human = observe('Thanks.', { ...shared, trustedMentions: ['maria'], needsReply: false })
    assert.equal(kindOf(human), 'human_message')
    assert.deepEqual(human.addressee.ids, ['maria'])
    const live = { audience: 'project', activeMission: 'm20', control: 'running', stopQualified: true }
    const stop = observe('Stop the job.', { ...live, trustedMentions: ['maria', 'sophia'], needsReply: false })
    assert.equal(kindOf(stop), 'control_stop')
    assert.deepEqual(stop.addressee.ids, ['maria', 'sophia'])
    const malformed = observe("What is 'this?", { ...shared, trustedMentions: ['maria', 'sophia'], needsReply: false })
    assert.equal(kindOf(malformed), 'abstain')
    const generated = observe('Thanks.', {
      ...shared,
      trustedMentions: ['maria', 'sophia'],
      needsReply: false,
      origin: 'generated',
      causedBy: 'op20',
    })
    assert.equal(kindOf(generated), 'no_action')
    assert.deepEqual(generated.addressee.ids, [])
    const legacyFalse = observe(
      'Thanks.',
      { ...shared, trustedMentions: ['maria', 'sophia'], needsReply: false },
      legacy(false),
    )
    assert.equal(kindOf(legacyFalse), 'recorded_only')
  })
})

describe('r20 (R19-F02 comment 4544262979): word boundaries read whole Unicode code points', () => {
  const live = { audience: 'project', activeMission: 'm20', control: 'running', stopQualified: true }
  const LETTER = '\u{10400}' // DESERET CAPITAL LETTER LONG I: \p{L}, two UTF-16 units
  const DIGIT = '\u{1D7D8}' // MATHEMATICAL DOUBLE-STRUCK DIGIT ZERO: \p{N}, two UTF-16 units
  const read = (text: string) => observe(text, live)
  const malformed = (text: string) => {
    const o = read(text)
    assert.equal(kindOf(o), 'abstain', JSON.stringify(text))
    assert.ok(o.uncertainty.includes('malformed_quotation'), JSON.stringify(text))
  }
  const stops = (text: string) => assert.equal(kindOf(read(text)), 'control_stop', JSON.stringify(text))

  it('a supplementary letter or digit before an apostrophe is a word character, as its ASCII and BMP analogues', () => {
    for (const c of [LETTER, DIGIT, 'A', '1', 'é']) for (const mark of ["'", '’']) stops(`Stop ${c}${mark}s job.`)
  })

  it('a supplementary letter after a name prefix is a word character', () => {
    for (const c of [LETTER, 'A', 'é']) stops(`Stop l'${c} now.`)
  })

  it('a letter before a one-letter prefix makes it no name prefix, whatever its width', () => {
    for (const c of [LETTER, DIGIT, 'A', 'é']) malformed(`Stop ${c}o'x job.`)
  })

  it('a contraction suffix followed by a supplementary letter does not end the token (no truncated lookahead)', () => {
    for (const c of [LETTER, DIGIT, 'a', 'é']) malformed(`Stop x're${c} job.`)
    stops("Stop x're job.")
  })

  it('a quoted pair touching a word character outside, on either side, is no bounded quotation', () => {
    for (const c of [LETTER, DIGIT, 'A', 'é']) {
      for (const [o, cl] of [
        ["'", "'"],
        ['‘', '’'],
      ]) {
        malformed(`Stop ${o}note${cl}${c}.`)
        malformed(`Stop ${c}${o}note${cl} now.`)
      }
    }
    const bounded = read("Stop 'note' now.")
    assert.equal(kindOf(bounded), 'control_stop')
    assert.equal(bounded.fenced.quotedSpans, 1)
    stops("Stop 'note'.")
  })

  it('a quoted span keeps its exact UTF-16 offsets around supplementary characters inside and beside it', () => {
    const o = read(`Stop '${LETTER}note${LETTER}' now.`)
    assert.equal(kindOf(o), 'control_stop')
    assert.equal(o.fenced.quotedSpans, 1)
    const imported = read(`Stop '${LETTER}' now. Explain 'x`)
    assert.equal(kindOf(imported), 'abstain')
  })

  it('unsupported combining marks and lone surrogates stay outside the word class (documented conservatism)', () => {
    malformed("Stop é's job.")
    malformed("Stop \ud801's job.")
    malformed("Stop x'\udc00 now.")
  })
})

/** The nine current negative facts and the block each puts on a new or replacement effect. */
const NEW_EFFECT_NEGATIVES: [string, Record<string, unknown>, { outcome: string; reason: string }][] = [
  ['source ineligible', { currentSourceEligible: false }, { outcome: 'denied', reason: 'source_ineligible' }],
  ['source permission', { sourcePermission: false }, { outcome: 'denied', reason: 'source_ineligible' }],
  ['unrelated native history', { unrelatedNativeHistory: true }, { outcome: 'denied', reason: 'source_ineligible' }],
  ['membership lost', { membershipRemovedBeforePublication: true }, { outcome: 'denied', reason: 'membership_lost' }],
  ['grant revoked', { grantRevokedBeforeSend: true }, { outcome: 'denied', reason: 'grant_revoked' }],
  ['project excluded', { projectExcludedByGrant: true }, { outcome: 'denied', reason: 'project_excluded' }],
  ['actor unauthorized', { currentActorAuthorized: false }, { outcome: 'denied', reason: 'actor_unauthorized' }],
  [
    'delegation unqualified',
    { resourceOwner: 'luis', requester: 'maria' },
    { outcome: 'denied', reason: 'native_delegation_unqualified' },
  ],
  ['pin unavailable', { pin: 'pin21', pinUnavailable: true }, { outcome: 'waiting', reason: 'pin_unavailable' }],
]

describe('r21 (R20-F01 comment 4544525044): an original effect of unknown outcome is reconciled, whatever blocks new ones', () => {
  const base = { audience: 'project', trustedMentions: ['sophia'], originalOperation: 'op21' }
  const RECONCILE = { outcome: 'reconciliation_required', reason: 'original_effect_outcome_unknown', authority: 'none' }

  it('both unknown states under each of the nine negatives keep the original reconciliation', () => {
    for (const state of ['possibly_sent', 'outcome_unknown'])
      for (const [name, negative] of NEW_EFFECT_NEGATIVES) {
        const label = `${state} ${name}`
        const o = observe('Try again.', { ...base, dispatchState: state, ...negative })
        assert.equal(kindOf(o), 'reconcile_original', label)
        assert.deepEqual(o.proposal.target, { kind: 'operation', id: 'op21', newTarget: null }, label)
        assert.deepEqual(o.admission, RECONCILE, label)
        assert.deepEqual(o.effects, ZERO_EFFECTS, label)
      }
  })

  it('a replacement target after a possible send, and a new target before one, still meet the current negatives', () => {
    for (const state of ['possibly_sent', 'outcome_unknown']) {
      const replacement = { ...base, dispatchState: state, newTarget: 'card@v3' }
      const plain = observe('Switch it to v3.', replacement)
      assert.equal(kindOf(plain), 'correlated_followup')
      assert.deepEqual(plain.admission, {
        outcome: 'waiting',
        reason: 'original_effect_outcome_unknown',
        authority: 'none',
      })
      for (const [name, negative, block] of NEW_EFFECT_NEGATIVES)
        assert.deepEqual(
          observe('Switch it to v3.', { ...replacement, ...negative }).admission,
          { ...block, authority: 'none' },
          `${state} replacement ${name}`,
        )
    }
    for (const [name, negative, block] of NEW_EFFECT_NEGATIVES) {
      const o = observe('Switch it to v3.', { ...base, dispatchState: 'not_sent', newTarget: 'card@v3', ...negative })
      assert.equal(kindOf(o), 'correct_proposal', name)
      assert.deepEqual(o.admission, { ...block, authority: 'none' }, `not_sent new target ${name}`)
    }
  })

  it('a retry of an unsent operation and a stale correction keep their settled outcomes', () => {
    for (const [name, negative] of NEW_EFFECT_NEGATIVES) {
      const retry = observe('Try again.', { ...base, dispatchState: 'not_sent', ...negative })
      assert.deepEqual(retry.admission.outcome, 'replay_original', name)
      const stale = observe('Switch it to v3.', {
        ...base,
        dispatchState: 'not_sent',
        newTarget: 'card@v3',
        expectedRevision: 2,
        currentRevision: 3,
        ...negative,
      })
      assert.deepEqual(stale.admission.outcome, 'conflict', name)
    }
  })

  it('people, a quiet hint, generated origin and redelivery keep their precedence', () => {
    const unknown = { ...base, dispatchState: 'outcome_unknown', currentSourceEligible: false }
    const human = observe('Try again.', { ...unknown, trustedMentions: ['maria'] })
    assert.equal(kindOf(human), 'human_message')
    assert.ok(human.uncertainty.includes('operation_metadata_not_applied'))
    const quiet = observe('Try again.', { ...unknown, needsReply: false })
    assert.deepEqual([kindOf(quiet), quiet.admission.outcome], ['reconcile_original', 'reconciliation_required'])
    const generated = observe('Try again.', { ...unknown, origin: 'generated', causedBy: 'op-g' })
    assert.equal(generated.proposal.rule, 'origin.output_not_instruction')
    const redelivered = observe('Try again.', { ...unknown, redeliveryOf: 'op-r', samePayload: true })
    assert.equal(redelivered.proposal.rule, 'identity.redelivery_same_payload')
    assert.equal(redelivered.admission.outcome, 'replay_original')
  })
})

describe('r22 (R21-F02 comment 4544778335): the addressee notation is injective', () => {
  it('ordinary ids keep the compact notation; ids it cannot carry render as a sorted JSON list', () => {
    assert.equal(renderAddressee([]), 'none')
    assert.equal(renderAddressee(['sophia', 'maria']), 'maria+sophia')
    assert.equal(renderAddressee(['none']), '["none"]')
    assert.equal(renderAddressee(['a+b']), '["a+b"]')
    assert.equal(renderAddressee(['[x']), '["[x"]')
    assert.equal(renderAddressee(['']), '[""]')
    const forms = [['a+b', 'c'], ['a', 'b+c'], ['a', 'b', 'c'], ['a+b'], ['a', 'b'], ['none'], []].map((ids) =>
      renderAddressee(ids),
    )
    assert.equal(new Set(forms).size, forms.length, JSON.stringify(forms))
  })
})

/** A proposal's kind and the rule that produced it. */
const ruleOf = (o: IntakeObservation) => `${o.proposal.kind} ${o.proposal.rule}`

/** An acknowledgement term with "also" placed before, after and between, with fillers, separators and repetition. */
const alsoForms = (t: string) => [
  `Also, ${t}.`,
  `Also ${t}.`,
  `${t} also.`,
  `${t}, also!`,
  `Please also ${t}, ${t}.`,
  `${t} \u2014 also, please.`,
]

// v22 (R25-F01): an "also" marker counts only on a clause with authored words left after its fillers and
// acknowledgements are peeled. Fresh public sentences written for the rule; no corpus case.
describe('v22: an empty "also" adds nothing to a mission', () => {
  const live = {
    audience: 'project',
    activeMission: 'm-r26',
    manager: 'pm-r26',
    managerGeneration: 4,
    control: 'running',
  }
  it('every acknowledgement with "also" in any place, with fillers, separators and repetition, stays quiet', () => {
    for (const term of LEXICON.ack)
      for (const text of alsoForms(term)) {
        const o = observe(text, live)
        assert.equal(ruleOf(o), 'no_action family.acknowledgement', text)
        assert.deepEqual(o.addressee.ids, [], text)
      }
  })

  it('a marker or filler with no words of its own is outside the lexicon, never a follow-up', () => {
    for (const text of ['Also.', 'Also, please.', 'Please, also.', 'Also, also.', 'Just also, now!']) {
      const o = observe(text, live)
      assert.equal(kindOf(o), 'abstain', text)
      assert.ok(o.uncertainty.includes('outside_lexicon'), text)
    }
  })

  it('a marked clause with words of its own still follows up; questions, controls and the other barriers are kept', () => {
    const cases: Array<[string, Record<string, unknown>, string]> = [
      ['Also, add the requested safeguard.', live, 'manager_followup family.followup'],
      ['Also, kaleidoscope.', live, 'manager_followup family.followup'],
      ['Kaleidoscope, also.', live, 'manager_followup family.followup'],
      ['Also, thanks, kaleidoscope.', live, 'manager_followup family.followup'],
      ['Thanks also include the missing fact.', live, 'manager_followup family.followup'],
      ['Thanks, also add a loading state.', live, 'manager_followup family.followup'],
      ['Also, how is the mission going?', live, 'manager_inquiry family.inquiry'],
      ['Also, thanks, stop.', { ...live, stopQualified: true }, 'control_stop family.control_stop'],
      ['Also pause the job.', live, 'control_hold family.control_hold'],
      ['Also, thanks.', { ...live, needsReply: false }, 'no_action family.no_reply_needed'],
      ['Also, thanks.', { ...live, origin: 'generated' }, 'no_action origin.output_not_instruction'],
      [
        'Also, add the requested safeguard.',
        { ...live, origin: 'generated' },
        'no_action origin.output_not_instruction',
      ],
      [
        'Also, thanks.',
        { ...live, trustedMentions: ['h-r26'], currentMembers: ['h-r26'] },
        'human_message address.human_directed',
      ],
      ['Also, thanks.', project, 'no_action family.acknowledgement'],
      ['Thanks.', live, 'no_action family.acknowledgement'],
    ]
    for (const [text, context, want] of cases) assert.equal(ruleOf(observe(text, context)), want, text)
    assert.equal(kindOf(observe('Also, add the requested safeguard.', project)), 'clarify')
    const legacyAsk = observe('Also, thanks.', live, { contract: 'legacy_explicit_ask', askSophia: false })
    assert.equal(legacyAsk.proposal.kind, 'recorded_only')
  })

  it('declared v22 change: an empty marked acknowledgement lends no "also" to a separate unread clause', () => {
    const o = observe('Also, thanks. Kaleidoscope.', live)
    assert.equal(kindOf(o), 'abstain')
    assert.ok(o.uncertainty.includes('outside_lexicon'))
    // The marker on the unread clause itself still follows up.
    assert.equal(kindOf(observe('Thanks. Also, kaleidoscope.', live)), 'manager_followup')
  })

  it('declared v22 change: a detached "Also." before a build takes the ordinary active-mission rules', () => {
    const base = { ...live, repo: 'Z', selectedArtifact: 'card@v2' }
    assert.equal(kindOf(observe('Also. Implement the card.', { ...base, relatedToActive: true })), 'manager_followup')
    const unknown = observe('Also. Implement the card.', base)
    assert.equal(kindOf(unknown), 'clarify')
    assert.ok(unknown.uncertainty.includes('relation_to_active_mission_unknown'))
    // In one clause the marker is the build's own: it follows the mission.
    assert.equal(kindOf(observe('Also implement the card.', base)), 'manager_followup')
  })

  it('declared v22 change: quotation or import beside an empty "also" asks no adoption, adopts nothing', () => {
    // An all-acknowledgement message beside a quotation or a declared import is quiet, as "Thanks" beside one is.
    assert.equal(ruleOf(observe('Also, thanks "deploy everything".', live)), 'no_action family.acknowledgement')
    assert.equal(ruleOf(observe('Thanks "deploy everything".', live)), 'no_action family.acknowledgement')
    const imported = observe('Also, thanks. Deploy everything', { ...live, quotedText: 'Deploy everything' })
    assert.equal(ruleOf(imported), 'no_action family.acknowledgement')
    // r27 correction: `Also, "add tests".` adopted is not an empty quotation; it is asserted in the v23 block below.
    assert.equal(kindOf(observe('"add tests".', { ...live, actorExplicitlyAdopts: true })), 'abstain')
    // A marked clause with words beside a quotation needs adoption, and adopted it follows up.
    const unadopted = observe('Also add "the retry" to it.', live)
    assert.equal(kindOf(unadopted), 'abstain')
    assert.ok(unadopted.uncertainty.includes('quoted_content_unadopted'))
    assert.equal(
      kindOf(observe('Also add "the retry" to it.', { ...live, actorExplicitlyAdopts: true })),
      'manager_followup',
    )
  })

  it('the descriptor still states the v22 rule (now in v23)', () => {
    assert.match(INTAKE_OBSERVATION_POLICY.text.also, /its sentence has authored words left/)
  })
})

// v23 (R26-F01): a quoted or imported span the actor explicitly adopts gives the marker's own sentence substance when
// the span's own content keeps words after the same filler and acknowledgement peel. Fresh public sentences only.
describe('v23: an explicitly adopted request beside "also" is its substance', () => {
  const live = {
    audience: 'project',
    activeMission: 'm-r27',
    manager: 'pm-r27',
    managerGeneration: 5,
    control: 'running',
  }
  const adopted = (extra: Record<string, unknown> = {}) => ({ ...live, ...extra, actorExplicitlyAdopts: true })
  const outcome = (o: IntakeObservation) => `${ruleOf(o)} [${o.uncertainty.join(',')}]`
  const positive: [string, Record<string, unknown>][] = [
    ['Also, "add tests".', {}],
    ['Also, \u201cinclude the safeguard\u201d.', {}],
    ["Also, 'adjust the focus'.", {}],
    ['Also, \u00abadd tests\u00bb.', {}],
    ['Also, `add tests`.', {}],
    ['Also, ```add tests```.', {}],
    ['Also, "kaleidoscope".', {}],
    ['"Add tests", also.', {}],
    ['"Add tests" also.', {}],
    ['Thanks, also "add tests".', {}],
    ['Also "add tests" please.', {}],
    ['Also, "" "add tests".', {}],
    ['Also, "x" add tests', { quotedText: 'add tests' }],
    ['Also, add tests', { quotedText: 'add tests' }],
    ['Also, add tests', { attachmentInstruction: 'add tests' }],
    ['Unrelated words. Also, "add tests".', {}],
  ]
  const empty: [string, Record<string, unknown>][] = [
    ['Also, "".', {}],
    ['Also, "also".', {}],
    ['Also, "please".', {}],
    ['Also, "thanks".', {}],
    ['Also, "okay, thanks".', {}],
    ["Also, 'thanks'.", {}],
    ['Also, "@sam".', {}],
    ['Also, "" "thanks".', {}],
    ['Also, thanks', { quotedText: 'thanks' }],
  ]

  it('adopted substantive content follows up in every quotation and import form, before or after the marker', () => {
    for (const [text, extra] of positive) {
      const o = observe(text, adopted(extra))
      assert.equal(ruleOf(o), 'manager_followup family.followup', text)
      assert.deepEqual(o.proposal.target, {
        kind: 'mission',
        id: 'm-r27',
        manager: 'pm-r27',
        generation: 5,
        binding: null,
      })
      assert.notEqual(kindOf(observe(text, { ...live, ...extra })), 'manager_followup', `unadopted: ${text}`)
    }
  })

  it('empty, marker, filler, acknowledgement or mention-only adopted content invents no work', () => {
    for (const [text, extra] of empty) {
      const o = observe(text, adopted(extra))
      assert.notEqual(kindOf(o), 'manager_followup', text)
      // Adopting nothing changes nothing.
      assert.equal(outcome(o), outcome(observe(text, { ...live, ...extra })), text)
    }
  })

  it("only the marker's own sentence counts; with no marker, adoption adds nothing", () => {
    const cases: [string, Record<string, unknown>, string][] = [
      ['Also. "Add tests".', {}, 'abstain abstain [outside_lexicon,semantic_assessment_required]'],
      ['Also, okay. "Add tests".', {}, 'no_action family.acknowledgement []'],
      ['Also, okay. Add tests', { quotedText: 'Add tests' }, 'no_action family.acknowledgement []'],
      ['"add tests".', {}, 'abstain abstain [outside_lexicon,semantic_assessment_required]'],
      ['Okay "add tests".', {}, 'no_action family.acknowledgement []'],
      ['Also: \n> add tests', {}, 'abstain abstain [outside_lexicon,semantic_assessment_required]'],
    ]
    for (const [text, extra, want] of cases) {
      assert.equal(outcome(observe(text, adopted(extra))), want, text)
      assert.equal(outcome(observe(text, { ...live, ...extra })), want, `unadopted: ${text}`)
    }
    // A second marker inside the adopted request's own sentence is what counts, not the earlier detached one.
    assert.equal(ruleOf(observe('Also, okay. "Add tests", also.', adopted())), 'manager_followup family.followup')
  })

  it('unadopted data supplies nothing and keeps each of its own reasons', () => {
    const cases: [string, Record<string, unknown>, string][] = [
      ['Also, "add tests".', {}, 'abstain abstain [outside_lexicon,semantic_assessment_required]'],
      ['Also add "the retry" to it.', {}, 'abstain abstain [quoted_content_unadopted,semantic_assessment_required]'],
      ['Also, okay "add tests".', {}, 'no_action family.acknowledgement []'],
      ['Also, okay. Add tests', { quotedText: 'Add tests' }, 'no_action family.acknowledgement []'],
      [
        'Also, add tests',
        { quotedText: 'add tests' },
        'abstain abstain [outside_lexicon,semantic_assessment_required]',
      ],
    ]
    for (const [text, extra, want] of cases) assert.equal(outcome(observe(text, { ...live, ...extra })), want, text)
    assert.equal(ruleOf(observe('Also add "the retry" to it.', adopted())), 'manager_followup family.followup')
  })

  it('malformed bounds, origin, reply, address, Stop, mission and legacy decide as before', () => {
    const cases: [string, Record<string, unknown>, unknown, string][] = [
      ['Also, "add tests.', {}, AUTO, 'abstain abstain [malformed_quotation,semantic_assessment_required]'],
      ['Also, \\"add tests\\".', {}, AUTO, 'abstain abstain [malformed_quotation,semantic_assessment_required]'],
      ['Also, okay "add tests.', {}, AUTO, 'abstain abstain [malformed_quotation,semantic_assessment_required]'],
      ['Also, "add tests".', { origin: 'generated' }, AUTO, 'no_action origin.output_not_instruction []'],
      ['Also, "add tests".', { needsReply: false }, AUTO, 'no_action family.no_reply_needed []'],
      [
        'Also, "add tests".',
        { trustedMentions: ['h-r27'], currentMembers: ['h-r27'] },
        AUTO,
        'human_message address.human_directed []',
      ],
      ['Also, "add tests", stop.', { stopQualified: true }, AUTO, 'control_stop family.control_stop []'],
      ['Also, "add tests".', {}, legacy(false), 'recorded_only legacy.ask_false []'],
    ]
    for (const [text, extra, interaction, want] of cases) {
      assert.equal(outcome(observe(text, adopted(extra), interaction)), want, text)
      assert.equal(outcome(observe(text, { ...live, ...extra }, interaction)), want, `unadopted: ${text}`)
    }
    const noMission = observe('Also, "add tests".', { audience: 'project', actorExplicitlyAdopts: true })
    assert.equal(outcome(noMission), 'abstain abstain [outside_lexicon,semantic_assessment_required]')
  })

  it('quoted words stay fenced for families: an adopted quoted "stop" is a follow-up, as in v21, never a control', () => {
    assert.equal(ruleOf(observe('Also, "stop".', adopted())), 'manager_followup family.followup')
    assert.equal(ruleOf(observe('Also, "add tests"?', adopted())), 'manager_followup family.followup')
  })

  it('an authored U+2063 is ordinary authored text, never a mark of adoption', () => {
    // The invisible separator is a word of the authored text, so the v22 rule already counts it, adopted or not.
    for (const text of ['Also, \u2063 "thanks".', 'Also, "thanks" \u2063.', 'Also, "add tests" \u2063.']) {
      assert.equal(ruleOf(observe(text, adopted())), 'manager_followup family.followup', text)
      const unadopted = observe(text, live)
      assert.equal(outcome(unadopted), 'abstain abstain [quoted_content_unadopted,semantic_assessment_required]', text)
    }
  })

  it('apostrophes, quote lines and a fence beside an import keep their bounds', () => {
    assert.equal(ruleOf(observe("Also, it's 'add tests'.", adopted())), 'manager_followup family.followup')
    assert.equal(ruleOf(observe("Also, 'don't add tests'.", adopted())), 'manager_followup family.followup')
    assert.equal(ruleOf(observe('> add tests\nAlso.', adopted())), 'manager_followup family.followup')
    for (const [text, extra] of [...positive, ...empty]) {
      const spans = observe(text, adopted(extra)).fenced.quotedSpans
      assert.equal(spans, observe(text, { ...live, ...extra }).fenced.quotedSpans, text)
      assert.ok(spans >= 1, text)
    }
  })

  it('the descriptor still states the v23 rule (now in v24)', () => {
    assert.match(INTAKE_OBSERVATION_POLICY.text.also, /explicitly adopts whose own content has words left/)
  })
})

interface DelimiterShape {
  carrier: string
  wrapper: string
  content: string
  literal: string
}
/** A shape the matrix can write: an ordinary quotation needs a wrapper, an import needs a non-empty literal. */
const validShape = (x: DelimiterShape) => (x.carrier === 'ordinary' ? x.wrapper !== 'none' : x.literal !== '')

// v24 (R27-F01): an adopted span's content is read without its own quotation, escaped-quote and encoded-quote
// delimiters, the same way for a declared import (either field), a fenced span and a single-quote pair; apostrophes
// inside words stay. Fresh public sentences only; every expectation is the contract for that shape.
describe('v24: quotation and escape framing around adopted content is never its words', () => {
  const live = {
    audience: 'project',
    activeMission: 'm-r28',
    manager: 'pm-r28',
    managerGeneration: 7,
    control: 'running',
  }
  const outcome = (o: IntakeObservation) => `${ruleOf(o)} [${o.uncertainty.join(',')}]`
  const FOLLOW = 'manager_followup family.followup []'
  const QUIET = 'no_action family.acknowledgement []'
  const UNREAD = 'abstain abstain [outside_lexicon,semantic_assessment_required]'
  const MALFORMED = 'abstain abstain [malformed_quotation,semantic_assessment_required]'
  // No words once framing, fillers, acknowledgements, markers and mentions are gone ("..." has no word at all).
  const empty = ['', 'thanks', 'okay, thanks', 'please', 'also', '@person', '...']
  // Words: known and unread requests, contractions and name prefixes kept whole, and opaque "-" as aa reads it.
  const words = ['add tests', 'kaleidoscope', "don't add tests", "check o'brien's note", '-']
  const wrappers: [string, string, string][] = [
    ['none', '', ''],
    ['straight single', "'", "'"],
    ['curly single', '\u2018', '\u2019'],
    ['straight double', '"', '"'],
    ['curly double', '\u201c', '\u201d'],
    ['backtick', '`', '`'],
    ['guillemets', '\u00ab', '\u00bb'],
    ['escaped single', "\\'", "\\'"],
    ['encoded single', '&apos;', '&apos;'],
    ['double around single', `"'`, `'"`],
  ]
  const surfaces: [string, (x: string) => string][] = [
    ['okay', (x) => `Also, okay ${x}.`],
    ['bare', (x) => `Also, ${x}.`],
  ]
  /** The contract for one shape: what it must give, adopted or not. */
  function expected(carrier: string, wrapper: string, content: string, surface: string, adopted: boolean): string {
    // Escaped or encoded quotes written in the authored text cannot be bounded: they abstain, whatever is inside.
    if (carrier === 'ordinary' && (wrapper === 'escaped single' || wrapper === 'encoded single')) return MALFORMED
    // A declared "..." overlaps itself inside the authored "....": the import's bounds are unknown (r17), kept.
    if (carrier !== 'ordinary' && wrapper === 'none' && content === '...') return MALFORMED
    if (adopted && words.includes(content)) return FOLLOW
    return surface === 'okay' ? QUIET : UNREAD
  }
  const shapes: DelimiterShape[] = ['ordinary', 'quotedText', 'attachmentInstruction'].flatMap((carrier) =>
    wrappers.flatMap(([wrapper, open, close]) =>
      [...empty, ...words].map((content) => ({ carrier, wrapper, content, literal: `${open}${content}${close}` })),
    ),
  )
  const cases = shapes.filter(validShape).flatMap((x) =>
    surfaces.flatMap(([surface, write]) =>
      [true, false].map((adopted) => ({
        label: `${x.carrier} / ${x.wrapper} / ${JSON.stringify(x.content)} / ${surface} / adopted ${String(adopted)}`,
        text: write(x.literal),
        context: {
          ...live,
          actorExplicitlyAdopts: adopted,
          ...(x.carrier === 'ordinary' ? {} : { [x.carrier]: x.literal }),
        },
        want: expected(x.carrier, x.wrapper, x.content, surface, adopted),
      })),
    ),
  )

  it('every carrier, wrapper, content and surface gives its contract outcome', () => {
    assert.ok(cases.length > 1000, String(cases.length))
    for (const c of cases) assert.equal(outcome(observe(c.text, c.context)), c.want, c.label)
  })

  it('the reported failures: single-quoted acknowledgements, fillers, markers and mentions in either import field', () => {
    for (const field of ['quotedText', 'attachmentInstruction'])
      for (const literal of [
        "''",
        "'thanks'",
        "'okay, thanks'",
        "'please'",
        "'also'",
        "'@public'",
        '\u2018thanks\u2019',
      ]) {
        const o = observe(`Also, okay ${literal}.`, { ...live, actorExplicitlyAdopts: true, [field]: literal })
        assert.equal(outcome(o), QUIET, `${field} ${literal}`)
      }
  })

  it('a double quotation around single-quoted thanks is no work; around a real request it follows up', () => {
    assert.equal(outcome(observe(`Also, "'thanks'".`, { ...live, actorExplicitlyAdopts: true })), UNREAD)
    assert.equal(outcome(observe(`Also, "'add tests'".`, { ...live, actorExplicitlyAdopts: true })), FOLLOW)
  })

  it('fence counts are the same adopted or not (malformed bounds are in the contract above)', () => {
    for (const c of cases.filter((x) => !x.context.actorExplicitlyAdopts)) {
      const adopted = observe(c.text, { ...c.context, actorExplicitlyAdopts: true })
      assert.equal(adopted.fenced.quotedSpans, observe(c.text, c.context).fenced.quotedSpans, c.label)
    }
  })

  it('the descriptor still states the v24 framing rule', () => {
    assert.match(INTAKE_OBSERVATION_POLICY.text.also, /without its own quotation, escaped-quote and encoded-quote/)
  })
})

/** r30: everything an observation decides, for comparing a dash-joined form with its spaced form. */
const facts = (o: IntakeObservation) =>
  JSON.stringify([o.proposal.kind, o.proposal.rule, o.uncertainty, o.addressee, o.fenced])
/** r30: a term as written, capitalised and in capitals. */
const cased = (t: string) => [t, `${t[0]?.toUpperCase() ?? ''}${t.slice(1)}`, t.toUpperCase()]

describe('v25: a leading filler or "also" ends where an acknowledgement does, and is consumed with its separator', () => {
  const live = {
    audience: 'project',
    activeMission: 'm-r30',
    manager: 'pm-r30',
    managerGeneration: 3,
    control: 'running',
    stopQualified: true,
  }
  const DASHES = ['-', '\u2013', '\u2014', ' - ', ' \u2013 ', ' \u2014 ']
  const prefixes = [...LEXICON.fillers, ...LEXICON.followupMarkers]

  it('every existing filler and "also", in each casing, joined by a dash, reads as its spaced form: Stop and Hold', () => {
    const requests = [
      ['stop.', 'control_stop'],
      ['hold the job.', 'control_hold'],
    ] as const
    for (const t of prefixes.flatMap(cased))
      for (const [request, want] of requests) {
        const spaced = observe(`${t} ${request}`, live)
        assert.equal(kindOf(spaced), want, `${t} ${request}`)
        for (const text of DASHES.map((dash) => `${t}${dash}${request}`))
          assert.equal(facts(observe(text, live)), facts(spaced), text)
      }
  })

  it('"also" joined by a dash to its own words follows up', () => {
    for (const dash of DASHES)
      for (const t of cased('also')) {
        const text = `${t}${dash}add tests.`
        assert.equal(ruleOf(observe(text, live)), 'manager_followup family.followup', text)
      }
  })

  it('repeated and acknowledgement-interleaved prefixes compose, each with its own separator', () => {
    const cases: Array<[string, string]> = [
      ['Thanks\u2014please\u2014stop.', 'control_stop'],
      ['Now\u2014just\u2014stop.', 'control_stop'],
      ['Please - also - thanks - stop.', 'control_stop'],
      ['Okay\u2013kindly\u2013also\u2013hold the job.', 'control_hold'],
      ['Hey-Sophia-stop.', 'control_stop'],
      ['Please\u2014can you\u2014stop.', 'control_stop'],
      ['Thanks\u2014also\u2014add tests.', 'manager_followup'],
    ]
    for (const [text, want] of cases) assert.equal(kindOf(observe(text, live)), want, text)
  })

  it('an "also", filler or acknowledgement with no words of its own after a dash adds nothing', () => {
    for (const [dashed, spaced] of [
      ['Also\u2014.', 'Also.'],
      ['Please\u2014.', 'Please.'],
      ['Also\u2014thanks.', 'Also, thanks.'],
      ['Thanks\u2014also.', 'Thanks, also.'],
      ['Please\u2013thanks.', 'Please, thanks.'],
    ] as const) {
      const o = observe(dashed, live)
      assert.equal(facts(o), facts(observe(spaced, live)), dashed)
      assert.notEqual(kindOf(o), 'manager_followup', dashed)
    }
    assert.equal(ruleOf(observe('Also\u2014thanks.', live)), 'no_action family.acknowledgement')
  })

  it('verbs are not widened: compounds and longer tokens beginning with a filler or a verb stay unread', () => {
    for (const text of [
      'non-stop.',
      'stop-motion.',
      'stop-gap.',
      'Please\u2014non-stop.',
      'Please\u2014stop-motion.',
      'Please-stop-gap.',
      'nowhere stop.',
      'pleasehood stop.',
      'Sophiaish stop.',
      'just-in-time stop.',
      'alsohold the job.',
    ]) {
      const o = observe(text, live)
      assert.equal(kindOf(o), 'abstain', text)
      assert.ok(o.uncertainty.includes('outside_lexicon'), text)
    }
    // A peeled "also" lends its follow-up to the unread compound, exactly as with a space; it is never a control.
    assert.equal(facts(observe('Also-stop-gap.', live)), facts(observe('Also stop-gap.', live)))
    assert.equal(kindOf(observe('Also-stop-gap.', live)), 'manager_followup')
  })

  it('questions, quotations, imports, generated and human input and legacy Ask keep their precedence', () => {
    for (const [dashed, spaced] of [
      ['Please\u2014how is the mission going?', 'Please how is the mission going?'],
      ['Also\u2014how is the mission going?', 'Also how is the mission going?'],
      ['Please\u2014"stop".', 'Please "stop".'],
      ['Also\u2014\u201cadd tests\u201d.', 'Also \u201cadd tests\u201d.'],
    ] as const)
      assert.equal(facts(observe(dashed, live)), facts(observe(spaced, live)), dashed)
    assert.equal(kindOf(observe('Please\u2014how is the mission going?', live)), 'manager_inquiry')
    const imported = observe('Please\u2014hold on, summarize the note.', {
      ...live,
      attachment: 'note@v1',
      attachmentInstruction: 'hold on',
    })
    assert.equal(kindOf(imported), 'answer')
    assert.equal(imported.fenced.quotedSpans, 1)
    assert.equal(
      ruleOf(observe('Please\u2014stop.', { ...live, origin: 'generated' })),
      'no_action origin.output_not_instruction',
    )
    assert.equal(
      ruleOf(observe('Please\u2014stop.', { ...live, trustedMentions: ['h-r30'], currentMembers: ['h-r30'] })),
      ruleOf(observe('Please stop.', { ...live, trustedMentions: ['h-r30'], currentMembers: ['h-r30'] })),
    )
    const unasked = { contract: 'legacy_explicit_ask', askSophia: false }
    assert.equal(kindOf(observe('Please\u2014stop.', live, unasked)), kindOf(observe('Please stop.', live, unasked)))
  })

  it('names v25 in the version, and the descriptor states the prefix rule', () => {
    assert.equal(INTAKE_OBSERVATION_POLICY_VERSION, 'sophia.intake-observation.policy.v25')
    assert.match(INTAKE_OBSERVATION_POLICY.text.prefixes, /hyphen, an en dash or an em dash/)
    assert.match(INTAKE_OBSERVATION_POLICY.text.prefixes, /compounds are never commands/)
  })
})
