# Conversations: whether Sophia answers here

FND-CON-ASK-CAPABILITY-01. Migration `0089_conversation_ask_capability` (P's allocation), A33 unchanged.

## The gap

The conversation list's `capability.ask` always said `unavailable` (`replies_not_enabled`), even where an Ask was admitted and answered. The capability's only input was `conversation_access` (0063): membership, role and the project's settings. The grant, its cohort and its counters are closed to every login (0064), and the runtime and assembler checks are internal. `conversation_ask` (0071), the only place that decides an Ask, locks the project and writes rows, so it cannot be read, not even in a transaction that is rolled back.

## What changes

- **`sophia.conversation_ask_capability(project)`** (0089) answers, for the calling actor, null when `conversation_ask` would admit an ask now, or one reason code. It is read only: it locks nothing, writes nothing, reserves nothing, queues nothing and calls no provider. It is `STABLE`, `SECURITY DEFINER` with a pinned `search_path`, and the API login alone may call it.
- **Who is told what.**
  - The function checks itself that the caller is an active member of the project; anyone else is refused (42501).
  - A member who cannot write, or a writer outside the current grant's cohort, is told only `replies_not_enabled`, before any grant or spending reason. With no current grant there is no cohort, so the same applies.
  - Only a writer in the current cohort gets `conversation_ask`'s own reasons, in its order: `replies_disabled`, `grant_disabled`, `grant_expired`, `calls_exhausted` (spent, reserved and uncertain calls), `context_assembler_unbound`, `runtime_unavailable` (0071's runtime choice, A40 included) and `cleanup_capacity`. A reason code is never accompanied by a value: no amount, cap, count, id, subject, expiry or runtime.
- **The list** (`readConversationList`) reads it under the caller. `ask` is `available` only on the function's own null, for a writer in a project whose conversations are enabled. Anything other than null or a reason code is an error, not an answer, and so is a missing function.
- **`/ready`**, with conversations on, needs the function and this login's EXECUTE on it (`CONVERSATION_SCHEMA`), so an API built from this takes no traffic on a database without 0089.

## What does not change

- `conversation_ask`, and so Send and Start, are byte-for-byte as 0071 left them. The capability is a snapshot, not permission: a grant, member or runtime that changes before a send is decided by the send.
- The privacy cases differ from the reason `conversation_ask` records (`no_grant`, `asker_not_authorized`, a grant reason for a writer outside the cohort). That is deliberate, not a parity failure.
- Studio: `answers` was already `capability.ask === 'available'`. Ask Sophia's default (on) and the saved text are unchanged.
- No grant, budget, role, assembler or runtime authority is added, and no grant table is opened to any login.

## Known limits

- The saved-text notice (`CONVERSATION_NOTICE`) does not yet name who receives an Ask. The binding map (§5) asks for that before activation. That copy is the owner's decision and is not part of this change.
- `runtime_unavailable` follows the runtime's 90-second freshness window, and `cleanup_capacity` changes as replies end. A list read is a moment, not a promise.

## Checks

- `packages/persistence/src/conversation-ask-capability.db.test.ts`, on real PostgreSQL through the API login. It covers:
  - the eligible case, and its failure on the earlier hardcoded capability;
  - a pinned service executor;
  - non-members, no actor and foreign projects refused in the function;
  - viewers and writers outside the cohort answered identically whatever the grant's state;
  - no grant;
  - parity with the real `conversation_ask` for each cohort-writer reason;
  - no write and no lock across repeated reads;
  - a grant, cohort, role or runtime that changes, then the real Ask;
  - its ACL, and the grant tables still closed;
  - `conversation_ask` identical to 0071.
- `apps/api/src/conversation-ask-capability.db.test.ts`: the list over HTTP against the A33 validator, and `/ready` failing closed without EXECUTE or the function.
