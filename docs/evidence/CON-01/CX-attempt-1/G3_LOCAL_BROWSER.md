# Independent real-local browser evidence

Candidate `839fb45b378a4f22517e4bf940372c6734f558ef`, tree `fcf069e806d2ca852c2b76855f81f7731e13d708`. Two independently owned runs on 2026-10-09, 21:36–21:52 UTC. Node24.21.0, PostgreSQL17.6; actual `apps/api/src/server.ts` and actual Vite Studio, with `VITE_SOPHIA_CONVERSATIONS=1`, VISION unset. Generated synthetic JWTs and disposable test databases; no fixtures, execution host, worker, native session or provider.

| Actual browser action | Observed result |
|---|---|
| Editor starts two conversations with Ask unchecked | Separate durable messages, actor/conversation ids and sequences in the first database audit |
| Type a draft in the first, start/select the second, return | First draft retained; second field empty; subsequent Send stays in the first |
| Reload | Saved conversation and messages return |
| 1440×900 / 1000×800 / 390×844 | 300/840/300 desktop panes; compact Context takes focus and Escape returns it; mobile list/back navigation and human Send work |
| Own Withdraw → Keep it | Confirmation explains shared irreversible removal; Keep it returns focus to its press |
| Own Withdraw → Withdraw; admin Remove → Remove | Body becomes NULL and a withdrawn tombstone appears; both drop focus to BODY (CX8, failed) |
| Viewer reads the same project | Editor's actual synthetic identity attributed; no New, composer, Propose or removal controls |
| Nonmember opens known project/conversation URL | “No access to this project”; no message body |
| Explicit Propose as decision → Propose → Accept | Separate accepted A08 constraint, revision2; visible in another open member tab; no work admitted |
| Existing open member tab after admin removal | Withdrawn tombstone replaces the removed text through normal reads |
| Ask checked, Send while G2 unavailable | Real request state `blocked`, reason `replies_not_enabled`; visible blocked notice; no native/operational record |
| Context help | Names own-conversation/current-project inputs and excludes other conversations/personal/room text |
| Response-body-loss proxy, one human Send | Actual API202 fully received but body withheld once; incomplete JSON reaches UI; “Not confirmed” retains held intent; Send retries and clears it |
| Read durable records after retry | Exactly one send key, one message, exact destination; no operational records |
| Replace owned API process, same DB/auth, reload during outage | Unreachable notice; Try again recovers messages but fails to recover membership/editor controls (CX10, failed); full reload restores them |
| Compare durable records before/after API replacement | Message objects, request objects and operational counts exactly equal |

First run: [database audit](g3-839fb45b-browser-db-audit.json), [process/cleanup receipt](g3-839fb45b-browser-stack-receipt.json), [database/children cleanup](g3-839fb45b-browser-stack-cleanup.json). Second run: [lost Send receipt](g3-recovery-839-lost-send-receipt.json), [before](g3-recovery-839-before-restart-db-audit.json), [after](g3-recovery-839-browser-db-audit.json), [API replacement](g3-recovery-839-api-restart-receipt.json), [forced local stop note](g3-recovery-839-restart-stop-note.json), [process receipt](g3-recovery-839-browser-stack-receipt.json), [cleanup](g3-recovery-839-browser-stack-cleanup.json). Both wrappers exit0, stop their owned PostgreSQL servers, remove their owned clusters and drop only their disposable databases. Browser tabs closed and viewport override reset.

The screenshots captured through the browser tool show the actual desktop/mobile views; they are visual observations, not a substitute for these records or hosted acceptance. No screenshot is asserted as an independently replayable native answer.

## Reproducing this bounded local harness

[g3-browser-stack.py](g3-browser-stack.py) and [g3-browser-stack.mjs](g3-browser-stack.mjs) are reviewer test infrastructure, not feature code. Set `CON01_CANDIDATE_ROOT` to a frozen candidate checkout, `CON01_PG_BIN` to an installed PostgreSQL17.6 binary directory and `CON01_JOURNAL` to a fresh private external directory; run the Python wrapper. It chooses loopback ports, creates a new cluster, launches the actual API/Studio, exposes only synthetic development accounts and records exact candidate/tree. Inspect `browser-stack-receipt.json` for the local Studio URL and use the browser normally. Never reuse this harness against a hosted database.

The wrapper is finite (30 minutes, outer deadline1900s) and stops only its owned processes/database. Create `drop-next-send` in its private journal to withhold the next `/api/v1/conversations/<id>/messages` POST's response body, after the actual API responds. Create `restart-api` to replace only the owned API using unchanged DB/auth configuration. A five-second graceful-stop fallback is explicit in the reusable harness; the recorded run instead used an independently verified manual SIGKILL of its owned PID after SIGTERM stalled. Create `browser-stop` for cleanup. Run [g3-browser-db-audit.mjs](g3-browser-db-audit.mjs) from the candidate root with the same journal env to inspect synthetic records without printing connection credentials.

Do not switch source while this stack is running. These checks do not qualify useful quick answers, native correlation/restart, coverage derived from real inference, two authorized hosted accounts, provider spending/retention, runtime erasure or production rollback. Those remain pending in the full acceptance ledger.
