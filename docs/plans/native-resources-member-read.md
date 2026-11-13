# Member read: a refusal known from its status (INC01-DES-001 foundation)

Written before the code. Task `INC01-DES-001-MEMBER-READ-FOUNDATION` (SHA-256 `da5d8f38…77c7`), on the designer's
adapter plan (`76e80cd8…bfa`, ADAPTER-P02) and the independent study (`39987ef9…b3`).

## Why

A51's native resource catalog (not yet on this base) answers a nonmember, and a project that doesn't exist, with 404.
The client already raises a refusal from the status alone for two kinds of read:

- `protectedRead`: a 403;
- `doorRead`: a 401 or 403.

It does that before any error body is read, so a slow, endless or malformed body can't delay or change the refusal.
Neither option covers 404. Without such an option a 404 waits for its body (`toError`), and the view can't fence until
that body ends, if it ever does.

## What

- **The option.** One new optional `CallInit` flag, `memberRead?: true`, for a project member read that a caller opts
  into, one call at a time.
- **What it does.** On a **read** (a GET without an Idempotency-Key), a final 401, 403 or 404 becomes
  `ApiError(status, 'http_<status>', unreadRefusal(status), 'never')`. That happens at once, from the status, before
  the body is inspected or parsed.
- **The body.** It is cancelled without being awaited (`void res.body?.cancel().catch(() => undefined)`, as now). A
  cancel that hangs or rejects neither delays the refusal nor escapes.
- **Final means after renewal.** `apiFetch`'s one renewal of a refused token still happens first, unchanged. Only the
  answer after it is the refusal. No new renewal, transport or retry; `retry: 'never'`, so the cache never asks again.
- **Precedence.** `memberRead` is checked before `protectedRead` and `doorRead`. When it is combined with either, its
  refusal (with its own status, and `never`) wins. The legacy branches return `safe_read`, which would weaken it.
- **Not changed:**
  - An ordinary 404 (no `memberRead`) keeps its current error-body semantics.
  - `protectedRead` and `doorRead` alone are unchanged.
  - Success parsing, timeouts, aborts, a proxy's 502/503/504, keyed writes, writes, and the default method are
    unchanged.
  - `memberRead` on a call that isn't a read changes nothing.

## Scope

- **Not in this slice:**
  - It adds the client primitive only.
  - No caller uses it yet: no endpoint, Resources component, UI state, mount, contract, generator, SQL or flag.
  - It does not clear any cache, sheet or rendered row. The future adapter's container does that, from this refusal,
    through generation fences, before its asynchronous cleanup.
- **Not claimed:** resource privacy, service binding, app acceptance or a qualified backend.
- **404 isn't reinterpreted globally.** Only a caller that sets `memberRead` gets it.

## Paths

`apps/studio/src/api/client.ts`, `apps/studio/src/api/client.test.ts`, this plan, and
`docs/handoffs/INC01-DES-001-MEMBER-READ.md`.

## Evidence

**Tests,** on the real client with invented tokens and no network. `fetch` is replaced for each case and restored
after it, as is the renewal.

1. Opted-in 401, 403 and 404, each with a malformed body and with a never-ending one, are refused within a bound:
   - exact status, code `http_<status>` and `retry: 'never'`;
   - the reply's `json` and the parser are never called;
   - cancellation is attempted, and the refusal follows it in causal order, even when cancel hangs or rejects.
2. Renewal:
   - a 401 renews once, then a 200 is parsed;
   - a 401 renews once, then a 401 is refused;
   - one renewal and two sends, never a third.
3. Unchanged without the option:
   - an ordinary 404 (contract body and malformed body);
   - `protectedRead` 403 and `doorRead` 401/403, with their codes and retries;
   - a proxy's 503 on a read;
   - a keyed write's 404 and 503;
   - a timeout.
4. Combined flags: `memberRead` with `protectedRead` or `doorRead` refuses with its own code and `never`.
5. A successful opted-in read is parsed exactly as without the option.

**Fail-before.** The new tests run against the exact `f4240d71` `client.ts` (only the test file added). One
minimal-class mutant (404 not fenced), caught by an assertion, 0 cancelled, the source restored byte for byte.

**Focused checks.** Exact Node 24.21.0 and pnpm 11.7.0, own frozen install:
- `api` unit tests (client and renew included);
- Studio typecheck, lint, format and build;
- the contracts check;
- discovery: the root test glob matches `client.test.ts`.

Not run: the full normal check, browser suites or historical campaigns.
