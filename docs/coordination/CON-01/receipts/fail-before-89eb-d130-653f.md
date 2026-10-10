# Receipt · fail-before runs for `89eb193`, `d13029c`, `653fe9a` and their correction at `1f49c4f`

The browser cases written while `a3422f4`'s gate held the fixture server ran once it ended. They ran in the development
worktree (`/home/user/sophia-dev`), never in the gate's. They are development runs, not gates.

## The development runs at the head that carries them

| Run | Source | Spec files | Exit | Counts |
|---|---|---|---|---|
| 1 | `653fe9a` plus the uncommitted corrections later committed as `1f49c4f` (StrictMode, the tie revert), before `keepsFor` | removal, panes, writes | **1** | 69 passed, **2 failed** |
| 2 | `1f49c4f`'s content (the same plus value-based `keepsFor` and the two expectations below) | the same | **0** | 71 passed |

Run 1's two failures were expectations, changed in `1f49c4f`:
- **`conversations-removal.spec.ts:260`.** It asserted that nothing says «erased» for a lost erasure reply under a capped list. With the probe, the direct read's 422 `not_found` proves the erasure, and the list says it.
  - The case now waits for that recorded proof (`messages-gone:c1`) before it expects the words.
  - The negative stays covered: the `capPast` case (a 200 means older: draft and key kept, nothing said) and the unavailable-read case.
- **`conversations-removal.spec.ts:449`.** It waited for `reply` records to equal `['reply:message']`, but the withdrawal's own receipt (`reply:withdrawal`) came first.
  - It now waits for `reply:message` itself.
  - Its after-receipt assertions are unchanged: the words nowhere, and the thread still says withdrawn.

## Fail-before

Each run took an earlier `apps/studio/src` under `1f49c4f`'s tests and fixture, in the development worktree, and put `1f49c4f`'s back afterwards. All desktop.

| Cases | Earlier source | Exit | Result | Why, as it failed |
|---|---|---|---|---|
| Lost erasure reply, capped; erased elsewhere, capped; older then erased, list unchanged | `653fe9a8` | 1 | 3 of 3 failed | No notice, and both drafts kept: StrictMode had closed the probes, so no direct read ran |
| Erased while a send is on its way (`send=lostSlow`, `send=slow`) | `a3422f48` | 1 | 2 of 2 failed | The erased conversation's state was written back by the send's late answer |
| Withdrawn while its send's receipt is on its way, every read failing | `89eb193b` | 1 | 1 of 1 failed | The withdrawn words were on the page again (count 1) |

## Not claimed

No gate of `1f49c4f` or of any head after it, no `pnpm check`, no real API.
