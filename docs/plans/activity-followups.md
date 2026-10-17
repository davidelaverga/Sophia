# Project activity: right names, no false acts, a bounded page

> 2026-10-16 · Codex's P2s on #355 (`evaluacion-2026-10-13/follow-ups-p2.md`), all on the project's activity (A28).
> Stacked on #369 (0060/A31), because they touch #355's code before it reaches `main`. Migration 0061.

## What changes

- **0061 `project_activity`** (the same signature, replaced):
  - **Nobody is their own target.** Joining and leaving carry the member who acted as their entity. The act's target
    is now a member other than its actor, so «Lucía · Member left · Lucía» reads «Lucía · Member left».
  - **A guest is named.** A knock's actor has no `room_names` row, so the activity read «A member». The actor's name
    now falls back to the name the guest gave at the door (`room_lobby.display_name`).
  - **A decision on a guest names them as its target.** Letting in, declining, blocking: «Marco · Guest let in · Ana».
  - A helper, `sophia.activity_name(uuid, uuid, text, uuid)`, gives the names. It is also the readiness predicate
    (`REQUIRED_SCHEMA`), with a «without 0061» step in `readiness.db.test.ts`.
- **`before` stays inside a bigint.** The route refuses with 422 anything above 9223372036854775807. That includes
  a 19-digit value that used to overflow into a 503. A28's pattern now says the same, at most 19 digits, and the route
  checks the value.
- **A host act is recorded only when it happened.**
  - Muting someone with no microphone, or stopping a camera or a screen that isn't on, answers 204 and records
    nothing.
  - «Mute everyone» with no one to mute records nothing either.
  - `recordedIfDone` holds the rule: the act's own result decides whether evidence is written.

- **A long name stays in its row.** An account name may be an email of up to 320 characters with no break. The name's
  track is capped at 40 % of the row and wraps anywhere, so the act and its time stay inside the sheet on a phone.

Not here: making a host act's evidence survive a database failure after LiveKit acted (the first P2). That needs an
intent written before the call and reconciled after, which is a design of its own, so it stays on the list.

## Checks

- **`api.db.test.ts`:** an editor who leaves is listed with no target, and `before=9999999999999999999` answers 422.
- **`access.db.test.ts`:**
  - a guest's knock is listed under the name they gave;
  - the editor's «let in» is listed with the guest as its target.
- **`readiness.db.test.ts`:** not ready without 0061.
- **`project-activity.spec.ts`:** at 390 px, a 120-character unbroken name wraps, and the time stays in the row.
- **`host-acts.test.ts`:** an act that did nothing records nothing, and one that did records once.
