# Handoff: the terms and the privacy notice give an address to write to

Goal and attempt: LEGAL-CONTACT (a contact address in the terms and the privacy notice; Codex P2 on #366), attempt 1
Human owner / executor resource: Luis (merge, the address) / Claude Code session in worktree `Sophia-e2e`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-e2e`, branch `legal/contact-sophia` from `origin/main` (`9b984ea0`)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no deploy.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-16, «Usamos uno de Sophia»: a Sophia address, not a personal one; merges on green with no open P1.
Ending commit/tree: `5950532bc70c` (tree `13ebafc03a2e`), the last commit of `legal/contact-sophia`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 4 files changed against
`origin/main` at that commit: `e2e/terms-privacy.spec.ts`, `src/app/Legal.tsx`, `src/app/legal-text.ts`, `docs/plans/legal-contact.md`. The review notes below name the commit of each later change.

## Outcome

- **`legal-text.ts`:** `CONTACT_EMAIL`. The Contact paragraph of both documents names it first («deleting your
  account» included), then Send feedback where it's offered. `UPDATED` is now 16 October 2026.
- **`Legal.tsx`:** `Words` shows the address inside a line as a `mailto:` link; every other word stays text.

## Evidence

- Plan: `docs/plans/legal-contact.md`.
- Written first and failing (commit `32ee7b99`): the date and the two Contact specs in `terms-privacy.spec.ts`.
- **After the change, locally:**
  - terms-privacy specs: 6/6;
  - `legal.test.ts`: 2/2;
  - type-aware lint, typecheck and Prettier are clean;
  - the capture of /privacy shows the address as a link under Contact.

## Remaining obligations

- **Luis:** make sure hello@sophia-ei.com receives mail. The domain's root mail is Microsoft 365, and Resend only
  sends from it.

## After the refresh (2026-10-22, for 23 October 2026)

Luis's open question, «what contact channel works without a session», answered with the coordinator's
recommendation: `hello@sophia-ei.com`, the address Sophia's emails already come from, as this branch already did.
Done in worktree `D:\Descargas\SophiaV4\Sophia-paper-6` on the same branch, not pushed; the plan's «Refresh» says
what and why.

- **Merged `origin/main`** at `86eef1c21` (#478) in `c58220c79`, no conflicts, no rebase: main's current Legal page and
  text kept, the contact change on top. The original written-first commit `32ee7b99` stays in history.
- **Written first** `fe1d915f4`: both documents' date to 23 October 2026. Red (`pw-logs/legal-contact-red`):
  «Expected substring: "Last updated 23 October 2026"», received «Last updated 16 October 2026», terms and privacy;
  the two Contact specs passed. Fixed `be44edbf9`: `UPDATED = '23 October 2026'`, the day this is meant to land.
- **Green at `be44edbf9`** (guarded `pw.ps1`): terms-privacy and app-auth (the signed-out pages) 62/62
  (`legal-contact-green`). `legal.test.ts` 2/2. Whole-repo `oxlint --type-aware`, `tsc --noEmit -p apps/studio`,
  Prettier on the three touched code files: clean.
- **Searched the Studio:** Send feedback appears only signed in, behind a DSN (account menu, Settings › Help);
  «reply to any email» appears nowhere; the sign-in, the code step and «Sophia couldn’t finish opening» name no
  channel. `hello@sophia-ei.com` is in `legal-text.ts` alone (and the spec); no personal address appears in the repo.

Remaining: Luis confirms hello@sophia-ei.com receives mail (the repo doesn't record the sender address; that it is
the one Sophia's emails come from is the coordinator's word and this record's earlier note); if the PR lands after
23 October 2026, `UPDATED` and the spec move to that day. Then the coordinator updates #374; merge on green with no
open P1.
