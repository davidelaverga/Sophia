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
Ending commit/tree: the branch's last commit; code last changed at `fc3ef5e16`. Against `9a6b03a73`:
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
