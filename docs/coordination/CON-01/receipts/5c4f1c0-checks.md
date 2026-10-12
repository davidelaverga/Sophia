# Receipt · `5c4f1c0`: a withdrawal leaves no question projection standing (PR #199 r4237222580)

These are development runs in `/home/user/sophia-dev`, not a gate. No full Studio gate and no `pnpm check` ran on this source.

| Item | Value |
|---|---|
| Source | `5c4f1c0c364158192cdaada9e4c8b59cfd903b16`, tree `7538608d142be778e5c94840407b1ab49cd1a074`, on `d92328da` |
| Change | `apps/studio/src/features/conversations/conversation-list.ts` and its test. `rowWithdrawn` returns `openQuestions` to `0` and `questionsCoverage` to `not_assessed`; `sameRow` compares both |
| Finding | The bot's P2 r4237222580 on `3c1158d`, reproduced independently by Codex (CX-0030, L0) on `b9815b1`/`4252cd7` |

## Checks (`cc27-checks.sh`, each exit from the shell)

| Run | Check | Exit | Counts |
|---|---|---|---|
| 1 (09:56–09:58 UTC) | format, lint, typecheck, `contracts:check`, Studio unit, contracts unit | 0 each | 1082/1082, 27/27 |
| 1 | PostgreSQL 16, persistence / API | **1 / 1** | `ECONNREFUSED 127.0.0.1:55432`: the container had restarted (up 25 min), which stopped the local cluster |
| 2 (09:58–09:59 UTC, the same tree, after `pg_ctl start`) | every step | 0 each | 1082/1082, 27/27, 19/19, 8/8 |

## Browser

| Run | Exit | Counts |
|---|---|---|
| Focused conversation set (the gate's five patterns), desktop and phone, on `d92328d` plus the two changed files (identical to `5c4f1c0`'s tree), 09:59:51 to 10:04:53 UTC | 0 | 160 passed |

## Fail-before

- `conversation-list.test.ts` with `4252cd7`'s `conversation-list.ts`: exit 1. 2 of 59 fail, exactly the two new cases:
  - «withdrawn here: its questions are not assessed any more, and none is counted open»;
  - «withdrawn elsewhere, the list read not knowing it: the same».
- The source was put back from `HEAD` afterwards, and `git status` showed 0 lines.
- No browser fail-before. The API sends no assessed questions before G2, so only the fixture could show this path.

## Not claimed

- No full Studio gate.
- No `pnpm check`.
- No real API.
- No phone fail-before.

## Raw logs

They are in the implementer's container only:
- `cc27-checks.exit` and `cc27-*.log`
- `cc27-focused.exit`, `cc27-focused.log`
- `cc27-fb-units-4252.log`
