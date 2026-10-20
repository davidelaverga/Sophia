# Implementation-session handoff

Goal and attempt: RELIABILITY-MEASURE-SESSION-AND-HELD (the R2 measurement's «Pendiente de medir»,
`evaluacion-2026-10-19/fiabilidad/medicion-r2.md`: M8 and «held kept across a reload» as numbers; lote R3), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-6`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-6`, branch `reliability/measure-session-and-held` from
`origin/main` `9a6b03a73` (#470, #471, #472 merged)
Writable scope: this worktree only (`scripts/`, `tests/unit/`, `apps/studio/e2e/reliability/`, `docs/plans`,
`docs/handoffs`); no Studio, fixture or API code.
Runtime unit: Luis's Windows host (Playwright through the session's `pw.ps1` / `measure.ps1` and
`.claude-guards/safe-run.ps1`, two workers).
Existing authority: Luis 2026-10-20, «Procede con el próximo lote y arregla tú los de Davide»; earlier «Lo que no se
mide, no se puede mejorar». Local only, nothing pushed.
Ending commit/tree: the branch's last commit; code last changed at `97a096321` (`fc3ef5e16` before the review). Against `9a6b03a73`:
`scripts/reliability-report.mjs`, `scripts/lib/reliability.mjs`, `tests/unit/reliability-report.test.mjs`,
`apps/studio/e2e/reliability/writes.spec.ts`, `apps/studio/e2e/reliability/session.spec.ts` (new),
`docs/plans/reliability-measure.md` (section «M8 and M2 across a reload»), this record.

## Outcome

- **M8 is measured**, no longer «not measurable»: per kind (read, write, feed), renewed without «You’ve been signed
  out», the refused request sent again (a write under its key), one refresh, p50/p95 of the time to answer.
- **M2 counts a message kept across a reload** on its own line: offered again, resent once under the same key, written
  twice, press → answer. M2's first line keeps counting only what it always counted, so it stays comparable.
- **Honesty kept:** M8 is a fixture metric for the completeness count; a partial run gives «incomplete: n of N»
  instead of its rows and exits 1.

## Evidence

- **Checked against the code first:** `NOT_YET` still held M8 «needs an expired-token lever (R1 gap 3)»; R2's levers
  are `appFixture.expireToken()`/`dropStream()` with `refused`/`keys`/`asked` (`fixtures/app.tsx`). The renewing
  Auth is not a fixture lever: each check answers it with its own route (`renewing`, `app-auth.spec.ts`), so
  `session.spec.ts` does too. `writes.spec.ts` never reloaded.
- **Written first** (`a6dd1dc0f`): 4 of 24 unit checks red on their assertions (run against a one-line
  `summarizeM8 = () => ({})` stub, not committed, since the missing export stops the file loading): M2's summary
  lacking `reload`; the reload samples counted in M2's first line (`actual n: 4, expected n: 1`); M8 `actual {}`;
  the script «the script exits non-zero» (M8 not yet a fixture metric). Fixed in `706944103`: 24/24.
- **Scenarios** (`fc3ef5e16`), first runs through the guard (`pw-logs/p6-m8-try1.txt`, `p6-m8-try4.txt`): the first
  showed the conversation message «not offered» after the reload; cause in the probe, not the product: the message the
  service holds again moves Briefs to the top, so `nth(1)` opened another conversation. Now opened by its title: 3/3
  offered.
- **The whole measuring suite** through `measure.ps1` (`pw-logs/p6-measure-full.txt`, out
  `scratchpad/measure-p6-m8-held/`): 34/34 scenarios in 3.7 min, report exit 0, nothing incomplete.

| Metric | Value |
| --- | --- |
| M8 · read | 3/3 renewed without «signed out» · 3/3 sent again · 3/3 one refresh · p50 37 ms · p95 43 ms |
| M8 · write | 3/3 renewed · 3/3 sent again under one key · 3/3 one refresh · p50 76 ms · p95 85 ms |
| M8 · feed | 3/3 renewed (via «Reconnecting») · 3/3 sent again · 3/3 one refresh · p50 120 ms · p95 708 ms |
| M2 · kept across a reload | 6/6 offered again · 6/6 resent once under the same key · written twice 0 · p50 9 ms |
| M2 · first line (unchanged) | 5/5 resolved · written twice 0 · p50 26 ms |

  The rest, for reference, as R2: M1 15/15 (overhead p50 23 ms), M6 6 visible / 10 silent, M7 6/6, M3 drop p50
  1,059 ms, silenced 25.9 s, network back 38 ms, M4 61 ms.
- `node --test tests/unit/reliability-report.test.mjs` 24/24; `oxlint --type-aware .` clean; `tsc --noEmit -p
  apps/studio` clean; Prettier clean on every touched file.

## Decisions and changes

- **A round is renewed only if the lever met a request** (`reached`): a screen that looks right with nothing refused
  is not a renewal. `resent`: every refused `METHOD path` asked again and not refused; a POST's tries under one key.
- **A new tab per M8 round**, so the renewal's «no loop» memory (a renewed token refused within a minute isn't renewed
  again) never carries from one round to the next; a fresh tab's storage per M2 reload round, so each starts with an
  empty journal.
- **The feed's clock** starts in the page as the lever is pulled and stops when the pill leaves «Up to date» and comes
  back; each sample keeps the pill's states (`via`).
- M2's reload samples carry `afterReload` and are summarized apart (`reload`); one completeness count for M2.

## Remaining obligations

- The feed: one round of three took 774 ms, two 109–120 ms. That the quick ones skip the backoff because the loop
  restarts on the new token is an inference from `useProjectFeed` (token in the effect's dependencies), not timed
  apart.
- M5 and M9 stay unmeasured. Only messages are kept across a reload (the held-on-reload note's limit), so only they are
  counted.

## Next bounded action

- Luis: say when to push (with the next group PR); merge on green with no open P1.
- Source IDs consulted: none from the source register; this repository and the R2 measurement only.

## The independent review's P3s (no P1/P2)

Same branch, same rules; code last changed at `97a096321`.

- **Written first** (`25fbd36fd`): 5 of 25 red on their assertions (against a one-line `summarizeM2Reload` stub, not
  committed): M2's summary still carried `reload`; `summarizeM2Reload` `actual {}`; M8 `reached: 0` where the measured
  requests were refused; the script's M8 row; an M2r scenario that wrote nothing «the script exits non-zero». Removing
  `!s.signedOut` alone turned the M8 check red (`renewed: 3`, expected 2), as asked. Fixed in `cf519b5aa` (25/25).
- **What changed:**
  1. `reached` is the measured request: each round keeps the unique refused requests (`refused`); the report requires
     the conversation's messages read, the message's POST, or the feed's own request; `renewed` also requires at
     least one refresh.
  2. A renewed-looking round with «signed out» beside its answer is not renewed (unit case added).
  3. `refused`, `resent` and `refreshes` are read after `quiet(page)` (`f62918721`).
  4. M2r's resend time counts only rounds resolved by two tries under one key; its row says «resolved n/N».
  5. M2r is a metric of its own (titles `M2r · `, `FIXTURE_METRICS`, `scenarioCounts` reads `Mnr`), so a failed reload
     scenario leaves M2's comparable first line published (unit case on the fake suite).
  6. The clock and the sample hear the App's sign-out lines (`ended-notice.ts`) beside the project's.
  7. «one refresh» is counted over the renewed rounds («renewed with one refresh»).
- **One deviation, measured:** the review asked for the stream GET as the feed's request. The rerun
  (`pw-logs/p6-measure-p3-try6.txt`, code `f62918721`) showed the stream never met the expired token in any round:
  the project's snapshot (the feed's own read, `useProjectFeed`) and the archived list did, the snapshot was renewed
  with one refresh, and the stream went on the new token; the row read «0/3 renewed» for rounds where nothing failed.
  `app-auth.spec.ts` already accepts the stream or the snapshot. Test first (`44c6c81ad`), then (`97a096321`) the feed counts its
  stream or its snapshot; the archived list alone does not. Red: `feed reached: 1`, expected 2.
- **Rerun** at `97a096321` through `measure.ps1` (`pw-logs/p6-measure-final-try1.txt`, out
  `scratchpad/measure-p6-m8-held-p3-final/`; earlier tries stopped by the guard for memory or TCP, logs
  `p6-measure-p3*.txt`): 34/34, report exit 0, nothing incomplete.

| Metric | Value |
| --- | --- |
| M8 · read | 3/3 renewed · 3/3 sent again · 3/3 renewed with one refresh · p50 30 ms · p95 31 ms |
| M8 · write | 3/3 renewed · 3/3 sent again under one key · 3/3 renewed with one refresh · p50 62 ms · p95 63 ms |
| M8 · feed | 3/3 renewed (snapshot met, then the stream on the new token) · 3/3 sent again · 3/3 one refresh · p50 115 ms · p95 131 ms |
| M2r · kept across a reload | 6/6 offered again · 6/6 resent once under the same key · written twice 0 · resolved 6/6 · p50 7 ms |
| M2 · first line | 5/5 resolved · written twice 0 · p50 25 ms |

  No round asked a second refresh once the page went quiet. The rest as before: M1 15/15 (overhead p50 21 ms), M6 6 / 10,
  M7 6/6, M3 drop p50 827 ms, silenced 25.7 s, network back 20 ms, M4 60 ms.
