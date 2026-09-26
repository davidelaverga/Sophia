# S1-05A release and production debugging

This covers the five processes that make Sophia's room voice and her briefs work, what each one needs, and how to follow a single conversation or brief through them when something fails. Values never go in this file, an issue or a transcript. Settings are named here; their values live in each platform's secret store.

## The five processes

| Process | Where | Start | Settings (names only) | How to tell it is up |
|---|---|---|---|---|
| API | Render web service `sophia-next-api` | `node apps/api/src/server.ts` | See the note below this table | `GET /health` means the process is alive. `GET /ready` means the database role is safe and the functions from migrations 0009–0014 exist |
| Studio | Vercel `sophia-studio` | `vite build` in `apps/studio` | `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | The room page loads and the snapshot request returns 200 |
| Worker | Render background worker `sophia-next-worker` | `node apps/worker/src/server.ts` | `SOPHIA_WORKER_DATABASE_URL`, a login granted `sophia_worker`; `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Logs `[sophia-worker] runtime dispatch started` |
| Media bridge | Render background worker `sophia-next-bridge`, **one instance** | `node apps/media-bridge/src/server.ts` | `SOPHIA_SERVICE_URL`, `SOPHIA_MEDIA_BRIDGE_TOKEN`, `GEMINI_API_KEY`, `SOPHIA_LIVE_MODEL` (`gemini-3.8-live`), `NODE_ENV=production`, optional `SOPHIA_BRIDGE_INSTANCE` | Logs a banner, then `session.start` per exchange. The room shows Sophia's voice state |
| Runtime host | Render background worker `sophia-next-runtime` with a 1 GB disk at `/var/data` | `pnpm build && pnpm artifacts` (Node exactly 24.21.0), then `PATH="$PWD/.render-tools/node_modules/.bin:$PATH" node scripts/runtime-host.mjs --root /var/data/sophia/<projectId>` | `SOPHIA_SERVICE_URL`, `SOPHIA_RUNTIME_TOKEN`, `OPENAI_API_KEY` (the model route: `openai/gpt-6-luna`, high) | The Studio's runtime resource reads online. Its JSON events report ready |

**API settings.** Required at start:
- `SOPHIA_API_DATABASE_URL`: a login granted `sophia_api`, over the session pooler with `verify-full`.
- `SUPABASE_JWT_ISSUER`, and `SUPABASE_JWKS_URL` or `SUPABASE_JWT_SECRET`.
- `STUDIO_ORIGINS`: the Studio's origin. **A blank value turns CORS off.**
- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`. **If `LIVEKIT_URL` is set, a blank key or secret stops the API at startup.**
- `SOPHIA_MEDIA_BRIDGE_TOKEN_SHA256`: without it, `/v1/media/*` answers 401.
- `HOST=0.0.0.0` on Render. The default binds to localhost.

Optional: `INVITE_TOKEN_SECRET`, `STUDIO_URL`, `RESEND_API_KEY` and `INVITE_FROM`, for invitations. `RESEND_API_KEY` without `INVITE_FROM` logs a warning at start and turns invitation emails off; invitations still carry their link and QR code.

**On Render** (as released in OP-0002; see [CC-0012](../docs/coordination/S1-05A/S1-05A-CC-0012.md) and [CC-0013](../docs/coordination/S1-05A/S1-05A-CC-0013.md)):
- **Builds pin pnpm themselves.** Render ignores `packageManager`, and the runtime host checks `pnpm --version` at every start. Each build therefore starts with `npm install --no-save --no-audit --no-fund --prefix .render-tools pnpm@11.7.0 && export PATH="$PWD/.render-tools/node_modules/.bin:$PATH"`, and the runtime host's start command puts the same folder on `PATH`. Every service sets `NODE_VERSION=24.21.0`.
- **The API runs on a free instance.** It sleeps when idle; the first request after a sleep can take longer than 15 s. The bridge and runtime host reach it at its **public** URL (`SOPHIA_SERVICE_URL`, the same value as Studio's `VITE_API_URL`), and their long polls keep it awake.
- **Database URLs name the CA by its repository-relative path,** `sslrootcert=deploy/supabase/prod-ca-2021.crt`. `pg` resolves it from the working directory, which is the repository root on Render.
- **`SOPHIA_MEDIA_BRIDGE_TOKEN_SHA256` is the capability's hash, never the capability.** Both are 64 lowercase hex, so check the value by equality. Uppercase stops the API at start.
- **Studio has no Git connection on Vercel.** Build at the exact commit with `pnpm --filter @sophia/studio build` and the Production `VITE_` values. Then upload `apps/studio/dist` with `vercel deploy … --prod --meta commit=<sha>`; `vercel.json` travels inside `dist`.

**Before the API runs this candidate**, the hosted database needs migrations 0012–0014. Apply them with the owner connection: `SOPHIA_MIGRATION_DATABASE_URL=… pnpm db:migrate -- --dry-run`, then again without `--dry-run`. `scripts/register-runtime.ts <projectId> <adminEmail>` registers the runtime and prints its capability once.

## What each process records

Every line carries ids and codes only: no audio, transcripts, brief text, tokens or emails.

- **Media bridge.** JSON lines of the form `{"at", "event", …}`.
  - `session.start` carries `exchangeId` and `roomId`.
  - Joining the room: `room.joined`, `room.connection` (with LiveKit's reason) and `session.lost`.
  - `holder.absent`: the floor holder was reported absent, with `departed`. `true` means the bridge saw them in the room and then leave, and it pauses at once. `false` means they did not appear within 5 s of the bridge joining, rejoining or the floor passing to them.
  - Google: `provider.ready`, `provider.recover` (with Google's close reason), `session.unavailable` and `provider.usage`.
  - `assignment.changed`: the input, playback and observation epochs.
  - `tool.answered`: the name, the status, and the `workId`/`commandId` it started or a refusal `code`. Also `tool.dropped` and `tool.failed`.
  - `audio.reply_fenced`: why a stop dropped a reply (`responding`, `transcript` or `sound`).
  - `audio.reply`: one line per reply, with no content, all figures in ms:
    - `ended`: `played`, `stopped`, `interrupted` or `recovered`;
    - `receivedMs` and `arrivalMs`: how much audio Google sent, and over how long;
    - `playedMs`: how much reached the room;
    - `droppedMs`: refused because the three-minute backlog was full;
    - `clearedMs`: queued when the reply was cut;
    - `maxQueuedMs`: the deepest the queue got.

    A reply whose `playedMs` is short of `receivedMs` with `ended: played` lost audio.
  - `announce.not_heard` and `announce.record_failed`.
  - `quiesce.ack_failed`, `presence.report_failed` and `holder.event_failed`.
- **API.** Fastify JSON lines: one per request (`reqId`, method, URL, status, time).
  - `request refused` carries the `status` and error `code` of every 4xx.
  - Every 5xx is logged with its cause.
  - Each error body sent to a client carries the same `requestId`, so a browser error can be matched to its line.
- **Worker.** `[sophia-worker]` lines.
  - One per dispatch: `dispatch outbox <id>: enqueued as runtime command <id> (seq n)`, `deferred: waiting for Sophia's runtime to …`, `denied: …` or `outcome_unknown: …`.
  - One per guest removal: `room removal <id> removed | absent | still pending`.
- **Runtime host.** JSON events from the supervisor (`live: true` against the real model), covering start, ready, restarts and command handling.
- **Database and rooms.** `apps/api/scripts/diagnose.ts` is a read-only snapshot of exchanges, presence, quiesce requests, native tasks, runtime commands (with their receipt stages in order), removals and events. It needs the owner connection; with the LiveKit settings it also lists live rooms. Its output is an allowlist:
  - 8-character ids;
  - enumerations and system codes only from each field's own vocabulary;
  - `redacted:<hash>` for any text or unknown code;
  - each LiveKit room as counts (people by standing, unmuted tracks by source) plus Sophia's own state. There is no person's identity, join time or track list, and the room's session id appears only as a digest.

  The full JSON is private evidence. Keep it in the owner's private store, and post only a reviewed summary with a reference to it.
- **LiveKit.** The room's name is the Sophia room id. Sophia's participant identity is `sophia`; members and guests appear by their actor ids.
  - Sophia publishes `sophia.voice`, `sophia.input`, `sophia.output` and `sophia.inputEpoch` as participant attributes, so the trace shows what the bridge observed at each moment.

LiveKit traces show the room. They do not show Google, the tool calls, the work, the database or the API's refusals, which is why the lines above exist.

## Following one conversation or one brief

1. **Start from the room.** In LiveKit, the room name is the `roomId`. In the bridge log, `session.start` with that `roomId` gives the `exchangeId`. Filter every other bridge line by that `exchangeId`.
2. **A brief asked for by voice.** Its `tool.answered` line (`name: start_brief`) gives the `workId`.
   - The Studio's work view and `diagnose.ts` show that task's phase and reason.
   - The worker's `dispatch outbox` line shows it being enqueued, deferred or denied.
   - The runtime host's events show the command's handling.
3. **A refused request.** The API's `request refused` line with the same `reqId` gives the error code.

## Where to look first

| Symptom | Look at |
|---|---|
| The API does not start | The start log: a missing `LIVEKIT_API_KEY`/`SECRET` while `LIVEKIT_URL` is set, `SUPABASE_JWT_ISSUER`, the format of `SOPHIA_MEDIA_BRIDGE_TOKEN_SHA256`, or the role-safety check |
| Studio calls fail in the browser | `STUDIO_ORIGINS` (CORS), `VITE_API_URL` |
| `/ready` is 503 with `schema` | Migrations 0012–0014 are not applied |
| Sophia never joins the room | Bridge `session.start`/`room.joined`/`session.unavailable`; API 401s on `/v1/media/*` (the bridge token and its hash differ); the LiveKit settings |
| Sophia's voice reads unavailable or recovering | Bridge `provider.recover` reasons: the key, the model name, Google's close reason |
| "Sophia paused: … is not in the room" when nobody left | Bridge `holder.absent` (`departed`) and `room.joined` (`people`), then the holder's join and leave times in the LiveKit trace |
| Sophia skips words or jumps in a longer reply | Bridge `audio.reply` for that reply: `droppedMs` above 0, or `playedMs` below `receivedMs`. Many `interrupted` endings mean Google heard barge-in (echo, or someone speaking) |
| Stop Speaking did not silence a reply, or a reply went missing after a stop | Bridge `audio.reply_fenced` and `assignment.changed` (the playback epoch) |
| A brief stays queued | The task's reason in the Studio ("waiting for Sophia's runtime to connect / report ready / reconnect"); worker `deferred` lines; the runtime host's events |
| A brief fails | The task's reason (`the native turn ended: …`); the runtime host's events; the model key |
| A guest cannot join | A 503 means Sophia is being paused: look at `quiesce.ack_failed` and the diagnostic's quiesce requests. "Guest access is not turned on" means Supabase anonymous sign-ins are off |
| A declined guest is still in the call | Worker `room removal` lines; the removal row in the diagnostic |

## Evidence per incident

Report in [#14](https://github.com/davidelaverga/Sophia/issues/14), sanitized, following the evidence contract in [S1-05A-CC-0002](../docs/coordination/S1-05A/S1-05A-CC-0002.md):
- a UTC time window;
- every service's deploy id and commit;
- the diagnostic: a reviewed summary here, and the full JSON in the private store;
- the bridge, API and worker lines in the window;
- the LiveKit trace for the room;
- what the browser showed.

Render keeps logs only for a limited time. Capture them during the window, or have the owner set up a log stream.
