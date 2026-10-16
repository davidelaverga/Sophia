# Updates: each line says when

> 2026-10-14 · `evaluacion-2026-10-13/informe-updates-20.md`, finding 1. Luis: «Sí, empieza con la PR 1 y súmalo a #105»
> (the goals in the digest, finding 2, asked there).

## What was measured

- A decided line says «proposed by Lucía, decided by you», a kept one «kept by Noor»: never when, though the digest
  carries the moment of each (`decided[].at`, `noted[].at`). In «since you last looked», when is half the news.

## What changes

- In Updates, a decided or kept line ends with when, in the Studio's time words: «kept by Noor · 2 h ago», «… · 3 days
  ago» (`ago`, app/time-words.ts). What was made and what is still open carry no moment in the digest, so they say none.
- A meeting's recap keeps its lines as they are: everything in it happened in that one meeting, whose time its row
  already says.

## Checks

- `recap-view.test.ts`: given a way to say when, the decided and kept lines end with it; without one, as before.
- `e2e/updates-digest.spec.ts`: in the demo, a kept line and the decided line say when; the meeting's recap doesn't.
- `pnpm exec prettier --check .`, `pnpm exec oxlint --type-aware .`, `tsc --noEmit -p apps/studio`; CI as the run on
  record.
