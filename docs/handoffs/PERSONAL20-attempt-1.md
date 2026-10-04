# Implementation-session handoff

Goal and attempt: Personal toward $20 a month (`docs/plans/personal-twenty.md`), attempt 1  
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine  
Native session: a local Claude Code session; its identity is unknown (not exported)  
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `personal/twenty` from `personal/pass` (#88) at `5a335f6`, 2026-10-04  
Ending commit/tree and changed files: content commit `797bf5a` (tree `ade04250ff94`); these files changed:
- `apps/studio/src/features/personal/`:
  - new: `arrive.ts` (+ test), `extras.ts`, `Memory.tsx`, `WeekLook.tsx`, `Talk.tsx`;
  - changed: `conversation-view.ts` (+ test), `places-view.ts`, `Conversation.tsx`, `NotesPanel.tsx`, `PersonalSpace.tsx`, `personal.css`.
- Fixtures: `fixtures/personal-extras.ts` (new), `fixtures/personal.tsx`, `fixtures/personal.html`.
- `e2e/personal.spec.ts` and `docs/plans/personal-twenty.md`.

## Outcome

**Real now:** these work with the API as it is, and come alive once Sophia answers (the Companion agent, D1).
- **The day's answers** under her latest greeting nobody answered.
- **"Get ready for <session> · <project>"** for a session in your projects within 24 h. It leads the ways to start and the day's answers.

**Shown with fixtures, hidden in the app:** each waits for its data from the API. Places passes no `extras`, so nothing of them shows in production.
- **What she remembers:** correct or forget each item.
- **Her look back at your week:** talk about it, keep it as a note, or not now.
- **A live talk by voice:** a modal; it ends on lock or hide.

**Not verified:**
- the real backend parts, which don't exist yet;
- Safari and Firefox.

**What the market looks like, and what the backend needs, for Davide:** in the design note.

## Evidence

**Commands** (browser checks through `<scratchpad>/pw-low.ps1`, at below-normal priority on half the workers):
- **Unit:** `node --test apps/studio/src/features/personal/*.test.ts apps/studio/src/features/light/*.test.ts`: 124 of 124 passed.
- **Personal's checks:** `pw-low.ps1 e2e/personal.spec.ts --repeat-each=2`: 48 of 48 passed. There are 9 new $20 checks; the review's new checks failed before their fixes.
- **Mutations:** `<scratchpad>/mutate-twenty.py`, using Git's bash: 23 of 23 killed, and 2 controls survive.
- **From the repo root:** `pnpm format:check`, `lint`, `typecheck` and `contracts:check` pass, and so does the Studio's build.
- **Full browser suite:** 304 of 308 passed. The 4 failures:
  - 3 in `report.spec.ts` (Davide's #32). Two of them also fail on `main` without this change, so this looks local to Windows.
  - `home.spec.ts:309` (narrow phones, #87): it passed 5 of 5 alone, so it is flaky under load. It goes to a follow-up.

**Fixture video:** `personal-20-muestra.mp4`, sent to Luis.

**Source-register IDs consulted:** none.

## Decisions and changes

**The independent review found no P1. Its P2s are fixed:**
- the talk ends on lock or hide, and doesn't come back on unlock;
- the talk is a real modal: `aria-modal`, the content behind it inert, Tab trapped, Esc wherever the focus is;
- focus comes back after a talk, after Forget, Save or Cancel, and after Keep or Not now;
- the week is put away once talked about;
- the day's answers show under an earlier greeting nobody answered;
- the test gap for "you spoke today" is closed;
- the voice is started once and kept.

**P3s fixed:** caption keys, the Mute label, starting a talk only where she can answer, empty memory, unchanged corrections, fixture transcripts with `replyTo`, and the design note's claims.

**Preserved:** Davide's #76 files are untouched.

## Remaining obligations

- **#88** awaits Luis's merge OK. This PR is stacked on it.
- **When #88 merges,** do not delete `personal/pass` until this PR is retargeted to main: deleting a stacked base closes the PR on top of it.
- **Local servers** (local only): the fixtures on :5199. The API (:8797) and the Studio (:5179) were stopped at their time limit.
- **Follow-ups:**
  - the P2s on #85–#87;
  - #85's keys during the opening;
  - `home.spec.ts:309` flaky under load.

## Next bounded action

Luis reviews this PR. Then Davide picks up the backend list in `docs/plans/personal-twenty.md`, D1 first.
