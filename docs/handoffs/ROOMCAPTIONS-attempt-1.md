# Implementation-session handoff

Goal and attempt: captions on the room's stage (`docs/plans/room-stage-captions.md`), attempt 1. It is the second PR of the room's $20 plan.
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `room/stage-captions`, rebased onto `main` at `69628d0` (#100), 2026-10-05
Ending commit/tree and changed files: these files changed:
- in `apps/studio/src/features/voice/`: `stage-captions.ts` and its test, `StageCaptions.tsx`, `RoomStage.tsx`;
- in `apps/studio/src/features/studio/`: `StudioShell.tsx` and `ProjectShell.tsx`;
- `apps/studio/src/app/theme.css`;
- `apps/studio/e2e/room-captions.spec.ts`;
- `apps/studio/fixtures/room.tsx`: views switch as in the app, and `looking` needs someone sharing;
- `apps/studio/e2e/room-people.spec.ts`;
- `docs/plans/room-stage-captions.md`.

## Outcome

What is said aloud reached only the Chat panel, so with it closed (the room's usual state) the stage showed none of it. Now the last two captions show on the stage's axis just above the dock:
- in the chat's order, named its way (Sophia, You, a first name);
- the older one quieter;
- a long one shows its end;
- only while this person is in the call and Chat is closed.

They go six seconds after anything was last said, and only what is said after that brings them back. The hold lives where the room lives (`ProjectBody`), so leaving and joining again, closing Chat later, or coming back from another view never brings old words back as new.

The gallery, the present layout and the lens body end above them; their height is measured before the first paint. They are a visual copy of the chat's captions, so they are hidden from assistive tech.

**Codex's P2 on #100 is fixed here:** `looking=screen` needs someone there to share the screen.

**Independent review:**
- **Round 1:** one P1 and four P2s, all fixed.
  - P1: old captions came back for 6 s after a rejoin or after closing Chat.
  - P2: the hold watched only the newest caption.
  - P2: a stalled partial stayed forever.
  - P2: the order could differ from the chat.
  - P2: no check with a lens open.
- **Round 2:** one P2, fixed: the same thing after a visit to another view, because the hold lived in `StudioShell`, which unmounts. Its P3s are fixed too:
  - the first frame no longer overlaps the video;
  - your own captions read "You" even before the membership is read;
  - a check that a word at 5 s extends the hold.

No P1 or P2 remains.

## Evidence

**A machine crash during this work (2026-10-05 08:41).** The PC hung during a mutation loop with 3 workers and a fresh Vite per mutant, while a game held about 8.7 GB. The crash left one mutated file behind; `git status` found it and it was restored from git.

The guards changed (`.claude-guards/README.md`):
- one worker;
- a gentle mode, used beside Luis's game:
  - Idle priority;
  - 4 of the 16 logical CPUs;
  - the game allowed by name;
  - a stop under 4.5–5 GB free;
- `light_mutants.py`: one Vite for the whole loop.

Every run after the crash used it, with the game open and no trouble.

**Commands:**
- **Tests first:** the 9 first browser checks failed before the change. So did the rejoin, Chat-later, stalled, overlap, order and view-switch checks added after the reviews.
- **Units:** `stage-captions.test.ts`, 11 of 11.
- **Browser:**
  - `room-captions`, `room-people` and `room.spec`: 42 of 42, gentle, 1 worker;
  - `room-captions` alone: 45 of 45 over 5 runs (before the round-2 checks).
- **Full suite:** 446 of 450 before the reviews' fixes. The 4 failures are `report-page`, which fails the same way on `main` on Windows. Since then, the full suite runs in CI.
- **Mutations:**
  - 14 product mutants on the captions, all killed (by unit or e2e checks); the control survives;
  - the fixture's `looking` mutant is killed too.

**From the repo root:** `lint` and `typecheck` pass, and Prettier is clean on the changed code.

**Captures in the session:** desktop, the gallery and a phone.

**Source-register IDs consulted:** none.

## Remaining obligations

- This PR awaits CI and Codex; Luis's standing OK is to merge without a P1.
- **Open question for Luis:** a CC toggle (Meet's), not built.

## Next bounded action

PR 3 of the plan: what Sophia makes is born in the room (the made object, Open and Show everyone).
