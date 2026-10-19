# Implementation-session handoff

Goal and attempt: RELIABILITY-RETRY-5XX-AND-WRITE-TIMEOUTS (the reliability baseline's gaps #2 and #10,
`evaluacion-2026-10-19/fiabilidad/linea-base.md` §5, lote R1), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-2`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-2`, branch `reliability/retry-5xx-and-write-timeouts`
from the local `group/follow-ups-5` (`56c61c61e`, stacked on #468, not pushed)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API.
Runtime unit: Luis's Windows host (Playwright through the session's `pw.ps1` guard, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-19, «quisiera trabajar en la fiabilidad y resiliencia. Ahí tendríamos que también
medir. Lo que no se mide, no se puede mejorar» and «Procede con el script de medición y el lote R1»; local only, nothing
pushed.
Ending commit/tree: `eb85a48e6d7e` (tree `4bc7732016ef`), after the independent review's P2 (the first round ended at
`efea18f338ae`): the branch's last commit that changes code (the next one updates the note and this record). Against
`56c61c61e`: `e2e/app-auth.spec.ts`, `src/api/client.ts`, `src/api/client.test.ts`, `src/api/stream.ts`,
`src/app/auth.ts`, `src/app/auth-fetch.ts`, `src/app/auth-fetch.test.ts`, `src/app/bounded-fetch.ts`,
`src/app/reauth.ts`, `docs/plans/reliability-retry-5xx-and-write-timeouts.md`, and this record.

## Outcome

- **A read stopped at a deploying proxy is asked again by itself.** While Render deploys or wakes the API, its proxy
  answers with a 502/503/504 page and no contract body. Such a reply was final, so the project list, members, goals
  and the rest showed «That didn’t go through. Try again.» at once. Now a read (GET) that gets one is safe to ask again,
  and the App's cache tries three times, 1 s, 2 s and 4 s apart, before those words show.
- **A keyed write that gets the same page keeps its key** (review P2). A new project, an invitation, a message: the
  proxy may have answered after the API committed, so the outcome is unknown. The form says «Sophia didn’t answer. Try
  again», and the person's press sends it again under the same Idempotency-Key, never by itself.
  - The first round's version of this record claimed that was already so. It wasn't: such a reply was a final
    refusal, the key was let go, and the next press went under a new key and could record a second one.
  - A 503 is treated the same way: a key kept costs nothing, a key let go can cost a duplicate.
  - A write without a key stays final. A 4xx page and a 500 stay final too: the API's own 5xx always carries its
    body. A reply with the contract keeps the API's own `retry`.
- **Two PUT writes wait as writes.** A goal's owner and date (`setGoalTarget`) and a member's role (`changeMemberRole`)
  wait 90 s, as every other write does. They were cut at a read's 30 s.
- **The App's Auth client has an end.** Each request of the App's Supabase Auth client (refresh, sign-in link,
  sign-out) ends after 30 s, as the checks' client already did after 20 s. Supabase-js treats a request cut that way as
  a network failure: it keeps the session and tries the refresh again, so nobody is signed out by it.

## Evidence

- Plan: `docs/plans/reliability-retry-5xx-and-write-timeouts.md` (`83ba94982`), committed before the tests.
- **The baseline against the code:** both gaps held as written, at the lines it gives.
  - Every `toError` site was read and given its kind: 9 in `client.ts`, 1 in `stream.ts`.
  - Only the App's cache (`retryRead`) reads `retry`. The fixture pages use TanStack's default, three tries whatever
    `retry` says.
  - The baseline leaves out one point: `boundedFetch` ends the wait for the reply's headers, not its body. That stays.
- **Gap #2, written first and failing** (`0262944f7`):
  - `client.test.ts`: the three «on a read» cases fail with `actual: [ 502, 'http_502', 'never' ]`, `expected: [ 502,
    'http_502', 'safe_read' ]` (and the same for 503 and 504). The existing «502 from a proxy» case fails the same way.
  - The write and 4xx cases already held.
  - `app-auth.spec.ts`, «reliability · the project list answered twice by a proxy’s 502 page loads by itself» (log
    `pw-logs/r1-p2-retry-red.txt`): «Expected: 7», «Received: 0», «20 × locator resolved to 0 elements».
  - The read used is `GET /api/v1/projects` in the real App (5198), through the network: that page fakes no fetch,
    unlike the room fixture's `installFixtureApi`.
- **Gap #2, fixed** (`e2e1673bf`): the unit cases pass, and the spec passes alone (`pw-logs/r1-p2-retry-green.txt`, 1
  passed). It asks exactly three times and shows no alert.
- **Gap #10, written first and failing** (`881e4c5b8`):
  - `client.test.ts`: `setGoalTarget` and `changeMemberRole` fail with «cut at a read’s 30000 ms», `actual: AbortError`,
    `expected: 'waiting'`.
  - `auth-fetch.test.ts`: «still waiting at 30000 ms». The caller's own abort already held.
  - The commit also moves the Auth client's fetch, unchanged, to `auth-fetch.ts`, so it can be checked without the page.
- **Gap #10, fixed** (`efea18f33`).
- **Review P2, written first and failing** (`284126ace`):
  - `client.test.ts`: «on an admission» fails with `actual: [ 502, 'never' ]`, `expected: [ 502, 'same_admission_key' ]`
    (and the same for 503 and 504). The P3 pin, a 500 page final on a read and on an admission, already held.
  - `app-auth.spec.ts`, «reliability · a new project answered by a proxy’s 504 page is sent again with the same key»
    (log `pw-logs/r1-p2-samekey-red.txt`): «Expected: "dbb57ccc-…"», «Received: "8e264577-…"». The second press carried a
    new key.
- **Review P2, fixed** (`eb85a48e6`). Through the guard (`pw-logs/r1-p2-final2.txt`): 162 passed. The specs: the first
  round's eleven, plus `archive-project`, `invite-members`, `invite-from-projects`, `project-conversation-writes`,
  `project-leave`, `project-rename`. Unit 1915/1915. Lint, `tsc` and Prettier clean.
- **Green at `efea18f33`** (first round):
  - Through the guard (`pw-logs/r1-p2-final.txt`): 116 passed. The specs: `app-auth`, `signed-in-later`,
    `goal-owner-date`, `goal-controls`, `goals-overview`, `goal-overdue`, `member-roles`, `remove-member`,
    `host-controls`, `discussion-earlier`, `opening`.
  - Every Studio unit test but the two known Windows path cases: 1911/1911.
  - `oxlint --type-aware .` clean, `tsc --noEmit` clean, Prettier clean on every touched file.

## Decisions and changes

- **`toError(res, 'read' | 'admission' | 'write')`, required.** Each site now says what it is, so the type checker
  catches a new site that doesn't. `UNANSWERED` maps each kind to what a failure with no answer of the API's allows.
  `callApi` derives both its own `retry` and the kind from that one rule: a key makes it an admission, a GET a read.
- **The unkeyed PUTs stay final.** The goal's target is compare-and-set on its revision, and a role already held
  changes nothing, so a press after a write that landed never applies it twice.
- **502/503/504 only.** The API's own 5xx always carries its contract body (`handleError`), so a bodiless 500 is no
  proxy pause; it stays final, on a read and on an admission.
- **30 s for the App's Auth client** (`AUTH_REQUEST_MS = READ_TIMEOUT_MS`), not the API's 90 s for writes. Supabase
  Auth doesn't sleep like Render. A sign-in email sent through SMTP fits well within it.
- **`boundedFetch(ms)` in its own module** (`bounded-fetch.ts`), shared by `reauth.ts` (20 s, unchanged) and
  `auth-fetch.ts` (30 s).
- **The existing «502 from a proxy» unit case** now expects `safe_read` on a read.

## Remaining obligations

- The project snapshot keeps its own retry (any 5xx, `useProjectFeed.ts`), and the event stream reconnects whatever
  its error says. Neither changed.
- The App's `serve()` in `app-auth.spec.ts` answers every other API read with a 503 without the contract body. Those
  reads are now tried three times in the background before failing. No check there waits on their failure, and the run
  stayed green.
- The baseline's M7 («≥ 95 % of 502/503 without a contract cured without a press») has its first spec here. It has
  no counter yet; that belongs with the measurement script.

## Next bounded action

- Luis: say when to push (with the R1 batch); then merge on green with no open P1. Nothing is owed locally.
- Source IDs consulted: none from the source register; the work read this repository and the reliability baseline
  only.
