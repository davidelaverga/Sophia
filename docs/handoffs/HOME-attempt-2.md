# Implementation-session handoff: Home, attempt 2 (#86: CI and Codex's P2s)

- **Goal and attempt:** this attempt fixes what #86's first run found: two browser checks failing on CI, and Codex's four P2s.
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `home/welcome` at its attempt-1 handoff, 2026-10-04.
- **End:** content commit `a5819aa`; its checks ran on it.
- **Writable scope:** `HomeDoors.tsx`, `Places.tsx` (the loading flag), Home's fixture and its checks. **No contract changed.**

## Outcome

- **Esc with a sheet open over Home** is the sheet's: the note stays (`modalOnScreen`).
- **The Safari-safe `onScreen`** replaces `checkVisibility`, which Safari 16.4–17.3 lack.
- **A projects read that failed** shows its note; no rows keep loading beside it.
- **Under reduced motion** Sophia's light stays at rest under the pointer.
- **The glide check** allows at most half the way in one frame; a jump is all of it at once. CI's slower runners moved a third.

## Evidence

- **Tests first:** three new browser checks (failed read, sheet's Esc, light still under reduced motion), each failing before its fix.
- **Mutations, each killed:** rows loading after a failure; Esc stealing the sheet's; the light following under reduced motion.
- **Gates:** `format:check`, `lint`, `typecheck` and the Studio's build pass. `test:browser --repeat-each=2`: 432 of 432.
