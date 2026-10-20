# Implementation-session handoff

Goal and attempt: RELIABILITY-HELD-ON-RELOAD (the reliability baseline's gap #8,
`evaluacion-2026-10-19/fiabilidad/linea-base.md` §5, §1.2, §1.7; lote R2), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-9`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-9`, branch `reliability/held-on-reload` from
`origin/group/reliability-r1` (`0b2202a38`, PR #470, open)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API.
Runtime unit: Luis's Windows host (Playwright through the session's `pw.ps1` guard, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-19, «quisiera trabajar en la fiabilidad y resiliencia. Ahí tendríamos que también
medir. Lo que no se mide, no se puede mejorar» and «Arranca R2 en paralelo»; local only, nothing pushed.
Ending commit/tree: `5def9a66d`, the branch's last commit that changes code (the next one adds this record). Against
`0b2202a38`: `fixtures/fixture-api.ts`, `e2e/project-conversation-writes.spec.ts`, `e2e/room-discussion.spec.ts`,
`e2e/app-auth.spec.ts`, `src/app/held-in-tab.ts`, `src/app/held-in-tab.test.ts`, `src/app/App.tsx`,
`src/features/conversations/talk-store.ts`, `src/features/conversations/talk-store.test.ts`, `src/api/useAdmission.ts`,
`src/features/conversation/useRoomMessage.ts`, `docs/plans/reliability-held-on-reload.md`, and this record.

## Outcome

- **A conversation's message with no reply is offered again after a reload.** Its key and words were kept only in the
  page's memory, so a reload forgot it without a word and the next words went under a new key. Now the composer says
  «Not confirmed: “…”. Send sends it again; it won’t be written twice.» after the reload, and Send records it once,
  under the same Idempotency-Key.
- **The room's bar does the same.** «Not confirmed: “…”» with Try again, after a reload (or the chat put away and
  opened again); one contribution, one key.
- **Answered, it is let go.** A reply that lands (recorded, or refused for good) takes it out of the tab; reloaded
  then, nothing is offered.
- **Signing out forgets it**, at once, with the review proposals; so does another account coming in, here or in
  another tab. A page load, still finding out who is in, forgets nothing.
- **No `beforeunload` prompt.** Nothing in the Studio asks one (a grep: only three fixture pages use `pagehide`), the
  browser's prompt can't say which message, and it would meet every sign-out and call ended too. Closing the tab still
  loses a held message; a reload no longer does.

## Evidence

- Plan: `docs/plans/reliability-held-on-reload.md` (`a3368a8eb`), committed before the tests.
- **The baseline against the code:** gap #8 holds, on two surfaces, not one.
  - `held-write.ts` keeps nothing itself: its intent lives in `talk-store.ts`'s module `Map` (per project and account),
    which outlives a trip to another view but not a reload.
  - The room's bar doesn't use `held-write.ts`: it is `useAdmission` (key in a `useRef`, words in state).
  - The baseline's «sin `beforeunload` en el Studio» holds.
  - The Studio's discipline for a write in doubt is `review-proposal.ts` (session storage, per account, let go once
    answered, forgotten at a sign-out but not at a load); the chat's drafts are deliberately not kept
    (`viewer-state.ts:3`). Followed: only the held message is kept, not the draft.
- **Conversations, written first and failing** (`dce355f9f`, log `pw-logs/held-red-1b.txt`; the same three failures on
  its first version `5e16c4f28`, before three lint fixes in the checks, `pw-logs/held-red-1.txt`):
  - «a message with no reply is offered again after a reload…»: after the reload, `Expected substring: "Not confirmed:
    “Did this one land?”"`, received the thread with the message landed (the service kept it) and no line.
  - «a message on its way is kept in the tab until its reply lands…»: `Expected length: 1`, `Received length: 0`.
  - `app-auth`, «a message held with no reply is offered again as the page loads, and Sign out forgets it»: `Expected
    substring: "Not confirmed: “Check the March figures”"`, received the thread with no line.
  - Units: `talk-store.test.ts` `actual: null`, `expected: { c1: { key: 'k1', ask: [Object] } }` and `actual: false`,
    `expected: true`; `held-in-tab.test.ts` fails with `ERR_MODULE_NOT_FOUND` (the module is new).
- **Conversations, fixed** (`e00213d6e`): the three specs pass (`pw-logs/held-green-1.txt`, 7 passed with the grep);
  units pass.
- **Room bar, written first and failing** (`9d3228729`, log `pw-logs/held-red-2.txt`):
  - «a message with no reply is offered again after a reload…»: after the reload, `Expected: visible`, `element(s) not
    found` for `getByText('Not confirmed: “Once only.”')`.
  - «a message on its way is kept in the tab until its reply lands…»: `Expected length: 1`, `Received length: 0`.
- **Room bar, fixed** (`5def9a66d`).
- **Green at `5def9a66d`**, through the guard:
  - `pw-logs/held-green-2.txt`: 125 passed (`room-discussion`, `project-conversation-writes`, `app-auth`,
    `room-chat-replies`, `project-conversations`, `project-conversation-follow-ups`).
  - `pw-logs/held-green-3.txt`: 190 passed (every `conversation-*` and `conversations-*` spec, and
    `reliability/writes`).
  - Every Studio unit test but the two known Windows path cases: 1929/1929.
  - `oxlint --type-aware .` clean, `tsc --noEmit` clean, Prettier clean on every touched file.

## Decisions and changes

- **`app/held-in-tab.ts`**: `sophia.held.v1:` + `[account, part, project]` (JSON) in session storage; `readHeld`,
  `keepHeld`, `heldOnlyOf`, `forgetHeld`. The account is `accountOf` (the token's subject), as the proposals'.
- **Conversations mirror `holds` at every `changeKept`**, so an erasure, a withdrawal or `retired` take a held message
  out of the tab too, and read them back once per place after a load, each as sent with no reply (`sending: false`):
  one on its way when the page went is in doubt the same way. `forgetKept` empties the memory only, because the App
  calls it as every load finds out who is in (`useAccountCache`); the tab is forgotten by the App's own
  `heldOnlyOf(proposalsKeptFor(state))` and by `forgetUnderWay` on Sign out.
- **The room's bar keeps the message before it goes** (in the admission's send, which knows the key) and lets it go
  only if the tab still holds that key. `useAdmission(send, resumed?)` starts `unknown` with a resumed intent.
- **Fixture lever `server=kept`** (`installFixtureApi`): the synthetic service journals each keyed write that reaches
  it in the tab (`fixture.server.journal`) and applies the journal again, unanswered, as the page loads, so a reload
  meets the service as it was. The journal holds each try's key, which is how the checks read «the same key».

## Remaining obligations

- Only messages are kept across a reload. The other held intents in `talk-store.ts` (a new conversation's start, a
  proposal, Still open's decision, an erasure, a withdrawal) and the other `useAdmission` forms (invitations, tasks,
  notes, profile) still live in memory; each is the same pattern, if wanted.
- Closing the tab loses a held message (no prompt, above).
- The measuring suite (`e2e/reliability/writes.spec.ts`, M2) doesn't count «held kept across a reload» yet.

## Next bounded action

- Luis: say when to push (with the R2 batch); then merge on green with no open P1. Nothing is owed locally.
- Source IDs consulted: none from the source register; the work read this repository and the reliability baseline
  only.
