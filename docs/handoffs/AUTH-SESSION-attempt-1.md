# Implementation-session handoff

Goal and attempt: AUTH-SESSION (Codex P2 on #470, `apps/studio/src/app/bounded-fetch.ts`, and the reliability
baseline's gap #3 from `evaluacion-2026-10-19/fiabilidad/linea-base.md` §1.6, §4 M8, §5; Luis 2026-10-19: «quisiera
trabajar en la fiabilidad y resiliencia. Ahí tendríamos que también medir. Lo que no se mide, no se puede mejorar» and
«Arranca R2 en paralelo»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-2`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-2`, branch `reliability/auth-session` from
`origin/group/reliability-r1` (`0b2202a38`, PR #470; not pushed)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API.
Runtime unit: Luis's Windows host (Playwright through the session's `pw.ps1` guard, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-19 (above); local only, nothing pushed.
Ending commit/tree: `5d82552a3`, the last commit that changes code or checks (the next one adds only this record and
the note's evidence). Files changed against `0b2202a38`: `src/app/bounded-fetch.ts`, `src/app/bounded-fetch.test.ts`
(new), `src/api/renew.ts` (new), `src/api/renew.test.ts` (new), `src/app/token-renewal.ts` (new),
`src/app/token-renewal.test.ts` (new), `src/api/client.ts`, `src/api/stream.ts`, `src/app/auth.ts`, `fixtures/app.tsx`,
`e2e/app-auth.spec.ts`, `docs/plans/auth-session-renewal.md`, and this record.

## Outcome

- The Auth clients' bound now covers the reply's body. Before, headers followed by silence left supabase-js reading for
  good, and the client's own abort no longer reached the read. `boundedFetch` reads the reply whole inside its bound
  and hands it on as it came (status, headers, bytes; none for a 204).
- An expired token no longer shows «You’ve been signed out» to someone who is still signed in. Every API request
  goes through `apiFetch`. On a 401 it asks the App's Auth client for a new token, then sends the same request once
  more with the same Idempotency-Key and body. The new token is the session's if it was already renewed, else one
  `refreshSession()`, shared by every request the same token refused. A second 401, a 403, or a renewal that fails is
  the answer, as before. A token a renewal gave that the API refuses within a minute isn't renewed again, so nothing
  loops.
- The App page (`app.html`) has new levers on `appFixture`: `expireToken()`, `refuseTokens()`, `dropStream()`,
  `refused` and `keys`. The synthetic Auth renews a session when a check says so. These cover M8 («sesión que
  sobrevive al sueño») for the measuring suite.

## Evidence

- **Gap #3 was a hypothesis and it holds**, checked in both halves before any code (the note's «What was measured»):
  - The API answers 401 `actor_context_required` to an expired JWT: `jose` `jwtVerify` with no clock tolerance, and
    the API's own test with `exp: '-1m'`.
  - supabase-js 2.117.1 refreshes only from a 30 s ticker in a shown tab (90 s margin), and on `visibilitychange`
    asynchronously. The feed asks for its stream at once on `online` and `visibilitychange`, with the old token.
- **Codex's P2 holds as written**: the timer and the caller's signal were let go in the `finally` of the headers'
  promise.
- Written first, each red at its own commit before its fix:
  - `f17b994cf` (unit): «a body that never ends is aborted at the bound…» fails `still waiting at 20000 ms`.
    «the client’s own abort, after the headers came…» fails `still waiting after the client aborted`. Fixed at
    `ceb310ab1`, 4/4 green, and `auth-fetch.test.ts` and `refresh-refusal.test.ts` still green.
  - `8ffca96a4` (browser, `auth-renew-red-4`, the App unchanged, 4/4 red). The read fails on
    `locator('.conv-msg').filter({ hasText: 'One page…' })` not found; the page shows «This conversation can’t be read
    now.» The feed fails on `signedOutNotice` toHaveCount, Expected 0, Received 1. The write fails because the message
    never appears. The no-loop check fails on refreshes, Expected 1, Received 0. Fixed at `c6f25b2c3`
    (`auth-renew-green-2`, 4/4).
- **Two flakes found under load and fixed in the checks, not the code.**
  - `eacd95a14`: the snapshot's read can meet the expired token before the stream does. The check now waits for the
    stream's new ask and for any refused request. It is still red without the renewal: `auth-renew-red-5`, the three
    wired files restored to before the fix, fails with the notice shown (Expected 0, Received 1).
  - `5d82552a3`: a project event's debounced refresh could renew the token before the message went out. The outcome
    held, but the keyed retry went unexercised. The read and write checks now expire the token after a second with no
    request.
- Playwright through the guard, two workers, at `5d82552a3`: app-auth, signed-in-later, dock-header, room and
  project-conversation-writes, 112/112 twice (`auth-renew-green-6` at the same tree before its commit, and
  `auth-renew-green-7`).
- Unit: the Studio suite passes 1946/1948. The two failures are the Windows path ones (`attention.test.ts`,
  `browser-imports.test.ts`). New: `bounded-fetch.test.ts` 4/4, `renew.test.ts` 8/8, `token-renewal.test.ts` 8/8.
- Whole-repo `oxlint --type-aware` is clean, `tsc --noEmit -p apps/studio` is clean, and Prettier is clean on every
  touched non-docs file.

## Decisions and changes

- **Buffer, don't wrap the stream.** Both callers are supabase-js clients and no Auth reply streams. A whole reply is
  the simplest way to keep the bound through the body. `url` and `redirected` aren't carried; supabase-js reads
  neither.
- **The renewal lives at the fetch layer** (`api/renew.ts`), so one place covers reads, the snapshot, the stream and
  every write. A 401 means the API's auth hook refused the request before handling it, so a second try can't do
  anything twice. A keyed write keeps its key anyway. `client.ts`'s «no hidden retries» header now names this one
  exception.
- **The App registers the source of tokens** (`renewTokensWith(tokenRenewal(supabase.auth))` in `auth.ts`). The
  fixture pages have no App: their 401s and 403s (`shutDoor`) are untouched, and so are their specs.
- **The loop guard is time-bound, not per token for good.** A token a renewal gave, refused within 60 s, isn't renewed
  again. A token refused for good would wrongly sign out the next sleep past that token's hour.
- **The renewal waits within the request's bound.** If the read's or the caller's signal aborts meanwhile, the request
  ends as an abort, not as the 401.
- **The levers live on the App page**, not on `room.html`: only the App has the Supabase client that renews.
- **The unit tests for the renewal came with the fix**: before it, their modules didn't exist. The browser checks
  were the red proof for item 2.

## Remaining obligations

- A snapshot query that got its 401 before a renewal that came later by itself (a failed renewal, then the ticker's)
  keeps the door closed until an event or a reload, as before.
- A refresh on Auth 5xx is retried inside supabase-js for up to 30 s. Within a read's 30 s bound that read then ends
  as an abort, and TanStack asks it again.
- No telemetry: how often renewals happen in production stays unseen (gap #5). M8 is now measurable locally with
  `expireToken`.
- The no-loop check waits 3 s with `waitForTimeout`: proving that nothing happens needs time.

## Next bounded action

- Luis: review and fold this branch into the next batch PR with the rest of R1/R2 (CI bottleneck batching), then
  merge on green with no open P1. The P2 thread on #470 about `bounded-fetch.ts` can be answered with `ceb310ab1`.
- Source IDs consulted: none from the source register. The work read this repository, `@supabase/auth-js` 2.117.1 in
  `node_modules`, and the reliability baseline only.
