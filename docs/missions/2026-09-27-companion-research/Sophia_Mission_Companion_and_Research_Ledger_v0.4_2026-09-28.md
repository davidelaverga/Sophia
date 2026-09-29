# Sophia mission companion and research — continuation ledger v0.4

**Date:** 28 September 2026  
**Status:** M01 exact prompt/skill amendment packaged; no application or hosted changes performed.  
**Predecessor:** [v0.3](Sophia_Mission_Companion_and_Research_Ledger_v0.3_2026-09-27.md), retained unchanged.

## Requested change

Davide asked for the exact prompt in Mission 1 to avoid implementation-time guessing, and for the actual mission skill in the pack. The amendment supplies complete model-facing text, not another instruction to design that text later.

## What is now fixed

- [System prompt v1.1](prompts/M01_SYSTEM_PROMPT.v1.1.md): complete guide identity, natural conversation, orientation, six existing/planned M01 operation rules, project-note and decision behavior, source/privacy/control boundaries, and truthful capability limits.
- [Mission-lifecycle skill v1.1](skills/mission-lifecycle.v1.1.md): full WANTING, PREDICTING, EXPECTING, EXPLAINING, ESCAPING and ABSTRACTING procedure, with cues, actions, record mapping, transitions, limits and examples.
- [Combined instruction](prompts/M01_SYSTEM_INSTRUCTION.v1.1.txt): exact core bytes + one LF + exact skill bytes. The complete literal is embedded in M01 section 8; the manifest/validator check equality.
- [Loading contract](shared/M01_PROMPT_LOADING.md): production content home, real function binding, dynamic context outside the static prompt, reconnect/rebuild rules, no legacy prompt duplication, and content-safe evidence.
- M01 launch prompts and G3 now direct verbatim loading. M01-T19–T22 add actual setup-payload, failure, reconnect and capability-conformance obligations.

## Decisions and boundaries

| ID | Decision | Status |
|---|---|---|
| D25 | Ship the exact system prompt and complete adapted skill inside M01. | User-requested content amendment; exact authored baseline supplied. |
| D26 | Keep separate canonical core and skill files and one generated combined instruction, with hash/equality checks. | Concrete implementation requirement for this revision. |
| D27 | Fix M01's six model-facing operation names; internal bindings can follow actual code conventions. | Concrete implementation requirement; no tool registration is claimed. |
| D28 | Keep changing project data in authenticated context/tool results, not interpolated into the static policy. | Concrete loading clarification within the existing context/authority design. |
| D29 | Preserve original v1 candidate files as history and exclude them from active M01 assembly. | Packaging/versioning decision; no live release identity was changed. |

This amendment does not implement research early, claim a project lead exists, introduce another memory provider, enable ambient recording, change note-consent policy, or change the R00/M01/M02/M03 sequence. M02/M03 mission specifications and their launch prompts remain byte-identical to pack v1.0.

## Source basis and adaptation

The revision uses the actual v1.0 M01 specification and its candidate prompt/skill, the preserved first/second-pass ledgers, and the user's original `goal_lifecycle(2).md` read in full. It retains that skill's Origin/Destination/Difference/Instruments/Purpose framing and six non-linear modes. Previously specified team adaptations remain: preserve original predictions, distinguish disagreement from acceptance, use canonical records rather than independent goal-file writes, avoid numeric emotional bands, and treat explanations as hypotheses unless supported.

The newly attached older architecture/maps/specs remain historical material, not authority to restore their old runtime or storage stack. No current repository/provider facts were refreshed in this content-only pass.

## Resume implementation

Use the revised [M01 Claude](launch/M01_CLAUDE.md) and [M01 Codex](launch/M01_CODEX.md) launch files. At G1 verify the actual integrated foundation as already required. At G3 load and test the exact assets. Do not restart completed work or treat this amendment as a new permission, allowance, deployment or approval.

The package checks prove file presence, local links, hashes and literal equality. They do not prove conversational quality, actual Gemini setup, tool effects, consent enforcement or deployed behavior. Those remain the named M01 acceptance cases.
