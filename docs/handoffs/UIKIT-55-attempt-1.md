# Implementation-session handoff

Goal and attempt: UIKIT-55 (the sign-in's three levels and a wrong code on its field; «¿Vale $20?» for sign-in,
findings 4–6; Luis: «Sí, empieza con las dos PRs»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-kit`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-kit`, branch `ui/signin-hierarchy` from `main` at `9d9023f9`
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`), on branch `ui/signin-hierarchy`; no
service code, no deploy, no contract.
Runtime unit: Luis's Windows host (node's test runner; Playwright through `.claude-guards/safe-run.ps1`, 2 workers,
AION2 closed); CI (GitHub Actions) as the run on record.
Existing authority: Luis's standing instructions for the kit (push to `ui/*`, answer Codex's threads with a fix commit;
after the 2026-10-13 freeze, later P2s go to a follow-up list); merges are Luis's, with no open P1. Spending: no paid
service; CI minutes only.
Ending commit/tree: `0c10fc28680c` (tree `9e0ac850fd23`), the last commit of `ui/signin-hierarchy`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 9 files changed against
`origin/main` at that commit: `e2e/signin-hierarchy.spec.ts`, `e2e/signin-lede.spec.ts`, `e2e/signin.spec.ts`, `src/app/CodeField.tsx`, `src/app/SignIn.tsx`, `src/app/auth-words.test.ts`, `src/app/auth-words.ts`, `src/app/theme.css`, `docs/plans/signin-hierarchy.md`. The review notes below name the commit of each later change.

## Outcome

- See `docs/plans/signin-hierarchy.md`. The note under the form and the status beside «Send again» at the label size
  12/16 under a 14/20 lede; «Check your email» as a line («We sent a link and a code to <address>.») and a note («Open
  the link in this browser, or type the code here.»), both in `auth-words.ts`; a refused code marks its field invalid
  (described by the error, the rose border the address uses), its digits selected, typing clears it. A code not
  confirmed in time is not marked: it may still sign in.
- Finding 2 (provider tiles as marks only) closed by Luis: icons chosen to keep the row minimal and recognisable.

## Evidence

- Written first and failing (`32c528c8`): `e2e/signin-hierarchy.spec.ts` (dark and light, desktop and phone) and the
  two sentences in `auth-words.test.ts`.
- Local, through the guard: the sign-in specs and every spec that draws sign-in (signin, signin-lede,
  signin-hierarchy, chips-radii, control-heights, field-scale, focus-visible, ink, light-mode, light-fills, light-mark,
  press-answers, opening): 173 passed, 1 skipped, 1 failed. The failure is press-answers «Home, its microphone
  listening» («Speak instead» round), which fails the same on `main`'s source on this host: not this change.
- `signin-lede.spec` «the controls sit one line and the gap lower» failed 2 of 8 on `main`'s source too: it read the
  title during its 0.36 s arrival. It now waits for the arrival (`0c10fc28`): 12 of 12.
- `signin.spec` «its words keep to … sizes» now allows the note's 12 px beside the title, the text and the 10.5 label.
- Unit suite: # pass 1149 # fail 0 ; lint (type-aware), typecheck and Prettier clean.

- Commands: `pnpm exec prettier --check .`, `pnpm exec oxlint --type-aware .`, `pnpm exec tsc --noEmit -p apps/studio`,
  `node --test "apps/studio/src/**/*.test.ts"`; Playwright through `safe-run.ps1 -Command "pnpm exec playwright test
  --workers=2 <specs>"`.
- Source-register IDs consulted: none.

## Decisions and changes

- Changed: the screen's fine print to 12/16, the sent screen's words, the code field's invalid state. Preserved: the
  lede at 14/20 (at 15 it wraps at 320 px, which signin-lede.spec forbids), the light, the title, the providers, every
  other state's words; the personal space's unlock (`CodeField`'s new props are optional).
- Instruction applied: Luis, 2026-10-13, «Sí, empieza con las dos PRs» after `informe-signin-20.md`; «Lo de Google y
  Github puse los iconos para que sea minimalista y reconocible».
- Authority: not widened. Studio code, its checks and records only.

## Remaining obligations

- CI on the PR; the independent review (Codex) with no open P1 before merge. Findings 1 (production behind main:
  Davide's deploy, Luis writes to him) and 3 (terms and privacy: needs their URLs) stay open.

## Next bounded action

«¿Vale $20?» for the two spaces (workspace and personal), critique first.
