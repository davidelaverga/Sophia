# Implementation-session handoff

Goal and attempt: FND-B80-PERSONAL-STALE-ADMISSION-01, attempt 1. This is one focused correction of the stale-runner
boundary that C55 found and R confirmed (R-C55-FAULT-DISPOSITION-01).
Human owner / executor resource: Davide (assignment relayed from P; packet sha256 `c023bd47…`) / Claude Code lane B
(runtime `60d65501-d779-4a4c-80e8-89485d10c86e`).
Starting worktree/commit: `/Users/davidelaverga/Documents/Codex/2026-10-16/sophia-personal-live`, new branch
`fix/personal-stale-admission-20261019-b80`, from ADC `adc7274d`. C55's test-only `c3b4ac50` was carried in by fast-forward,
so its failing head stays in this branch's history.
Runtime unit: macOS host, Node 24.21.0, pnpm 11.7.0, B's own PostgreSQL 17 on 127.0.0.1:55498 (fresh disposable
clusters), the loopback provider double with a fake key. No provider, Auth, production, push or spend.

## The defect (C55 control 5, reproduced here on c3b4 before any change)

Runner 1 is held at its reservation while its claim renewals fail. Its claim lapses, and runner 2 retries, asks the
provider, settles, writes the reply and deletes the kept answer. Runner 1 is then released. `reserve_personal_answer`
checked only two things: whether a kept row exists, and whether the person turn exists. So it answered `reserved`;
the provider was asked a second time, and two costs were settled (`["settled","settled"]`).

## The correction

- 0078 (unpublished, same allocation): `reserve_personal_answer` takes the attempt's claim as a sixth argument. It
  reserves only while the turn is `pending` under that claim, the same rule `record_personal_reply` uses to write the
  reply. Otherwise it returns `not_current`, and nothing is reserved, asked or settled. A kept answer still comes back
  first as `kept`. Grants and revokes now name the new signature.
- `personal-usage.ts`: `reservePersonalAnswer` passes `call.claim`.
- `companion-live.ts`: `LiveCall.reserve` passes the call's claim, and refuses `not_current` before reserving when no
  claim is present. The runner already passed its claim (`companion.ts` is unchanged).

0021, 0073, contracts, the lockfile and the UI are unchanged. Live mode still defaults to off. A42 and new names were not used.

## Evidence (journal `B80-logs/`)

- Old FAIL, on c3b4 (21): `no second provider request` actual 2, expected 1; runner 1's reservation was `reserved`;
  costs `["settled","settled"]`.
- Fixed (31): the whole `personal-live.db.test.ts` passes 22/22. That covers the 18 earlier cases (erasure, normal
  retry first, claim moved, twice-paid, another owner) and C55's 4 cases. In C55 control 5, the stale runner now asks
  nothing more and pays nothing more.
- Keyless rehearsal on old SQL with 0078 moved aside (40): `personal.db.test.ts` 28/28. 0078 was restored
  byte-identical (41).
- `test:sql` on a fresh cluster (52): 76 migrations, 5 files pass. Full `test:db` (61): see the journal result.
- Static: root oxlint type-aware 0; prettier 0; api and persistence typecheck 0.

## Limits

- C55's timing limit carries over unchanged: its fixture shortens the 2-minute lease while the 60 s answer limit keeps
  running, so the episode lasts about 5 s and is not a literal 2-minute stall. This fix closes the admission whatever
  the timing, but no real-provider billing or wire-level pause was exercised.
- A runner that has already reserved and is still waiting on the provider when its claim moves is not refused by this
  check. That is the existing settlement and claim-fenced write path, and it is not changed here.
- Not run here: browser checks, Linux, CI.
