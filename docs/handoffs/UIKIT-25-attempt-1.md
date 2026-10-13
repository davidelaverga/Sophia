# Implementation-session handoff

Goal and attempt: UIKIT-25 (what opens, said at the door: one line under «Sign in to Sophia»; informe-ui-premium §4,
first step of the onboarding), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-kit`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-kit`, branch `ui/sign-in-lede` from `ui/view-titles` at
`fb51d281` (stacked on PR #246 → #245 → … → #220; the base retargets as each merges)
Writable scope: `apps/studio/src/app/SignIn.tsx`, `apps/studio/src/app/auth-words.ts` (+ its test),
`apps/studio/src/features/light/SophiaLight.tsx` (the screen's rest after the fonts), `apps/studio/e2e/signin-lede.spec.ts`,
`docs/plans/sign-in-lede.md`, and this handoff.
Runtime unit: the Studio (`apps/studio`) on its fixture pages; no API, database, worker or deployment touched.
Existing authority: Luis's instructions in this session («Procede», quoted in the plan); merge on green CI with no Codex
P1, through Luis's merge loop; no deploy, no production data, no comment on Davide's PRs.
Ending commit/tree: `f48eb0475dca` (tree `252f84b07fa5`), the last commit of `ui/sign-in-lede`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 7 files changed against
`ui/view-titles` at that commit: `e2e/signin-lede.spec.ts`, `src/app/SignIn.tsx`, `src/app/auth-words.test.ts`, `src/app/auth-words.ts`, `src/features/light/SophiaLight.tsx`, `docs/handoffs/UIKIT-25-attempt-1.md`, `docs/plans/sign-in-lede.md`. The review notes below name the commit of each later change.

## Outcome

- Under «Sign in to Sophia», before the providers: «Where your team and Sophia think together.» (round 3's sentence,
  shortened from «A room where…» to hold one line at 320 px), a `p` of the
  body (14 px on 20, the second ink), in the guest door's voice. Only on the sign-in step; «Check your email» and the
  offer keep their words.
- `signin-lede.spec.ts`: the line right under the heading, 14/20, inside the column, no horizontal overflow, at 1440
  and on a phone; the same ink as «New here? …»; gone once the link is sent; the column keeps three text sizes.
- Not in this PR: the room's idle line (it already says «Sophia joins when asked.» when nothing works in the
  background; the demo covers it with the work's note), Home's first-run steps (§4.2, a design decision for Luis).
- Unverified here: the Playwright run (the local guard); CI is the run on record.

## Evidence

- `pnpm format`, `pnpm lint` (type-aware), `pnpm --filter @sophia/studio typecheck`: clean.
- Measured in the page (the pane at 1440×900, `signin.html`): the line `14px/20px`, colour `rgba(236,235,241,0.66)`
  equal to the muted line's; 14 px under the heading (heading bottom 563, line top 577); 328 px wide in a 416 px
  column; the column ends at 689 of 900; the body's sizes 26 · 14 · 13. On a phone (375×812): `14px/20px`, one line, 328 px in a 343 px column, the rest high, the column ends at 429 of 812, no horizontal overflow.
  These widths were measured on the superseded «A room where…» sentence; the delivered one holds one line at 320 px
  (281 of 288 px, round 3), and signin-lede.spec reads it at 1280, 375 and 320. (Record corrected after merge: Codex on
  #247.)

## Decisions and changes

- The door's sentence, not a slogan: Join says «“Project” is a room where people and Sophia think together.»; the
  sign-in, before any project, says the same of Sophia with «your team».
- A body paragraph and not a lede size: the quiet screen speaks in three sizes (title, text, label) and a fourth
  would be the first exception.

## Remaining obligations

- Watch CI; the independent review (Codex) with no P1/P2 before merge. The base is `ui/view-titles` until #246 merges.

## Next bounded action

Informe-ui-premium §6: the light's trace in the project views and the composed empty states (§3 movements 1 and 3)
need Luis's eye on a calibration before code; prepare the comparison, not the PR.

## Post-review (Codex on #247)

Fixed in `72d8c8bf`: the sentence is owned by `auth-words.ts` (`SIGN_IN_LEDE`, the sign-in's words module) with a node test
beside the module's others; `SignIn` only renders it, as CONTRIBUTING's Copy rule asks. `signin-lede.spec` keeps its own
literal, so a change of words is caught twice. Format, lint, typecheck, `auth-words.test.ts`: clean.

## Post-review, round 2 (Codex on #247)

- `8fa956b8` (not recorded before): her attention is aimed again when `document.fonts.ready` resolves and when the body
  is resized (a `ResizeObserver`), so a late font that reflows the lede never leaves her looking where the field was.
- Now: the font's callback measures only a field still connected, with a cleanup flag (an email sent while the font
  loads aims nothing); the screen's rest is decided afresh when the fonts arrive (`useScreenRest`), so a rest lifted
  only by the fallback's extra line comes down.
- The plan's «nothing moves» was wrong and is corrected: the title and the light stay, the controls move one line and
  the gap (34 px) lower.
- `signin-lede.spec` (+3, and one line asserted at both widths): the 48 px between the title and the providers with the
  title unmoved; the late font, held by the test and released after the lede reflows, with her attention on the
  field; at the boundary height, the rest lifted by the fallback and back down when the font arrives.

## Post-review, round 3 (Codex on #247)

- The sentence shortened to «Where your team and Sophia think together.» so it holds one line at 320 px (281 of 288
  px); `auth-words.ts` owns it, its node test and signin-lede.spec (now at 1280, 375 and 320) read it.
