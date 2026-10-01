# Implementation-session handoff: PS-01 personal space, attempt 1

- **Goal:** [docs/goals/personal-space.md](../goals/personal-space.md). Anyone who signs up has a private space with Sophia, beside the work space. The goal is parked (Davide, 2026-09-30: team room first). Luis asked on 2026-09-30 to build it anyway, as a draft for Davide's call («La opción C. Debe ser un 1 to 1»).
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** first commit `c3f8968` on `studio/personal-space` (#30), 2026-09-30. On 2026-10-01 Luis asked to split it: the data and API on `personal/data` (from main `860a01a`), and the Studio's places on top of it (#30).
- **End:** the data side's code at `7de9907` (#35's head); the Studio's at the merge that brings it in, named once its checks ran.
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
- **API:** the personal routes, the project list with who is in each room (one question finds the rooms that exist, never by their count, which the room server refreshes every few seconds; only those are asked, a few at a time), readiness that requires every personal function, and the companion behind one interface: the keyless rehearsal in development (`SOPHIA_COMPANION=rehearse`); none in production, where a message is refused before anything is kept. A companion's failure is logged by its name and code only. The API claims a turn, and a welcome under its key, before it asks the companion, so one process asks; every write of the answer carries its claim, so an attempt that lapsed writes nothing over a later one, and a welcome not written yet answers `outcome_unknown`, for the same request to ask again. A companion call is told to stop when its time is up and is waited for before anything is asked again; a welcome's key is tied to whom it greets. A long conversation is read back a page at a time, and its days are counted whole, in the reader's time zone. Where no companion runs, a retry still gets its key's receipt; the export comes a page at a time.
- **Studio** (#30, on top of the data side):
  - the three places (home, Personal, Work) under one bar, built from the Studio's own controls;
  - the padlock: one value per device and account (never the address, which can change); the person shuts it and so does every call; a call's end opens nothing; only the person opens it, by confirming it's them (a passkey or an emailed code on a client of its own, so the app's session is never touched; or the provider they signed in with, as a new sign-in);
  - Your data: copy everything (with the suggestions not decided yet), delete everything;
  - a call that goes on across the places, with its switches, text mode, what Sophia is looking at and what stopped a device in the places' bar; opening another project leaves it, and says so; "Join the room" from Work joins on that opening only;
  - for the keyboard and screen readers: Sophia's replies are said once; a letter typed with the focus nowhere in Personal goes into the message bar (never the padlock), and never into a field the notes cover; a modal sheet takes every key; the focus is handed on wherever a control goes away;
  - a message's words stay on the device until they were sent, also while they are on their way, and come back when a send fails or gets no answer; not when the space was erased;
  - one message on its way at a time, from the field or a way to start; every write but erasure names the space's epoch as last read, so nothing sent before an erasure lands after it;
  - the field follows the device's one draft across tabs, and an erasure anywhere takes the words written before it; a long conversation reads back a page at a time, Your data counts all its days, and its copy reads the export a page at a time;
  - while the padlock is shut the field is off the page and the page keeps none of the space's words; the days follow the clock.

Missing or unverified:
- **No live companion.** Sophia's answers in development are scripted. D1, the Companion agent on our runtime, is not built.
- **No real provider round trip.** The provider unlock was checked against local Supabase, with a second sign-in standing in for Google, GitHub or Microsoft.
- **No real passkey.** Passkeys aren't offered on a local host; the passkey check's outcomes are unit-tested, and it runs on the same client as the email code, which was checked against local Supabase.
- **The code in the email.** The local Supabase template sends a link without the code, so the local check used a code from the local Auth admin API. Unlocking with a code needs the code in the hosted template, as the sign-in screen's code already does.
- **Not deployed**, so the goal's hosted acceptance runs are open, and the privacy page is not written.
- **Copy on Safari:** the clipboard is handed the text as a promise, as WebKit requires; checked in Chromium only.
- **Unlocking opens every tab of the device**, also one in a call that may be sharing its screen (accepted: the person asked for it).

## Evidence

- **Gates:** format, lint, typecheck, contracts check and the Studio build; unit tests: 492 pass, plus the 5 known failures on Windows (launch environment and bundle digest tests); Studio tests: 274; database tests: 243 (`pnpm test:db`); the tests against a real LiveKit server: 4 (`pnpm test:livekit`); the SQL run of the 21 migrations (`pnpm test:sql`).
- **Browser checks** (local stacks, synthetic identities and accounts, this branch's own Studio):
  - the second review round (`personal-round6`): the padlock across a call, stray typing with a project kept for its call, the notes covering the conversation, touch, the focus handed on, another tab's unlock, a send with no answer and one refused as erased, the places' bar in a call, a check under way when another tab unlocks;
  - the code review's fixes (`personal-round7`): another project leaves the call, nothing personal in memory while locked in a project, the focus after a menu's sheet and after Leave, the notes while loading, a waiting press, a sheet in a project out of sight, a refused keep, the draft while a message is on its way, a lock and the screen reader;
  - unlocking against local Supabase (`unlock-supabase`): the code checked on its own client (the app's session untouched, nothing stored, the check's session ended), a wrong code, a lost connection, a check and ways with no answer (20 s), another account; an email change, after which the padlock is still shut;
  - Codex's third review of #30 (`personal-codex30b`): a dictation start waiting for the device's language, called off by a lock, by crossing to Work and by signing out, and a second press; a copy whose export arrives after a lock stored without an event, or after its sheet closed;
  - Codex's fourth review of #30 (`personal-codex30c`): a way to start on its way (the field waits, quietly), a message on its way when the space is erased (refused, nothing comes back, and the next goes), a note taken back from Work while the space is locked;
  - Codex's fifth review of #30 (`personal-codex30d`): erasing in one tab empties another tab's field; an erasure whose answers were lost; a conversation of 620 turns (days counted whole, earlier days read back, nothing missing as new turns come); a time zone the server doesn't know; a copy of 1100 turns, longer than one page of the export; a page read back that arrives after the padlock shut;
  - Codex's sixth review of #30 (`personal-codex30e`): the padlock shut with a draft and a message on its way; open across midnight; and in `personal-codex30d`, a lock lets what was read back go;
  - the earlier suites on this Studio: the previous rounds (31 checks), the places’ keys and flows (37), a call across the places (12 of 13: a teammate's Work showed who had just joined only once the room server's count caught up, up to five seconds later; the data side's next commit asks the rooms themselves), the call and interface checks (6, 33 and 8), and the room’s suites from #24 (43).
- **Mutation checks:** every logic fix has a unit or database test that fails without it; every fix the tests can't reach was undone in the browser to see its scenario fail (this round, 4 Studio rules, 7 database rules and 4 API rules each failed their test before the fix, and of 10 browser fixes undone 9 were caught by their scenario, the tenth being backed by a second mechanism the scenario also exercises; the second round, 14 rules and 22 browser fixes, all caught).
- **Reviews:**
  - Codex on `8bf2acf`: one P1 and four P2, all fixed;
  - an independent review of #30's whole diff: one P1 and eleven P2, all fixed;
  - the second round's design, reviewed three times before any code;
  - independent code reviews of both halves (data: one P1, four P2, six P3; Studio: one P1, four P2, eleven P3), all fixed after a review of the fixes' design.
  - Codex on #35's `d3c98de`: four P2 (one process per answer, the welcome's key, the room server asked about every room, a suggestion of another turn), and on #30's `462c60e`: three P2 (a copy after a lock, overlapping sends, signing out where storage is blocked), all fixed, each undone once to see its test fail.
  - Codex on #30's `3389759`: one P1 (a dictation start waiting for the device's language went on out of sight) and two P2 (the padlock kept by the address; a copy that read the padlock as last drawn), fixed with their sibling paths (signing out while a start waits, the draft kept by the address, a copy after its sheet closed); each fix was undone once and its scenario failed, but for a guard against a second press, which proved redundant and was removed.
  - Codex on #35's `18b00d1`: three P2 (the same welcome request asked again while its first attempt wrote it settled its key with nothing; a reply or a failure written by an attempt whose claim had lapsed; a failed welcome not retried under its key), all fixed with a claim each attempt carries, each undone once to see its test fail. Checking #30 against `18b00d1` found the Work list read the room server's count of participants, which lags a join by up to five seconds: it now asks every room that exists (a test against a real LiveKit server, `pnpm test:livekit`).
  - Codex on #30's `9a72043`, one P1 on the data side: a write issued before an erasure whose first attempt reached the database after it wrote again. Erasure now moves the space's epoch, and every other write names the epoch it was made against and is fenced to it (`personal_fence`); each part undone once fails its test.
  - Codex on #30's `9a72043`, on the Studio side: the P1's other half (every write but erasure names the epoch as last read, and its retry the same one) and one P2 (a way to start and the field shared no guard, so two messages could be on their way at once), fixed; each undone once fails its scenario, but for the guard's backstop inside the writes, which the field's wait already covers.
  - Codex on #35's `baf9c83` and `cf1fef8`: three P2 (a welcome's claim kept when its read failed; a stalled attempt given the context after its claim lapsed; the Work list's carried notes bounded per project only), all fixed, each undone once to see its test fail.
  - Codex on #35's `f600665`: three P2 (a welcome's key not tied to whom it greets; a companion call past its time left running; a welcome's write not fenced to its epoch), and on #30's `3d8bc84`, its data half (a conversation past 500 turns could not be read back, and its days were counted from the newest 500 only), all fixed, each undone once to see its test fail.
  - Codex on #35's `4fd79b5`: one P2 (a welcome's attempt that stalled past its claim still read what to welcome from), fixed; undone once, its test fails.
  - Codex on #35's `ce11764`: two P2 (a retry refused where no companion runs, before its kept receipt was looked up; an export with no bound), fixed; each undone once fails its test.
  - Codex on #35's `d183cae`: two P2 (asking again cleared a claim just taken, judged by when the reply was asked for; a claim not renewed as its context went to the companion), fixed, also for the welcome's claim; each undone once fails its test.
  - Codex on #30's `3d8bc84`: two P2 (another tab kept the erased draft; a conversation past 500 turns lost its earlier days and undercounted them), fixed on both sides; each Studio fix undone once fails its scenario.
  - Codex on #30's `67f9974`: two P2 (the field, and a message on its way, kept on the page while the padlock is shut; the days not following the clock), fixed with what was read back, which a lock lets go too; each undone once fails its scenario.
  - Codex on #30's `9dea6f2`: one P2 (a page read back that arrived after the padlock shut was kept), fixed; its scenario failed before the fix.

## Decisions and changes

- **Direction:** C ("Two doors"), chosen in Luis's prototype rounds.
- **The padlock (Luis, 2026-10-01):** a call shuts it and only the person opens it. The prototype's "a room's lock lifts on leaving" is dropped, so no tab ever has to decide whether another tab's call goes on.
- **Split (Luis, 2026-10-01):** the data and API in their own PR, the Studio on top.
- **One call in sight:** opening another project leaves the call, and the toast says so. A project's bar has no room for another room's call (measured: it breaks the bar at 360–390 px and squeezes the views at 800 px), and nothing may keep sending out of sight.
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
4. Keep the code in the hosted email template: unlocking with an emailed code types it, as signing in with one does.

## Next bounded action

- Review and merge the data side, then the Studio (#30); then Davide's decisions above.
