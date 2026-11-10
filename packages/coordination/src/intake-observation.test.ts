import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  INTAKE_OBSERVATION_POLICY_VERSION,
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
