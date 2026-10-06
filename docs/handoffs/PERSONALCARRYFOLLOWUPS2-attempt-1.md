# Implementation-session handoff

Goal and attempt: follow-ups to Codex on #132 and #135 (`docs/plans/personal-carry-follow-ups-2.md`), attempt 1, behind the vision flag.
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `personal/carry-follow-ups-2` on `main` `1b4e08d` (#132 and #135 merged), 2026-10-06
Ending commit/tree: five commits on `personal/carry-follow-ups-2`, read one by one (a merge ref or a squash folds them into one):

- `1668255` «Personal carry and carried in: follow-ups to Codex on #132 and #135»;
- `c8153c3` «Carry follow-ups 2: the review's findings»;
- `1fd486f` «Carry follow-ups 2: the account is the session's, not Places'»;
- `e50c1e7` «Carry follow-ups 2: the package says how far it went when the account leaves»;
- this handoff's own commit.

## Outcome

**The package (#135):**

- **It stops when its account leaves, and only then.** App says who is signed in (`signed-in.ts`): cleared at once on leaving or switching, restored if a sign-out fails. Before each note the batch asks whether its account still is, and says how far it went if not.
  - Anything else that puts the package away lets the batch finish: closing the notes, `t`, Find, the lock, going to another place, opening a project.
- **It holds Escape above the notes** while a step runs, even when they open again after it (`priority`, `topOf`). Out of sight, it lets Escape go.

**What was carried in (#132):**

- read again as the project's feed moves, and after a carry or take-back;
- its place kept while read;
- a project past the list's first ones never said to have nothing;
- a later failed read says it may be out of date, whatever the list held;
- Try again with a list shown says it is reading again.

**Independent review, four passes:**

- **First:** two P2s, fixed.
  - Stopping on unmount stopped the batch when the notes were merely closed. It now asks the account instead.
  - The Escape check couldn't fail: leaving and coming back were batched into one render.
  - P3s fixed: the success path refreshes too, the first cursor isn't a move, a hidden package lets Escape go.
- **Second:** one P2, fixed. Opening a project took Places away, and with it the writes' «here». The account is now the session's (App).
- **Third:** no P1 or P2. One P3 fixed: on a failed sign-out, or the same identity chosen again, the package stayed «carrying».
- **Left:** each feed event reads the whole project list again. Reading only on `personal.note_carried`/`personal.note_taken_back` needs the frames' type here.

## Evidence

The machine was free; every run went through the guard at its default floor.

- **Browser:** `personal-carry.spec.ts`, `project-carried-in.spec.ts`, `personal.spec.ts`, `signin.spec.ts` and `home.spec.ts`, all passing (106 and 60 across two runs, then 24 after the last fix).
- **Unit:** `escape-layers.test.ts` and `signed-in.test.ts`.
- **Mutations:** 9 of 9 killed, and the controls survive:
  - the account ignored mid-carry;
  - the package holding Escape like any layer;
  - not read again as the feed moves;
  - a later failure said nowhere with a list read;
  - a project past the list said empty;
  - Try again never saying it is reading;
  - its place not kept while read;
  - priority ignored (unit);
  - any account counted as still in (unit).
- **Gates:** `tsc`, `oxlint --type-aware` and Prettier pass.

**Source-register IDs consulted:** none.

## Remaining obligations

- Reading the project list only on the carry events, when the feed's frames carry their type to the Studio.

## Next bounded action

#136's Codex P1 (a class name shared with the header's connection status), then the conversations' follow-ups.
