# Personal held inputs — a Personal message retained without effects (INC03-CC-002 P1)

Source foundation for INC03-S01's Personal side (pack v2 `modules/INC-03_NATURAL_COMPOSER_AND_CONTINUITY.md`
INC03-R01/R04/R06, `contracts/03_INTAKE_ALLOCATION_AND_EVENTS.md` C03-R01/R02, read at docs commit `c43701ab`). It is
**not** a Personal intake, an answer, an assessment, an HTTP surface or a composer change. Nothing calls it from a
request: no route, contract, generated type, package export or Studio file changes.

Lease (root-assigned): migration `0098` and seven new files: this plan, the handoff `docs/handoffs/INC03-CC-002-PERSONAL.md`,
`db/migrations/0098_personal_inputs.sql`, `db/tests/0098_personal_inputs.sql`,
`packages/persistence/src/personal-inputs.ts`, `personal-inputs.db.test.ts` and `personal-legacy.db.test.ts`. No existing
file is edited. Base: S01b DEV `37b1f47d`, itself on an unaccepted prefix (native repair4 `a528ab84`, API `409d4f75`).

## What exists (read at `37b1f47d`)

- **Write.** `POST /api/v1/personal/turns` → `send_personal_turn(key, text)` (0021). It takes `personal_hold`, reads
  `personal_prior` from the owner's one `personal_requests` namespace, then `personal_touch` and
  `personal_append('person', body, NULL)`, which sets `reply='pending'`. The route fences the write to the epoch the
  client read (`x-sophia-personal-epoch` → `personal_fence`) in the same `withActor` transaction, then wakes the
  companion after the commit.
- **Schema.** Every person turn must have a reply state and an `asked_at`. The companion takes only `pending`:
  `next_personal_reply`, `claim_personal_reply` and the reservation and settlement (0078–0080) check for it. A
  two-minute-old `pending` reads as `failed`, and `retry_personal_turn` puts it back to `pending`.
- **Erasure.** It increments the epoch, deletes the turns, suggestions and notes, and turns every request into a
  tombstone (`{"redacted":true}`): an older key is refused with 40001.
- **Reads.** `TURNS` (space read, poll, export) lists every turn with `personal_reply_state(reply, …)`. `HISTORY` (what
  the companion is given) lists every earlier turn's words. Needs read Sophia's turns only.

## The new boundary (0098)

| Piece | What it is |
|---|---|
| `personal_turns` reply CHECK | Widened by one value, `recorded`: kept, not asked. 0021's bytes are unchanged; no function is replaced. |
| `sophia.personal_inputs` | One metadata row per held input: owner, id, turn, key, `automatic_v1`, version 1, origin `text`, audience `personal_owner`, addressing basis `personal_default`, state `recorded`. No words, no digest. `UNIQUE(owner,turn)`, `UNIQUE(owner,key)`, FK `(owner_id,turn_id)` → `personal_turns(owner_id,id) ON DELETE CASCADE`. Owner-only RLS; SELECT to `sophia_api`; no write grant. |
| `personal_append_recorded(body)` | Internal (no grant): the next seq, a person turn with reply `recorded`. Never `personal_append`. |
| `send_personal_input(key, contract, epoch, text)` | The only writer; EXECUTE to `sophia_api`. Steps below. |

Writer order:

1. The owner is the actor (`personal_owner`).
2. `personal_fence(epoch)` locks the space and refuses another epoch (40001) in the same transaction, before the key is
   read.
3. The contract must be exactly `automatic_v1` (NULL or anything else: 22023).
4. The text is trimmed and bounded as in the legacy path (22023).
5. `personal_prior` runs under operation `send_input` with semantic `{text digest, interactionContract,
   contractVersion}`. The same key and words return the original receipt. Other words, or the key of a legacy send in
   either direction, are 23505.
6. `personal_touch`, then the recorded turn, then the input row, then the receipt.

**Receipt:** `{operation:'send_input', revision, turnId, seq, inputId, interactionContract, contractVersion:1,
input:'recorded', effect:'none'}`.

**Timestamp:** `asked_at` on a recorded turn is when it was retained. It exists because 0021 requires it; it is not an
ask, model or admission time.

**Typed caller:** `sendPersonalInput(c, key, {contract, epoch, text})` checks the contract and epoch before SQL;
`readPersonalInputs(c)` returns the caller's metadata. The module is not exported from the package index.

**No effect:** no claim, companion call, reservation, outbox, notification, model, native or resource call.

## Integration (before any exposure or production row)

A recorded turn is **not** hidden. Characterized on a fixture row (`personal-inputs.db.test.ts`):

- **Space read, poll and export** list it as a person turn with reply `recorded`. A10's `PersonalTurn.reply` lists
  `pending|answered|failed|null` only, and the persistence `TurnRow` type does too. The Studio has no rendering for it.
- **Companion history**: when a later legacy turn is answered, its context includes the recorded words as an ordinary
  person turn. Nothing here keeps a held input out of a model's context.
- **Needs** are unchanged.

Before an HTTP producer or any production row, these need their owners' decisions, under a root lease:
- an A10 follow-up and its regeneration (single generator writer), plus the persistence read type;
- the Studio rendering;
- whether and how held words enter the companion's context (`HISTORY`), which is a context correction, not part of
  this slice;
- the CONTRIBUTING rule "never store a message nobody will answer". A held input is kept unanswered by design; that is
  a new decision for the owners.

Turning a recorded input into `pending`, or filtering it out of reads to fit the old schema, is explicitly not done.

## P2 (amendment A52, migration 0099; INC03-CC-002 P2)

The "Integration" section above records the state at P1. P2 settles it under the root's decisions:

- **Contract.** A52 adds `recorded` to A10's `PersonalTurn.reply` (one schema, reached by every embedding read:
  `PersonalSpace`, `PersonalTurnPage`, `PersonalEarlierTurns`, `PersonalExport`). It also adds the closed
  `PersonalInputSend {interactionContract: automatic_v1, text}`, `PersonalInputRef` and `PersonalInputRecorded`, and
  `POST /api/v1/personal/inputs` with `Idempotency-Key` and `x-sophia-personal-epoch`. `PersonalReceipt` and the
  legacy `/turns` are unchanged. Regenerated by the one generator writer; no A51 on this base.
- **Route** (`apps/api/src/routes/personal-inputs.ts`). It is mounted only when `AppDeps.personalInputs` is true, and
  `server.ts` never sets it. With it off, the path is 404 and nothing is written. Turned off again, the kept turns stay
  readable.
  - The owner is the verified actor. The route calls 0098's writer, then reads the exact turn through the owner's own
    input row, in the same transaction.
  - The receipt is `{revision, turn, input: {id, contract, version 1, state recorded, effect none}}`.
  - There is no companion dependency, wake, claim, reservation, outbox, notification or work.
  - A database without 0098's writer or 0099's rule answers `projection_unavailable` (503).
- **Held words are not context** (conservative policy, until a separate admission by input id; none exists):
  - `HISTORY` (a legacy answer's context) and the welcome's context leave held person turns out before their limit,
    so held turns use none of the depth.
  - `WELCOME_DUE` (TypeScript) and SQL `personal_welcome_due()` (0099, used under the space lock by both
    `begin_personal_greeting` and `record_personal_greeting`) choose the last activity among the other turns. A held
    turn neither makes a welcome due nor stops one, and an empty or held-only space has none.
  - 0099 replaces only that function, with the same signature, security, search path, owner and grants. 0021 and 0098
    are not edited.
  - The Studio's `welcomeDue` follows the same rule.
- **Visible to the owner:** every Personal read, poll and export lists the turn, and the Studio shows the person's own
  words with "Kept — not asked yet" in the quiet status line. There is no spinner, Ask again, arrival or answer of hers.
- **Metadata read:** `readPersonalInputs(c, {before, limit})` returns owner-only pages, newest first, by the turn's
  `seq`. The seq is unique per owner, so equal timestamps are still read once each. The limit is 1 to 100. The
  projection is closed and typed (`isPersonalInputRecord`) and carries no words. Index exports: `recordPersonalInput`,
  `readPersonalInputs` and their types.
- **Not done:** no composer or producer, no activation, no readiness (`/ready`) requirement for the flag, and no
  admission. The fixture `personal-recorded` sets `SpeechRecognition` to undefined, as `fixtures/app.tsx` does: the
  headless shell has none, and asked, it ends the renderer.

## P2 r1 (PERS-P2-F01): causal races end, whatever fails

The causal-race tests in `personal-inputs.db.test.ts` and `personal.db.test.ts` each hold a Personal transaction open
on a release gate and observe the competing backend wait on its lock. Before r1, the gate was released only after the
observation succeeded. An observer that timed out or failed, or a setup step that failed before it, left the
transaction holding the space: the competitor waited, `after()` could not end its pool, and the run hung until killed.

Each race now runs in a test-local `race()`:
- every gate is opened in `finally`, and every operation is drained within a bound, whatever failed;
- every wait is an asserted bound (`within`): announcements, observations, commits and the drain;
- an announcement fails at once with an assertion naming it when its transaction ends without making it
  (`announced`);
- a failed observation query is an assertion naming the observation (`observed`);
- the body's own failure is the one reported.

`after()` ends its pools within the bound, then drops the database. If a pool cannot end, the database is dropped all
the same and the run fails saying so. A pool with a client never released does not end even once its backend is gone,
so `after()` does not wait for it.

The real named-lock and backend observation stays, with no sleeps and no global timeout. The same rule covers the two
older races in `personal.db.test.ts`: a retry racing its first attempt, and a claim waiting on a retry. Production
code, contracts, the UI and every other file are unchanged.

## Order

This slice comes after the saved-conversation S01 (0095, S01b). Next come trusted context claims (S01c), assessment and
admission (S02), funded Answer/Explore (S03), the composer (PR501 owners) and founder acceptance. Each later
assessment is its own record keyed by the input id; an input row stays `recorded`.

## Not proven here

Any HTTP or UI behaviour, A10 compatibility, exclusion from model context, an answer after admission (AC-03-03),
privacy across derived surfaces (AC-03-11), and app acceptance. No full `pnpm check` runs on this DEV foundation; the
root requires one on the later coherent publication candidate.
