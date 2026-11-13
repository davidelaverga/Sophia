# Implementation-session handoff: INC01-DES-001 member-read foundation

Goal and attempt: INC01-DES-001, the member-read foundation (the first slice of ADAPTER-P02), attempt 1  
Human owner / executor resource: Davide / the dedicated Claude Code designer (cloud session)  
Native session: `session_01FGXfrKKdKs2Y9XbfrHzs3s`; coordinator Codex `01a1bd48-df51-7692-b30c-9e20f6eb4c81`  
Starting commit: the published `f4240d71b86482af460225eef60f49726baa47ed` (tree
`02e981be1cc68941f861613f92031c4549575dcc`), in a separate worktree on the local branch
`inc01-des-001-member-read-dev`.

Ending commit: one signed local development commit, the sole child of `f4240d71`. Its hash is in the exported
manifest, since a commit can't name its own. Not pushed, and no publication parent is guessed.

Assignment: `INC01-DES-001-MEMBER-READ-FOUNDATION.md`, SHA-256
`da5d8f3848521c89d9b73cb07f7a7c0e652193b62ebc3190c900a96f448777c7`. Inputs: the designer's adapter plan
(`76e80cd8…bfa`) and the independent study (`39987ef9…b3`).

## Outcome

**What was added.** `callApi` takes a new optional `memberRead?: true`. On a read (a GET without a key), a final 401,
403 or 404 becomes `ApiError(status, 'http_<status>', unreadRefusal(status), 'never')`.

**How it behaves:**
- The refusal comes from the status alone, before the error body is inspected.
- The body is cancelled without being awaited, through the existing contained `void res.body?.cancel()`.
- `apiFetch`'s one renewal still runs first, unchanged.
- It takes precedence over `protectedRead` and `doorRead`.

**Unchanged:**
- An ordinary 404;
- `protectedRead` and `doorRead` alone;
- success parsing, contract violations, timeouts and aborts;
- a proxy's 502/503/504;
- writes and keyed admissions, with or without the flag.

**Not done:**
- No caller uses the option.
- It clears no cache, sheet or rendered row.
- It claims no resource privacy, service binding, app acceptance or qualified backend.

## Changed (4 paths)

- `apps/studio/src/api/client.ts`;
- `apps/studio/src/api/client.test.ts`;
- `docs/plans/native-resources-member-read.md`, written before the code;
- this file.

## As it happened

1. **Plan, then the worktree.** A worktree on `f4240d71`, with its own offline frozen install (Node 24.21.0, pnpm 11.7.0,
   `node_modules` a real directory).
2. **Tests first.** 26 new cases in `client.test.ts` (20 member-read, 6 nothing-changes; 27 existing), on the real client, with invented tokens and no network. Each
   case replaces `fetch` and restores it, and the renewal, afterwards. The cases:
   - opted-in 401, 403 and 404 with a never-ending body (its cancel settling, hanging or rejecting), a malformed body
     and a contract Error body;
   - renewal, then a 200; renewal, then a final 401;
   - combined flags; success; a contract violation;
   - unchanged behaviour: ordinary 404, `protectedRead`, `doorRead`, a proxy's 503, a write and a keyed admission,
     timeout and abort.

   Order is checked causally through an event log: the send, cancel, refusal, any body read and the parser. The
   500 ms deadline only bounds the wait; it is not used as proof.
3. **Fail-before** on the exact `f4240d71` `client.ts`: 53 tests, 36 pass, **17 fail**, 0 cancelled. All 17 are new
   member-read cases: 13 ran past the 500 ms deadline (the old client waits on the endless body) and 4 failed by
   assertion (code and retry). Every existing case and every "nothing changes" case passed there.
4. **The change** in `client.ts`: the option, `MEMBER_REFUSAL = {401, 403, 404}`, and a first branch in
   `refusedByStatus`, which now also receives the call kind.
5. **Pass-after:**
   - client and renew tests 61/61;
   - all `src/api` tests 94/94, 0 cancelled;
   - oxlint exit 0, prettier clean, Studio typecheck exit 0, `contracts:check` exit 0 ("Generated validators match
     OpenAPI"), Studio build exit 0;
   - discovery: the root test glob matches `client.test.ts`.
6. **Mutant M-MR1** (404 left out of `MEMBER_REFUSAL`): 6 of 53 failed, 0 cancelled.
   - By assertion: the contract-Error 404 came back `not_found`, not `http_404`.
   - Five ran past the deadline, waiting on the endless body.
   - Restored byte for byte.

Not run: the full normal check, browser suites and historical campaigns.

## Remaining obligations

- The same reviewer's owned-four source study before anything else.
- The future adapter binds the accepted resource r2 and the canonical A51. Its container uses this refusal to fence
  its rows, sheet and counts by render generation, before asynchronous cleanup. Root's decisions for that slice stay
  with it:
  - a teammate's `mine: null` says the connection details are private to the owner;
  - the header counts resource rows;
  - per-page observation times are kept;
  - a null timestamp is absent or not representable;
  - the mount and a default-off read flag come with the coherent candidate.
- No push, publication, caller, UI or activation was made.

## Next bounded action

Root sends this slice to the same reviewer. After acceptance, root decides where it is published.
