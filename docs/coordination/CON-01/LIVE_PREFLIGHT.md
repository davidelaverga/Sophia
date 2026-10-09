# CON-01 live preflight — read-only, 2026-10-09

These observations are not a CON-01 deployment or acceptance. Public app and provider dashboards were operated through the browser. No deployment, configuration, database row, account or provider grant was changed.

| Component | Fresh observation | Limit |
|---|---|---|
| Studio | Vercel `sophia-30911edf/sophia-studio`, production `dpl_2ocnSuyh2Pbmvwf7RLtnj4upEyT1`, Ready, created Oct 5 2026 at 14:13:31 GMT+2; manually uploaded (`vercel deploy`), Git not connected | Dashboard does not establish the source SHA or build/config digests |
| Studio aliases | `studio.sophia-ei.com`, `sophia-studio.vercel.app`; unique `sophia-studio-fs4nbv0je-sophia-30911edf.vercel.app` | Alias/deployment identity only |
| Actual Studio browser | `https://sophia-studio.vercel.app/` reached; sign-in screen. Entries `/entry.js`, `/assets/index-Co8mKwC4.js`; styles `/entry.css`, `/assets/index-CULuBOYK.css` | No designated signed-in subject, project or CON-01 endpoint exercised |
| API | Render `sophia-next-api`, `srv-daqrn08473hc73flhi8g`, Live `dep-db0h6jad0e5s73bkine0`, successful source `1e912b7ec83e55694de33d9ced1e4c8d915db4d6`, free tier; public origin `https://sophia-next-api.onrender.com` | Runtime process/config/artifact digests not observed; health/ready contain no SHA |
| Native host | Render `sophia-next-runtime`, `srv-darvmse0tbcc73d8kh3g`, Live `dep-db02hcou01pc738k4atg`, successful source `6ec64f36aae1fe60dfd4d54a21f861901ba7d630`, 0.5c/512mb | Installed profile, process unit, composition and journal state not proven by a deploy label |
| Worker | Render `sophia-next-worker`, `srv-darv7snpn0mc73e6c240`, Live `dep-dasrio7pn0mc739nnetg`, successful source `0391bc66b8dc47f4268b6f785e11de182ff5d7e0`, 0.5c/512mb | Current outstanding work must be reconciled before a cutover |
| Media bridge | Render `sophia-next-bridge`, `srv-darvcigu01pc73e24o4g`, Live `dep-db0h7rc9v7es73bed57g`, successful source `1e912b7ec83e55694de33d9ced1e4c8d915db4d6`, 0.5c/512mb | No media/voice probe performed; retain the other mission's configuration |
| Database | Read-only metadata at `2026-10-09T20:17:14.172Z`: PostgreSQL 17.6, ledger 0001–0036, no checksum drift against main. Pending main 0037–0045 | Owner connection used only for metadata; it is not application authorization proof |
| Runtime database state | Six `running` bindings on `sophia-runtime-m03-dev`; active m02/m03/s1-03 readiness rows | Historical status rows do not establish live sessions, safe drain, or permission to stop them |

Browser dashboard observations occurred approximately 20:25–20:28 UTC. The prior WBC-02 packet's four service identities were independently confirmed, rather than treating that packet as deployment authority. Auto-deploy Off was documented there on Oct 8 but was not freshly inspected in Settings here. No environment-value panels or provider secrets were opened.

## Actual operation process and unresolved preconditions

The installed execution working protocol requires an exact operation JSON, owner approval, then operator execution/receipts. Nulls mean not authorized. The repo migration mechanism is `pnpm db:migrate`, with the real target/owner credential supplied privately; it is not executable for CON-01 before the reviewed migration set and batch are bound. API/worker/bridge deployments use their existing Render services. Studio is built and uploaded by hand; a Git merge does not deploy it. The native host has an existing in-place profile reconciliation path; do not install a second live stack or rerun an old release batch.

Draft [OP-0001-r1](CON-01-OP-0001-r1.json) deliberately retains null candidate, credential, approval, allowance and expiry fields. The step ordering is a preparation outline until the exact combined candidate's compatibility map exists. The presently deployed ledger is substantially behind main: applying only CON-01 SQL is not a safe inferred action.

The exact test project, two authorized subjects/roles, denied target, policy acceptance (including operational native-copy cleanup), selected provider route/credential reference/payer/finite allowance/expiry and scoped live effect approval remain missing. The user has been asked for these facts; no time-based assumption substitutes for them. Browser tooling works, so the current blocker is not lack of a browser. Actual-app case A30 and pack 08 steps 1–10 remain unexecuted.

The other mission's operator must acknowledge the current live/uncertain work and exact cutover window. No token, account or privilege is borrowed from that mission, and no stale production batch is replayed. Rollback must retain qualified read/erase/control/reconciliation paths and governed data; old service versions are historical recovery candidates, not yet proven compatible with CON-01 data.
