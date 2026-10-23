# Implementation-session handoff

Goal and attempt: ARCHIVE-KEY-BY-SUBJECT (Codex P2 on #473, `apps/studio/src/features/studio/Archive.tsx:30`, the last
entry of `evaluacion-2026-10-16/seguimientos-p2.md`; Luis 2026-10-20: «Procede con el próximo lote y arregla tú los de
Davide», earlier «Lo que no se mide, no se puede mejorar»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-4`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-4`, branch `archive/key-by-subject` from
`origin/group/follow-ups-7` `5d4277fb1` (PR #473, open)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API, no contract.
Runtime unit: Luis's Windows host (Playwright through the session's guard `pw.ps1`, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-20, as quoted; local only, nothing pushed.
Ending commit: `4175a7356` (the fix); the next one adds only this record. Files changed against `5d4277fb1`:
`src/features/studio/Archive.tsx`, `src/features/studio/archive-keys.ts`, `src/features/studio/archive-keys.test.ts`,
`e2e/app-auth.spec.ts`, `docs/plans/archive-keys-and-work.md`, and this record.

## Outcome

- The page's archive keys are kept by the account, its token's subject (`accountOf`), not by its address. They
  outlive a change of account in the tab, and two accounts can share an address. Before, the next account at the same
  address could press Unarchive and send the last account's unanswered key as its own.
- Nothing new is drawn. The same-key retry and the #471 rule (an answered read lets go of an unanswered key) work as
  before, per account.

## Evidence

- **Codex's case, checked in the code. It holds, but its consequence isn't reachable.** `Archive.tsx` handed the store
  `identity.name` in `reading` and in each choice. So B's read (same address, another subject) does let go of A's
  unanswered key. But A never retries under it: coming back, A gets a cache of its own (`cacheFor`), and its archived
  list is read afresh before any Archive or Unarchive is offered. That read lets go of the key under the #471 rule
  anyway. What the shared string does show is the other way round: A's write still on its way when the tab moves to
  B, B's read before A's reply is lost, then B's Unarchive on the same project gets A's key from `keyFor`. The browser
  check is built on that.
- Plan first: `docs/plans/archive-keys-and-work.md`, section «Keys by the account, not the address» (`64939e7ac`). Its
  stale Limits bullet («a retry after signing out and back in is the same write», untrue since #471) now says the
  read after signing in lets go of the key.
- Written first and failing (`12cddf98f`): `app-auth.spec.ts` «browser-account · another account at the same address
  sends its own Unarchive key… (Codex on #473)». The real App, with the API answered by the check's routes: Davide's
  Unarchive held, `SAME_ADDRESS` comes in from another tab, its list is read, then Davide's reply is lost and
  `SAME_ADDRESS` presses Unarchive. Run through `pw.ps1` at the commit with `-Grep "Codex on #473"`: 1 failed on the
  last assertion (line 809), `expect(received).not.toBe(expected)`, `Expected: not "773ff2b0-…-9eaf58d48e2f"`. The
  assertion before it, that the two POSTs went as Davide and then as `SAME_ADDRESS`, passed. Log
  `p4-subject-red.txt`.
- Fixed (`4175a7356`): `Archive.tsx` hands `accountOf(identity)` to `reading` and to each choice.
  - `app-auth`, `archive-project` and `project-leave` through `pw.ps1`: 71/71, log `p4-subject-green.txt`;
  - the new check, `-Repeat 8`: 8/8, log `p4-subject-repeat.txt`;
  - unit: `archive-keys.test.ts` 10/10, one new. The Studio suite passes 2019/2021. The two failures are the known
    Windows ones (`attention.test.ts`, `browser-imports.test.ts`).
- `tsc --noEmit -p apps/studio`, Prettier on every touched non-docs file, and whole-repo `oxlint --type-aware` are
  clean.

## Decisions and changes

- **The fix is at the call site, and the store is unchanged.** `archive-keys.ts` never read the address itself. Its
  `account` is whatever string names a person, and `at()` keeps it whole. `Archive.tsx` was the only place that chose
  the email. `ArchiveChoice.account` now says it is `accountOf`.
- **`archivedKey` stays under `identity.name`, and so does the invalidation after a write.** They live in the account's
  own query cache, which `App` already keys by subject, as every `['projects', name]` read does. `useProjectFeed.ts`
  invalidates `['projects', identity, 'archived']` the same way. Under an email change (same subject), the address in
  the key means the list is read again, and that read lets go of the key as any read does.
- **The unit came with the fix, not before it.** It pins the store's side with the accounts as `accountOf` gives them:
  B's read keeps A's key, B's choice gets its own, and A under a new address keeps it. It passes before the change too,
  since the store was never wrong. The bug was in the `.tsx` hook, which the node test runner can't import, so the
  browser check is the red on record, as in ARCHIVE-KEY-EXTERNAL-REVERSAL.
- **No fixture change.** The check routes `/api/v1/projects`, `/api/v1/projects/archived` and the archive POST in the
  test, as the other browser-account checks route the list, and reads the subject from each request's token.

## Remaining obligations

- None new. The earlier limits of `archive-keys-and-work.md` stand: a reply lost with no read before the next press
  still sends the old key, a reload starts afresh, and the menu doesn't say why Archive is missing while the list can't
  be read.
- No independent review was run on this branch.

## Next bounded action

- Luis: say when to push; it can join the next batch PR or go onto #473. Then merge on green with no open P1.
- Source IDs consulted: none from the source register; the work read this repository and the follow-up list.
