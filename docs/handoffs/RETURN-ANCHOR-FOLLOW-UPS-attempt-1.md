# Implementation-session handoff

Goal and attempt: RETURN-ANCHOR-FOLLOW-UPS (two Codex P2s on #404, from the follow-up list; Luis: «Sigue con los P2 en local, sin subir
nada»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-docs`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-docs`, branch `auth/return-anchor-follow-ups` from `origin/main` (`215166872`)
Writable scope: this worktree only (`apps/studio/src/app`, `docs/plans`, `docs/handoffs`); no API.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-17, «Sigue con los P2 en local, sin subir nada»: local only until he says; merges on
green with no open P1 once pushed.
Ending commit/tree: `b77dff623252` (tree `035568d4b404`), the last commit of `auth/return-anchor-follow-ups`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 4 files changed against
`origin/main` at that commit: `src/app/auth.ts`, `src/app/return-anchor.test.ts`, `src/app/return-anchor.ts`, `docs/plans/anchor-through-sign-in.md`. The review notes below name the commit of each later change.

## Outcome

- A return that didn't sign in (`otp_expired` from an older link, a provider's refusal, a `?code=` whose session didn't follow) puts the kept place back on the clean address and leaves it kept. A retry from that tab keeps it afresh; a code typed or a passkey opens at it; a newer link opened in another tab still takes it once.
- A signed-in return still takes the place once; an invitation (`tokens`) or no callback touches nothing.
- The bound on an anchor's body is 7203 characters, the longest the link helpers make from ids the contract allows (request resource ≤ 160 and request ≤ 200 code points, each encoded twice), instead of 200.

## Evidence

- `node --test src/app/return-anchor.test.ts`: 11/11 (7 new). On main the new file fails at import (`anchorAfter` is missing), and the 203-character body is dropped.
- Control mutant: the bound written as a template-string RegExp (where `\s` becomes `s`) fails the new letters test; the literal passes.
- Playwright through `safe-run.ps1`, two workers: app-auth, signin, signed-in-later and join specs, 57/57.
- Prettier, `oxlint --type-aware` and `tsc --noEmit -p apps/studio` clean on the changed files.

## Decisions and changes

- Read, not take, on a failed return: the refuter's case (two links asked for, the older opened first in another tab) works on main and keeps working; the take stays for a signed-in return.
- `takeReturnAnchor()` becomes `returnAnchorAfter(kind, signedIn)`; `auth.ts` `addressAfter` calls it for every callback kind and the rule lives in the pure `anchorAfter`.
- A regex literal with the number explained in its comment, not a built RegExp: the first draft's template string silently turned `[^\s#&=]` into `[^s#&=]`.

## Remaining obligations

- The return itself still needs a real Auth service; the fixture pages don't exercise a callback, as the plan already says.

## Next bounded action

- Luis: say when to push; then merge on green with no open P1.
- Source IDs consulted: none from the source register; the work read this repository only.
