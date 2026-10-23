# Implementation-session handoff

Goal and attempt: FND-B90-TASK-APPAUTH-CROSSING-01, attempt 1. This follows B87's PARTIAL `bce353fd`.
Executor: Claude Code lane B (runtime `60d65501-d779-4a4c-80e8-89485d10c86e`); packet sha256 `12a087bb…`.
Branch: `fix/task-visible-dedup-20261020-b87` in `/Users/davidelaverga/Documents/Codex/2026-10-16/sophia-human-tasks`.
Not pushed.

## The App-auth session failures: not reproduced, cause unknown, no fixture change

As R2-B87 corrects: in B87's run (log 44), three cases stopped at 0 conversation rows and two at a missing connection
pill, all during startup and before any expiry. That run came right after a 6.4-minute Task and press batch, and its
error contexts were overwritten. Here, on the unchanged head with unique outputs and traces:

- the single case 1092 passes (B90-logs/10-11);
- B87's exact five-case run (`-g "session ·"`) passes 5/5 (20-21).

R2 also found no source path by which the Task fixture swallows the conversation or event reads. Without a failing
witness there is no proved fixture defect, so no fixture correction is made. The B87 failure stays recorded, with its
cause unknown. Non-reproduction is not proof of a cause.

## Served dedup regression (behavioral)

`e2e-served/human-tasks-served.spec.ts`, new case: the page's fetch answers the project's task list with two strict
A39 pages, task X open (revision 1) on page 1 and done (revision 2) on page 2. Everything else is the real API. After
More tasks, X shows once and there are 2 rows.

- Fixed: PASS (51).
- With 965's `ProjectTasks.tsx` (the flat projection), the same test bytes FAIL: X shows twice, expected 1, received
  2 (53). The file was restored byte-identical.
- My first pair (41, 43) failed in my own setup at the Brief button: the dev identity wasn't set. I added the line the
  existing served cases use; it is not a product result.

## Real-API Task episode

Own fresh PG17 on 55501, a synthetic dev-db seed (private, not printed), the real API on 5199 and Vite on 5198 with
Tasks on, full Chromium, 1 worker, retries 0, traces on. The existing 4 served journeys pass 4/4 on this composition
with the new Main client (34). The whole file, those 4 plus the dedup case, passes 5/5 (64).

Static: prettier, oxlint and Studio typecheck: 0.
