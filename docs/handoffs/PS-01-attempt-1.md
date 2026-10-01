# Implementation-session handoff: PS-01 personal space, attempt 1 (data and API)

- **Goal:** [docs/goals/personal-space.md](../goals/personal-space.md). Anyone who signs up has a private space with Sophia, beside the work space. The goal is parked (Davide, 2026-09-30: team room first). Luis asked on 2026-09-30 to build it anyway, as a draft for Davide's call («La opción C. Debe ser un 1 to 1»).
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `personal/data` from main `860a01a`, 2026-10-01. It carries the data side of #30 (`studio/personal-space`, first commit `c3f8968` on 2026-09-30), split out at Luis's request so it can be reviewed and merged on its own. The Studio's places stay in #30, on top of this branch, and extend this file.
- **End:** the PR's head when merged.
- **Writable scope:** this repository. **No hosted service was changed.** Migration 0021 is on no hosted database.

## Outcome

What works, on the local dev stack with the rehearsal companion:
- **Storage (migration 0021, amendment A10):**
  - owner-only tables for the conversation, Sophia's suggested notes, kept notes and carried notes;
  - every write is a `sophia.*` function, idempotent per person and key; each holds the person's space before it reads its key, so a retry racing its first attempt gets the same receipt;
  - one note at a time is carried to one project where its owner is a member, and can be taken back;
  - a suggestion let go is deleted;
  - a reply lost with the process answering it reads as failed after two minutes, and can be asked for again (`personal_reply_state`);
  - Sophia's welcome back after an hour of quiet.
- **Erasure:** the conversation, suggestions and notes are deleted; every request keeps only its key, dated at the erasure, so a retry from before writes nothing however late it comes; carried notes stay in their projects, still the person's. The space's revision and its turn order go on.
- **Limits:** a space keeps at most 2000 notes and a person carries at most 2000 (each refused by its own code), so every one is listed; the lists are bounded as the contract says, and a project's carried notes list the reader's own first.
- **Who may write:** only the API role can call the personal writers.
- **API:** the personal routes, the project list with who is in each room (one question finds the rooms that exist, never by their count, which the room server refreshes every few seconds; only those are asked, a few at a time), readiness that requires every personal function, and the companion behind one interface: the keyless rehearsal in development (`SOPHIA_COMPANION=rehearse`); none in production, where a message is refused before anything is kept. A companion's failure is logged by its name and code only. The API claims a turn, and a welcome under its key, before it asks the companion, so one process asks; every write of the answer carries its claim, so an attempt that lapsed writes nothing over a later one, and a welcome not written yet answers `outcome_unknown`, for the same request to ask again.

Missing or unverified:
- **No live companion.** Sophia's answers in development are scripted. D1, the Companion agent on our runtime, is not built.
- **Not deployed**, so the goal's hosted acceptance runs are open, and the privacy page is not written.
- **Nothing in the Studio calls these routes** until #30 lands.

## Evidence

- **Gates:** format, lint, typecheck and contracts check; unit tests: 437 pass, plus the 5 known failures on Windows (launch environment and bundle digest tests); database tests: 232 (`pnpm test:db`); the tests against a real LiveKit server: 4 (`pnpm test:livekit`); the SQL run of the 21 migrations (`pnpm test:sql`).
- **Reviews:**
  - Codex on #30's `8bf2acf`: one P1 and four P2, all fixed.
  - An independent review of #30's whole diff: its data findings are fixed here (a retry racing its first attempt, a suggestion let go, erasure's records).
  - A review of the fixes' design before they were written: erasure keeps only keys, dated at the erasure.
  - An independent code review of this branch: one P1 (who may call the writers), four P2 (lists past the contract's bounds, erasure's keys, a date kept, the plan's claims) and six P3, all fixed, each with a test that failed before its fix; the API's were also undone once to see their tests fail. The fixes' design was reviewed before they were written.
  - Codex on `d3c98de`: four P2 (one process per answer, the welcome's key, the room server asked about every room, a suggestion of another turn), all fixed, each undone once to see its test fail.
  - Codex on `18b00d1`: three P2 (the same welcome request asked again while its first attempt wrote it settled its key with nothing; a reply or a failure written by an attempt whose claim had lapsed; a failed welcome not retried under its key), all fixed with a claim each attempt carries, each undone once to see its test fail. Checking #30 against `18b00d1` found the Work list read the room server's count of participants, which lags a join by up to five seconds: it now asks every room that exists (a test against a real LiveKit server, `pnpm test:livekit`).
- Every logic fix has a database test that fails without it (a mutation check on each).

## Decisions and changes

- **Kept data:** a suggestion the person lets go is deleted, not kept as declined. Erasure keeps the key of every request (a retry needs it, however late), the space's revision and turn order, and its own receipt; a forgotten note's keep keeps no digest of it.
- **Open for Davide** (goal §6, PR #21):
  - D5;
  - the Companion on the runtime;
  - where carried notes show inside a project;
  - member names;
  - the privacy page.

## To turn it on (owner actions)

1. Davide decides whether the personal space goes in, since it was parked.
2. Apply migration 0021 before deploying the API; `/ready` refuses otherwise.
3. Configure a companion for the API. Without one, personal messages are refused (503) and nothing is kept.

## Next bounded action

- #30, the Studio's places, on top of this branch; then both are reviewed and merged in that order.
