# Implementation-session handoff: PS-01 personal space, attempt 1 (data and API)

- **Goal:** [docs/goals/personal-space.md](../goals/personal-space.md). Anyone who signs up has a private space with Sophia, beside the work space. The goal is parked (Davide, 2026-09-30: team room first). Luis asked on 2026-09-30 to build it anyway, as a draft for Davide's call («La opción C. Debe ser un 1 to 1»).
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `personal/data` from main `860a01a`, 2026-10-01. It carries the data side of #30 (`studio/personal-space`, first commit `c3f8968` on 2026-09-30), split out at Luis's request so it can be reviewed and merged on its own. The Studio's places stay in #30, on top of this branch, and extend this file.
- **End:** the code and docs at `0c55e73` (tree `abc749d5507e`), the head every check below ran on. The commit after it changes only this line.
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
- **Erasure:** the conversation, suggestions and notes are deleted; every request keeps only its key, dated at the erasure, so a retry from before writes nothing however late it comes; carried notes stay in their projects, still the person's. The space's revision and its turn order go on. Erasure moves the space's epoch, and every other write names the epoch it was made against: one issued before an erasure, however late its first attempt arrives, writes nothing (`personal_fence`).
- **Limits:** a space keeps at most 2000 notes and a person carries at most 2000 (each refused by its own code), so every one is listed; the lists are bounded as the contract says, and a project's carried notes list the reader's own first; the Work list holds at most 4000 carried notes in all.
- **Who may write:** only the API role can call the personal writers.
- **API:** the personal routes, the project list with who is in each room (one question finds the rooms that exist, never by their count, which the room server refreshes every few seconds; only those are asked, a few at a time), readiness that requires every personal function, and the companion behind one interface: the keyless rehearsal in development (`SOPHIA_COMPANION=rehearse`); none in production, where a message is refused before anything is kept. A companion's failure is logged by its name and code only. The API claims a turn, and a welcome under its key, before it asks the companion, so one process asks; every write of the answer carries its claim, so an attempt that lapsed writes nothing over a later one, and a welcome not written yet answers `outcome_unknown`, for the same request to ask again. A companion call is told to stop when its time is up and is waited for before anything is asked again; a welcome's key is tied to whom it greets. An erasure is acknowledged only once no call to the companion for the person is in flight, in any process: each call is known while it runs and looks at its claim every few seconds, so one whose claim an erasure took stops. A long conversation is read back a page at a time, and its days are counted whole, in the reader's time zone. Where no companion runs, a retry still gets its key's receipt; the export comes a page at a time.

Missing or unverified:
- **No live companion.** Sophia's answers in development are scripted. D1, the Companion agent on our runtime, is not built.
- **Not deployed**, so the goal's hosted acceptance runs are open, and the privacy page is not written.
- **Nothing in the Studio calls these routes** until #30 lands.

## Evidence

- **Gates:** format, lint, typecheck and contracts check; unit tests: 437 pass, plus the 5 known failures on Windows (launch environment and bundle digest tests); database tests: 247 (`pnpm test:db`); the tests against a real LiveKit server: 4 (`pnpm test:livekit`); the SQL run of the 21 migrations (`pnpm test:sql`).
- **Reviews:**
  - Codex on #30's `8bf2acf`: one P1 and four P2, all fixed.
  - An independent review of #30's whole diff: its data findings are fixed here (a retry racing its first attempt, a suggestion let go, erasure's records).
  - A review of the fixes' design before they were written: erasure keeps only keys, dated at the erasure.
  - An independent code review of this branch: one P1 (who may call the writers), four P2 (lists past the contract's bounds, erasure's keys, a date kept, the plan's claims) and six P3, all fixed, each with a test that failed before its fix; the API's were also undone once to see their tests fail. The fixes' design was reviewed before they were written.
  - Codex on `d3c98de`: four P2 (one process per answer, the welcome's key, the room server asked about every room, a suggestion of another turn), all fixed, each undone once to see its test fail.
  - Codex on `18b00d1`: three P2 (the same welcome request asked again while its first attempt wrote it settled its key with nothing; a reply or a failure written by an attempt whose claim had lapsed; a failed welcome not retried under its key), all fixed with a claim each attempt carries, each undone once to see its test fail. Checking #30 against `18b00d1` found the Work list read the room server's count of participants, which lags a join by up to five seconds: it now asks every room that exists (a test against a real LiveKit server, `pnpm test:livekit`).
  - Codex on #30's `9a72043`, one P1 on this side: a write issued before an erasure whose first attempt reached the database after it wrote again. Erasure now moves the space's epoch, and every other write names the epoch it was made against and is fenced to it (`personal_fence`); each part undone once fails its test.
  - Codex on `baf9c83` and `cf1fef8`: three P2 (a welcome's claim kept when its read failed; a stalled attempt given the context after its claim lapsed; the Work list's carried notes bounded per project only), all fixed, each undone once to see its test fail.
  - Codex on `f600665`: three P2 (a welcome's key not tied to whom it greets; a companion call past its time left running; a welcome's write not fenced to its epoch), and on #30's `3d8bc84`, its data half (a conversation past 500 turns could not be read back, and its days were counted from the newest 500 only), all fixed, each undone once to see its test fail.
  - Codex on `4fd79b5`: one P2 (a welcome's attempt that stalled past its claim still read what to welcome from), fixed; undone once, its test fails.
  - Codex on `ce11764`: two P2 (a retry refused where no companion runs, before its kept receipt was looked up; an export with no bound), fixed; each undone once fails its test.
  - Codex on `d183cae`: two P2 (asking again cleared a claim just taken, judged by when the reply was asked for; a claim not renewed as its context went to the companion), fixed, also for the welcome's claim; each undone once fails its test.
  - Codex on `256ee70`: one P2 (an erasure acknowledged while a call to the companion for that space still ran), fixed for replies and welcomes, in this process and in others; each part undone once fails its test.
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
