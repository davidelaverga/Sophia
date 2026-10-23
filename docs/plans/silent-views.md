# Tasks says when its board can't be read, and «Since you last looked» comes back by itself

> 2026-10-19 · R2, from R1's measurement (`evaluacion-2026-10-19/fiabilidad/medicion-despues.md`, M6 and M7) on the
> reliability baseline's gaps #4, «lecturas que degradan a vacío en silencio», and #2, 502/503 without a contract body
> not retried (`linea-base.md` §1.1, §4, §5); Luis 2026-10-19: «quisiera trabajar en la fiabilidad y resiliencia. Ahí
> tendríamos que también medir. Lo que no se mide, no se puede mejorar» and «Arranca R2 en paralelo». Studio only; no
> API change.

## What was measured

**M6 · the Studio view: already says something true. Left as it is.** The sweep (`reads.spec.ts`) fails the brief
(`/mission`) and the replies (`/discussion/replies`) as the room opens, then reads the room with its side panel
closed. Each read was followed in the code and opened in a browser with the same failures (the sweep's probe, a
scratch check through the guard, not kept):

| Read | Where it shows | What a failure leaves |
|---|---|---|
| the brief, on the stage (`useFirstStep`) | a new project's first line | the line isn't guessed: «The room is ready», as for any project (`isNew`: «Unread, it is not called new») |
| the brief, in its panel (`MissionPanel`) | the Brief panel | «The mission couldn’t be read just now.» |
| the replies (`useReplies`) | the Chat panel, under the messages | «Replies didn’t load, so messages show without what they answer.» with Try again; with no messages nothing is said, and nothing needs to be |

Both panels stay mounted while hidden (`SidePanel`), so the lines are there when a panel opens; the stage says
nothing that the failure makes false. The sweep counts the Studio silent because it reads only the closed room, where
neither read is shown. Its number does not move.

**M6 · the Tasks view: silent and misleading. Changed.** Its reads: the served board (`/plans`, `useBoard` in
`ServedWork.tsx`), the members who name the board's people (`/members`, `useMembersNamed`) and the source-review pilot
(`/plans/source-review`, `ReviewSources`).

- The board's read gives `view: null` once its tries are over, so `plans` is undefined, exactly as for a project with
  no plan. Tasks then shows each goal alone, the goals' count where the search goes, and no board: the demo, which
  serves a board for its goals, reads as if none had a plan (red run below).
- The members: without them the board names people generically; with the board unread there is nothing to name.
  Decorative.
- Review sources: judged decorative in `silent-reads.md` (the entry isn't drawn; nothing says it isn't offered).

**M7 · «Since you last looked» doesn't come back after a passing failure.** `SinceYouLooked` sets `retry: false`. It came
with the view (#116, 35d8169f6) with no reason given in its note or handoff. The reason that holds today came later
(#391, R-391-UPDATES-01): «since» is a `doorRead`, whose 401 or 403 is raised at once from the status, and the view
keeps that refusal as its read learns it (`sinceRefusedNow`). `callApi` gives that refusal `retry: 'safe_read'` (a
read's unanswered rule), so the app's `retryRead` would ask a refusal three more times and say it only after the
waits (1, 2 and 4 s). Not retrying a refusal still holds; not retrying anything else doesn't: after R1, a proxy's
502/503 page is `safe_read`, retried by every other read, and only this one gives up on the first.

## What changes

- **Tasks says an unread board in place**, in the area's words and idiom (GoalsOverview's «The dates can’t be read
  right now…», the sheet's «The owner and date can’t be read right now.»): «The tasks can’t be read right now.» with a
  text-button Try again, as an alert, under the view's head. Only while no board was ever read: a board read once and
  failing later stays on screen (TanStack keeps a query's data through a failed refetch of the same key), as the
  overview keeps its dates. `useBoard` says it (`failed`, and `retry`); `ServedWork` and the shell carry it to
  `GoalList`, which draws it in Tasks only.
- **«Since» is retried as other reads are, a refusal still not**: `retry: (failures, error) => !closedDoor(error) &&
  retryRead(failures, error)`. `retryRead` (account-cache.ts) already stops at an API refusal marked `retry: never`;
  `closedDoor` (project-door.ts) stops at the door's 401 and 403 whatever `retry` they carry.

## Checks (written first)

- `e2e/board-robust.spec.ts`, with a new lever `boardRead=fail` / `window.fixture.failBoard` (each refusal recorded as
  `board-refused`), beside `holdBoard`:
  - the demo's Tasks with its board failing says «The tasks can’t be read right now.» as an alert and draws no board;
    Try again, answered, brings the boards back;
  - a board read, then failing four times after the project moves (`fixture.say`), stays, with no alert (green before
    and after: it fences the fix to the first read).
- `e2e/app-auth.spec.ts`, the real App on 5198 with `work=lost`, the measuring suite's transient scenario (its probe,
  `e2e/reliability/measure.ts`): «since» answered by a proxy's 503 page twice, then 200, shows the window with nothing
  pressed and no alert.
- `e2e/updates-refusal.spec.ts`: a refused «since» (401, 403) is said and not asked again past TanStack's first wait
  (green before and after: it keeps the reason `retry: false` stood for).
- Neighbours: `updates-refusal`, the Updates specs (`room-updates`, `updates-*`), `search-goals`, `task-links`,
  `work`, `targets-robust`, `goal-owner-date`, `views-goals`.
- After both: the measuring suite's `reads.spec.ts` and `transient.spec.ts` on this branch, through the guard, and
  `node scripts/reliability-report.mjs --fixture` (reliability-measure.md).

## Limits

- The project's search reads the same board (`boardReading`). With the board failed, it is no longer «reading», so a
  search may answer «nothing» for tasks it couldn't read. Outside this change; a candidate for the same line in the
  search sheet.
- ~~A board the reader refuses (`readBoardView` not ok, or another project's) still shows the goals alone, as its file
  says on purpose: that is a refusal of the board's shape, not a failed read.~~ Changed below (a refused board is a
  failed read).
- Goals reads the same board for its overview's glances; with it failed the overview shows the goals without them.
  The sweep already counts Goals visible (its dates line); the board there is outside this change.
- The brief's «The mission couldn’t be read just now.» has no Try again; it reads again as the project moves. True
  words, so left as they are; a candidate for the area's Try again in its own change.

## A board the reader refuses is a failed read too

> 2026-10-19 · Codex P2 on #472 (`ServedWork.tsx:71`, the last entry of `evaluacion-2026-10-16/seguimientos-p2.md`);
> Luis 2026-10-20: «Procede con el próximo lote y arregla tú los de Davide», and «Lo que no se mide, no se puede
> mejorar». Studio only; no API change.

**What the code does (checked).** `readBoard` (`api/work.ts`) passes the reply through untouched (`(value) => value`),
so a 200 is always a success to the query; `useBoard` runs the board's reader (`readBoardView`) and the project check
afterwards, in a `useMemo`. A reply the reader refuses, or another project's board, gives `view: null` with
`board.data` defined and `board.isError` false: `failed` (`enabled && data === undefined && isError`) stays false,
`plans` is undefined, and Tasks shows each goal alone with no line and no Try again, exactly what the change above set
out to stop. Worse, a refused reply after a board was read replaces the query's data, so the boards on screen vanish,
unsaid, while a transport failure would have kept them.

**The sibling reads don't have it.** The members (`getProjectMembers`, `parseProjectMembers`) and the source-review
pilot (`reviewAvailability`, `parseSourceReviewAvailability`) parse inside the call: `callApi`'s `readBody` turns a
reply its parser refuses into `ApiError` `contract_violation`, with the call's own `retry`, so their queries fail as for
a lost reply. Neither reply names its project, so there is no other project's answer to take for this one. What they
do once failed stays as judged above (decorative); neither says «none» falsely. No change.

**What changes.** The board joins them: `readBoard` takes the reader as its parser, and `useBoard` gives it one that
refuses another project's board as the reader refuses a bad shape (`servedBoard`). A refused reply is then the call's
`contract_violation`: asked again as any read (`retryRead`, three more times), said with the same «The tasks can’t be
read right now.» and Try again once none was read, and, after a board was read, the board stays, as TanStack keeps a
query's data through a failed fetch. The query's data is the accepted board, so `useBoard`'s `useMemo` goes.

**Checks (written first).** `e2e/board-robust.spec.ts`, with a lever beside `failBoard`: `boardRead=malformed` /
`boardRead=foreign`, `window.fixture.answerBoard(kind | null)`, each such reply recorded (`board-answered:<kind>`):

- the demo's Tasks with `/plans` answering a board the reader refuses says the line as an alert and draws no board;
  Try again, answered rightly, brings the boards back;
- the same with another project's board, whole and well formed (no goals), refused by the project check alone;
- a board read, then answered with a refused board at the project's moves, stays, with no alert.

**After review: a refusal of the reader isn't asked again at once.** Retried, a refused board meant four requests at
each read while it lasted (the half-minute look, each move of the project, Try again), and seven seconds of
«reading» before the line, for a reply that refuses the same on every try. The board's query keeps the shared rule for
everything else and adds one exception: `retry: (failures, error) => !readerRefused(error) && retryRead(failures,
error)`, where `readerRefused` is the `contract_violation` whose cause is `servedBoard`'s own refusal
(`BoardRefused`). A reply that isn't JSON at all (a truncated body, a portal's page answered 200) is still
`contract_violation` and still retried: it can heal by asking. Checked first in `board-robust.spec.ts`: a board read,
then refused at two moves, asks once per move (none more past TanStack's first wait) and stays, unsaid.

Neighbours as above (`search-goals`, `task-links`, `targets-robust`, `goal-owner-date`, `views-goals`,
`goals-overview`, `decision-alert`, `board-why`, `work`); unit `features/work/planning`.

**Limits.**

- ~~A refused board is now retried three times before the line shows (1, 2 and 4 s), as every parsed read's
  `contract_violation` is.~~ Changed after review (above): a refusal of the reader is asked once per read.
- **A board kept says nothing of its age.** A board read once stays through later failures, transport or refusal, with
  its controls live and no line. A refusal for good (the API's board ahead of this Studio's reader, a version skew)
  now leaves the last accepted board on screen indefinitely, while every new read is refused unsaid. A known
  trade-off, taken over blanking a board the person may be working from; the follow-up is an «as of …» line on a
  board kept past a failed read (its `observed_at` is already there), and, for a refusal that lasts, the same «can’t
  be read» words beside it. No new UI in this change.
