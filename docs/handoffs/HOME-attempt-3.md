# Implementation-session handoff: Home, attempt 3 (#86: the Welcome, C2)

- **Goal and attempt:** Luis rejected the doors ("aún lo siento cheap", "ninguno se ve minimalista y premium") and chose the editorial direction C2, then asked where his personal side and his voice were. This attempt builds C2 with "You and Sophia" first and on-device dictation.
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `home/welcome` at `c500f71`, 2026-10-04.
- **End:** content commit `a30bbda`; its checks ran on it.
- **Writable scope:** `Welcome.tsx` (was `HomeDoors.tsx`), `handed.ts`, `places-view.ts`, `Places.tsx`, `PersonalComposer.tsx`, `PersonalSpace.tsx`, `focus.ts`, `usePlaceMotion.ts`, `light/engine.ts`, `personal.css`, Home's fixture and checks, `docs/plans/home-welcome.md`. **No contract changed.** Davide's #76 files untouched.

## Outcome

- **The page** is the plan's C2: date, greeting, Sophia's one sentence (`sophiaSays`), "You and Sophia", Work's first three projects with their notes (`rowNote`), her light alone on the right.
- **Words to Sophia** are handed to Personal's composer (`handed.ts`, `useHanded`), which sends them as its own. Home sends nothing itself.
- **Dictation** is on-device only; it and the pointer stop while Home is hidden. The light engine pauses without a size and resumes on resize.
- **The independent review's P1** (your own call's row hung up) and its P2s (double send, erasure, not-ready, stale navigation, dictation out of sight, "/" under modals, focus selectors) are fixed.

## Evidence

- **Tests first:** `handed.test.ts` (4), `places-view.test.ts` (16), `e2e/home.spec.ts` (17, desktop and phone).
- **Mutations:** 22 of 22 killed (rows, notes, sentence, hand-off decisions, keys, "/" under a sheet, locked, microphone stop and hidden, light under reduced motion and hidden, placeholders, touch words, engine pause and resume).
- **Gates:** `format:check`, `lint`, `typecheck`, `contracts:check` and the Studio's build pass. Browser suite: 213 of 214. The one failure, Resources' "act · its owner acts on a session", passed 5 of 5 alone; it is untouched by this change.

## Left open

- `useHanded`'s two branches (send, keep in the field) have no component check: the decision is unit-tested, the wiring is two lines. No fixture renders the composer.
- Live voice with Sophia in the personal space needs a media bridge: Davide's side.
