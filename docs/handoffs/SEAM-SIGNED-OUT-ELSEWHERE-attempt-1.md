# Implementation-session handoff

Goal and attempt: SEAM-SIGNED-OUT-ELSEWHERE (costuras.md seam #2, 2026-10-18; Luis: «¿cómo vamos con las mejoras de seam?»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-fix2-work`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-fix2-work`, branch `seams/signed-out-elsewhere` from `origin/main` (`7281bdc2b`)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-18, «¿cómo vamos con las mejoras de seam?»; local only, nothing pushed; merges on green
with no open P1 once pushed.
Ending commit/tree: `23eca0f0f0fb` (tree `bdb3f5475d87`), the last commit of `seams/signed-out-elsewhere`'s own that
changes code (the next touches only this record). 14 files changed against `origin/main` at that commit:
`e2e/app-auth.spec.ts`, `src/app/App.tsx`, `src/app/SignIn.tsx`, `src/app/auth.ts`, `src/app/ended-notice.ts`,
`src/app/ended-notice.test.ts`, `src/app/kept-session.ts`, `src/app/kept-session.test.ts`, `src/app/signed-in-load.ts`,
`src/features/personal/draft.ts`, `src/features/personal/draft.test.ts`, `src/features/studio/viewer-state.ts`,
`src/features/studio/viewer-drafts.test.ts`, `docs/plans/signed-out-elsewhere.md`.

## Outcome

- Signed out by a cause this tab did not start, the sign-in says why in the first visit's lede's place, as a polite
  status that never takes the focus from the email field and never names the account:
  - another tab's sign-out, or a refresh the Auth service refused: «You were signed out in another tab or on another
    device, so this tab signed out too.»
  - as the page loads, a kept session the Auth service no longer knows: «Your sign-in on this device ended while you
    were away.»
  - either adds «Unsent words here were cleared.» only when this tab's clearing removed some.
- Once: a reload says nothing, signing in ends it, and this tab's own Sign out never says it. The other notices (a
  link's, sign out everywhere reaching only this device, an unlock's) keep their alert.

## Evidence

- Plan: `docs/plans/signed-out-elsewhere.md` (committed before the tests, `07d180059`).
- **Written first and failing** (`bde18694c`):
  - unit: `ended-notice.test.ts` and `kept-session.test.ts` fail on the missing modules (`ERR_MODULE_NOT_FOUND`); the
    new cases in `draft.test.ts` and `viewer-drafts.test.ts` fail on `actual: undefined, expected: true` (the clearing
    said nothing); 5 of 25 failing;
  - e2e `app-auth.spec.ts --grep seam`, through the guard: 2 failed, 1 passed (the control). Both on
    `expect(locator).toHaveText(expected) failed … element(s) not found`, expecting «You were signed out in another tab
    or on another device, so this tab signed out too.» and «Your sign-in on this device ended while you were away.
    Unsent words here were cleared.»; in the load case the sign-in did appear, so the new lever reached it.
- **After the change** (`23eca0f0f`):
  - unit: the four touched files 35/35, with `sign-out.test.ts` (which forgets drafts) 43/43; the whole Studio suite 1737/1739, the two failures the known Windows ones
    (`attention.test.ts`, `browser-imports.test.ts`);
  - e2e through the guard, two workers: `app-auth`, `signed-in-later`, `signin`, `signin-lede`, `signin-hierarchy`,
    `join`, `account-settings`, `account-menu`: 90/90;
  - whole-repo `oxlint --type-aware`, `tsc --noEmit -p apps/studio` and Prettier on every touched file: clean.
- **Captures** (a scratch spec, not committed), 1280 and a 390 px phone, dark and light: the line wraps to two lines in
  the lede's place with no horizontal overflow; on the phone the light sits behind the words as it does behind the
  lede on a first visit. In the session's scratchpad, `seam2/`.

## Decisions and changes

- **No sessionStorage record.** The line belongs to the state the sign-out left: it is decided when the tab hears the
  sign-out, or, as the page loads, from a session the page found and the client's check removed. A reload has neither,
  so it has nothing to repeat (the e2e checks it); a stored flag would be a second record of the same fact.
- **The line replaces the lede** rather than adding a paragraph under it («prefer replacing a line»): the lede is what
  made the screen read as a first visit. While the clause is still being decided, the place stays empty for that
  render instead of flashing the lede.
- **Own sign-out:** `useAuth`'s `leave` marks itself under way; the listener reads the mark as the word comes, not
  when React applies the change. A guest's session ending, the page still loading or a link's offer are no account
  signed out, so they say nothing.
- **The load case** reads the kept session before the client starts and again after its check: gone means the Auth
  service refused it (supabase-js 2.117.1 removes it only then); still kept means a refresh that failed on the network,
  which ended nothing and says nothing.
- **The clause follows the clearing's own answer:** `draftsOnlyOf` and `forgetViewerDrafts` now return whether they
  removed unsent words; what they clear is unchanged. `kept-session.ts` takes the kept-session read out of
  `signed-in-load.ts` unchanged, so `auth.ts` reads it without an import cycle through `SignedIn.tsx`.

## Remaining obligations

- Another tab's Sign out forgets the device's drafts before this tab hears it, so the clause is then usually absent,
  though words written in this tab went too; a project conversation's unsent words (`talk-store.ts`, in memory) are not
  counted. It errs towards silence.
- An open tab hearing a refused refresh (every device signed out elsewhere) shares the listener with another tab's
  word; no e2e drives it, since supabase-js's refresh ticks run every 30 s. The unit covers the decision.
- The join page (`/join`) has its own sign-in and says nothing new.

## Next bounded action

- Luis: say when to push; then merge on green with no open P1.
- Source IDs consulted: none from the source register; the work read this repository and
  `evaluacion-2026-10-18/experiencia/costuras.md` only.
