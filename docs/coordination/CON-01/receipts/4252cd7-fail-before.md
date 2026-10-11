# Receipt · fail-before for CON-01-CC-0026 at `4252cd7`

These are development runs, in `/home/user/sophia-dev`, not gates. `4252cd7`'s gate is its own receipt.

| Item | Value |
|---|---|
| Specs and fixture | `4252cd74bca0ed18bc190d8832e98c75a920c7bf` (tree `9afcad10deb23f3f714bdeea09ad4df596f85d09`) |
| Browser driver | `cc26-failbefore-browser.sh`, 2026-10-10 03:18:59 to 03:20:26 UTC. Each earlier `apps/studio/src` ran under `4252cd7`'s specs and fixture and was put back afterwards. The driver recorded `clean=0` before and after; the dev worktree was not touched while it ran. |
| Cases | Desktop only, the same 7 as [CC-0025's](74a697b-fail-before.md) |

## Browser

| Source | Exit | Passed | Failed |
|---|---|---|---|
| `7969d40a` | 1 | 5 | 2: the CX-0028 late list answer, and the failing list's notice |
| `74a697b7` | 0 | 7 | 0 |
| `4252cd74` | 0 | 7 | 0 |

The late-list case now also expects the row to keep «Lucía, You · Sophia»: the pages read still show your words and Sophia's answer. That is a positive, and it holds at `74a697b` too, because `74a697b` never took a writer away. **So the browser run is no fail-before for r4236040713.** Its fail-before is the unit below.

## Units

- **`conversation-list.test.ts` with `74a697b`'s `conversation-list.ts`: exit 1.**
  - 1 of 57 fails: «seen after the list read set out: Bo and Sophia's part go with the opening; you stay».
  - Its negatives pass on both sources: seen before the read set out, and a withdrawal older than a message the row knows of.
- **`withdrawn-purge.test.ts`: 10 cases at `4252cd7`** on a real `QueryClient`:
  - the late snapshot loses Bo and Sophia's part and keeps Ana;
  - a list read that set out after the sight stays as the API said it;
  - a withdrawal older than the row's `lastAt` stays;
  - a writer whose words the pages read show stays;
  - plus CC-0025's six.
  - These need `listReadSetsOut`, so they don't load against `74a697b`.

## Not claimed

- No phone fail-before.
- No actual app.
- No `pnpm check`.
- No gate from these runs.

## Raw logs

They are in the implementer's container only:
- `cc26-fb.exit`
- `cc26-fb-7969d40a.log`, `cc26-fb-74a697b7.log`, `cc26-fb-4252cd74.log`
- `cc26-fb-units-74a6.log`
- `cc26-checks.exit`
