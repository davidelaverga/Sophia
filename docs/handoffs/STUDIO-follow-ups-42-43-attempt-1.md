# Implementation-session handoff: the follow-ups to #42 and #43 (Explore's choice, reads and provenance; BASE-03)

- **Goal and attempt:** Codex's P2s that were left as follow-ups when [#42](LFE-00-attempt-4.md) and [#43](LFE-03-attempt-1.md) merged. Luis asked for all four together.
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `follow-ups/explore-and-base03` from main `b3c9f72`, 2026-10-02.
- **End:** the changes and docs at `92159cc` (tree `44fa99d8e523`), the head the checks below ran on. The commit after it changes only this line.
- **Writable scope:** `apps/studio/src/features/explore/`, its fixture and checks, one room check, CONTRIBUTING and the LFE records. **No contract, schema, API, dependency or hosted service was changed.**

## Outcome

- **One choice at a time across the gallery** ([`useSerialChoice`](../../apps/studio/src/features/explore/useSerialChoice.ts)). While a choice is being saved, every other candidate says "Another choice is being saved first.", even after Back or Esc. Two choices therefore never race on the same revision. The outcome lives at the gallery, so a failure outlives the detail that asked.
- **A read the network failed is tried again** ([`useVerifiedImage`](../../apps/studio/src/features/explore/useVerifiedImage.ts)). A failed read isn't kept, so the next check reads again; a mismatch is kept, since those bytes won't change. Up close, "Try again" re-reads every image that failed, and an image already shown stays as it is.
- **Provenance names exact identities** ([`direction.ts`](../../apps/studio/src/features/explore/direction.ts)): the brief's source id beside its revision, and each reference by label, asset id and SHA-256, one row per reference.
- **BASE-03 (#42's P2):** after a lost call with Chat open on a phone, the check taps Chat with Sophia in the panel. The call comes back in text mode: the connection connects, text mode applies, and no microphone turns on.

## Evidence

- `pnpm --filter @sophia/studio test:browser`: 16 checks (9 Explore, 7 room). With `--repeat-each=3` and 4 workers, 48 of 48 pass, run three times over after the last change.
- **Mutations**, each failing its check, every run on a fresh fixture server:
  - Explore's eighteen, the new ones being:
    - another choice is offered while one is saved;
    - a failed read is kept for good;
    - Try again reads nothing.
  - The provenance without the brief's source fails `direction.test.ts`.
  - Chat with Sophia joining by voice fails the new BASE-03 check: the microphone is on.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build` and `pnpm contracts:check` pass. `pnpm test`: 563 pass, plus the 5 known failures on Windows, as on main.

## Decisions and changes

- **The new BASE-03 check asserts the order the code really uses.** Out of the call, text mode is only remembered; the join applies it as it connects (`enterCall`), before any microphone arrives. The first draft of the check expected text mode first, and was wrong.

- **The failed-read scenario fails until the check heals it.** At first it failed only the first two reads, and the check depended on how many reads happened (React's strict mode reads twice in development). It flaked once in about 400 runs under load. It now fails every read until `window.explore.heal()`, so the check no longer counts reads.

## Remaining obligations

- **From LFE-03:** Davide confirms the read shapes and where a candidate's bytes and the choice live (S1-06).
- **LFE-02:** waits for PR32.

## Next bounded action

- LFE-02 when PR32 is in `main`. LFE-03.2 when S1-06 has a route to bind.
