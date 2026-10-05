# Implementation-session handoff

Goal and attempt: what Sophia made is born in the room (`docs/plans/room-made-object.md`), attempt 1. It is the third PR of the room's $20 plan.
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `room/made-object`, rebased onto `main` at `ed6f3cd` (#101), 2026-10-05
Ending commit/tree and changed files: these files changed:
- in `apps/studio/src/features/voice/`: `made-view.ts` and its test, `StageMade.tsx`, `StageCaptions.tsx` (`memberLabel`, guests);
- in `apps/studio/src/features/studio/`: `StudioShell.tsx` (`LensBody`, `useKnownGuests`) and `ProjectShell.tsx` (`useStageMade`);
- `apps/studio/src/features/artifacts/DocumentViewer.tsx` (`shown`);
- `apps/studio/src/app/theme.css`;
- `apps/studio/fixtures/fake-people.ts` (`guest=1`);
- `apps/studio/e2e/room-made.spec.ts`;
- `docs/plans/room-made-object.md`.

## Outcome

A result's notice was a dot on the Chat toggle and a card in the closed panel that said only "Research report ready". Now an object is born under Sophia's line. The first time, it comes down from where the light is; under reduced motion it is simply there. It shows the report the way Knowledge does:
- the title and version the task's record names;
- its description, saying "Edited by <name>" first when a member edited it;
- facts from the record: reading minutes, `##` sections, sources (on a first version only, as Knowledge does) and limits, the limits marked;
- who asked;
- Open (O) and Close (×, Esc).

Until the record is read it says the Studio's words, and Open waits. With Chat open, the chat's card is there instead. A newer notice takes its place. Once opened (here, from the chat's card, or anywhere the viewer shows it) or closed, it stays away past other views, and is never born again. O acts only while there is something to open and no panel or report covers the room. Close, Esc and Open leave the focus on Chat.

**A guest's caption stays marked** ("Name · guest"), from Codex's P2 on #101.

**The viewer's API gains `shown`**, the report on screen.

**Independent review, round 1:**
- **P1, fixed:** the global `.fact` broke Personal's data sheet.
- **P1, fixed:** a member's edited description read as Sophia's.
- **P2s, fixed:**
  - the O shortcut acting under covers;
  - a cached older version shown after a revision;
  - sources counted across versions;
  - opened from the chat, it came back;
  - the focus was lost;
  - hiding her line's note also hid "Your microphone is off";
  - short stages;
  - repeated Knowledge reads;
  - weak tests.
- **P3s, fixed:** a comment, the plan's wording, "a member", `aria-keyshortcuts`, and born only once.

**Round 2:** no P1. Three P2s, fixed:
- the object could cover a tall line of Sophia's (a note plus a calendar session, or words wrapping). It now sits below the line's measured height (`--line-h`);
- the stale-version check could pass by timing. It now waits for the record;
- O's hint showed while the key was off. It now shows only while O works.

P3s, fixed: the focus goes to this stage's Chat toggle, the callbacks are stable, and the card's query sits under Knowledge's `['reports']` key, so an edited description is read again.

Not fixed (P3): if a revision arrives for the report already on screen, the object shows briefly until its record is read, then puts itself away.

The fixture gains `session=soon`.

## Evidence

Runs were in the guards' gentle mode beside Luis's game: Idle priority, 4 logical CPUs, one browser (`.claude-guards/README.md`).

**Commands:**
- **Tests first:** the first 9 browser checks failed before the change.
- **Units:** `made-view.test.ts`, 11 of 11.
- **`room-made.spec.ts`:** 20 checks, all passing after round 2 (17 of them 34 of 34 over 2 runs before). They cover the facts' exact words, O, Esc, the focus, opened elsewhere, an edited description, born once, two short stages with captions, and a stale version.
- **Neighbours:**
  - `room-captions`, `room-people`, `room`, `voice-chat`, `personal` and `report`: 197 of 197;
  - the full suite runs in CI.
- **Mutations** (`light_mutants.py`): the control survives every time.
  - 12 first mutants: all killed after the placement check was tightened.
  - 9 on the review's fixes: all killed but one. N4, `ready` in O's flag, is kept: it only avoids swallowing the key, since `open()` already returns early.
  - The short stage's compact rule was removed: its mutant survived, because the object fits without it.
  - Round 2's 3 (line height, stale version, the hint): all killed.

**From the repo root:** `lint` and `typecheck` pass, and Prettier is clean on the changed code.

**Captures in the session:** desktop, laptop (1280×800) and a phone.

**Source-register IDs consulted:** none.

## Remaining obligations

- This PR awaits CI and Codex. Luis's standing OK is to merge without a P1.
- Next is PR 3b, Sophia's work line with real progress, then PRs 4–5.

## Next bounded action

PR 3b: her line says what she is doing, from the research record (reads used of the limit, the PDF being rendered).
