# C011-F01 bounded factory-startup repair — Stage A

Goal/attempt: INC-COORD-1117-CODEX-REPAIR-001, successor to Root132's prepared repair.
Human owner: Davide Laverga. Executor: explicitly authorized Codex implementation worker;
not coordinator, independent reviewer or release operator. Native session ID: unknown.
Starting source: immutable coherent011 tree `f0b76f0a8c07f7ce021a7c35a0a124dcf277f237`.
No Git worktree, index, refs, history or source commit was created or changed.

## Outcome and states

The factory acquires a real local Responses double, constructs the recording front,
listens, then transfers both to its caller. Before return, either startup can fail;
the factory now owns cleanup. Synchronous construction/listen setup failures and
asynchronous server listen errors reject. Readiness/address setup errors reject too.
Startup rejection attempts front cleanup when acquired and double cleanup independently.
An unopened front's normal `ERR_SERVER_NOT_RUNNING` is ignored during failed startup.
The original error remains the thrown value if cleanup succeeds; otherwise an
AggregateError retains the primary first and each labelled cleanup cause. Returned
provider close still attempts both halves and retains cleanup failures.

Only the helper, one new unit regression, and this handoff change. Existing HTTP
forwarding/script/drop behavior and all other source remain unchanged. This is a
fixture ownership repair, not evidence of an observed production leak or exploit.

## Exact source and execution boundary

The r123 helper is 10,231 bytes, SHA256
`8e243eaabfca80178b194f8b23e1964f323825949cb193b92544d05b6563f8ad`,
Git blob `c604b0440193e21445f917a493f383668ae22927`, unchanged into f0b.
The exact maintained double was recovered through GitHub `fetch_file` from the safe
known parent `90a0af7eb3d4d376e9a0d63c0e05def18ee79b36`, path
`tests/support/mock-responses.mjs`, blob `f02522893fe360697ca8ee786b36eae2c078eae9`.
The exact parser is blob `3d9f0e4c556734cdd3793d006a38f7dc1e17f66f` from the protected
old checkout, copied read-only. All three were compared to the sealed r130 index's
named metadata; no denied source body was read. The local pinned yaml 2.9.1 package
is linked read-only into scratch. Node is exactly 24.21.0. No installation occurred;
ambient pnpm 10.26.2 was not used to run tests, and no full toolchain gate is claimed.

The first development run used an older maintained double from the old checkout.
Final metadata validation caught that mismatch before export. Those historical
results are retained separately as `older-double-*` and do not qualify this result.
The exact f0b double was inspected, substituted only in owned scratch, and both
final controls were rerun. An initial test-development run also exposed two test
assumptions (Node's built-in listening listener and asynchronous host binding);
the final regression observes only the helper's listener and injects a readiness
failure after real bind. Existing assertions/timeouts were not weakened or edited.

No full checkout was materialized. Only the helper, its exact double/parser, new
focused test and handoff are physical source here. The base's 4,344-leaf index
was parsed as inert path/mode/blob metadata, its checksum checked, and its tree
reproduced in memory. A prospective successor full-tree hash is exported separately;
it is not a claim that all those source bodies were materialized or tested.

## Focused evidence

New test: `tests/unit/runtime-bound-output-startup.test.mjs`.
The test uses actual Node HTTP servers and the actual maintained Responses double.
An independent outer owner captures every server before factory ownership transfer,
rescues them in finally even under the old helper, and checks listening=false and
address=null. It does not rely on a handle returned by the broken factory.

From `baseline/` in the owned export directory:

```text
node --test --test-concurrency=1 --test-timeout=10000 --test-name-pattern=synchronous front construction|synchronous listen setup|real asynchronous EADDRINUSE tests/unit/runtime-bound-output-startup.test.mjs
```

The name pattern above is one argument (see RESULTS.json's exact argv).
Original helper: 0 pass / 3 expected assertion failures, 0 cancelled; inner exit 1.
Construction/setup assertions see the old factory's still-live double before rescue;
the old async listen wait loses the asserted 1,000 ms sentinel. Outer rescue confirms
all actual servers closed; runner PID 50880 was reaped normally. This safely injected
local negative control is not an assertion about an observed production leak.

From `source/`:

```text
node --test --test-concurrency=1 --test-timeout=10000 tests/unit/runtime-bound-output-startup.test.mjs
```

Fixed helper: 8 pass / 0 fail / 0 cancelled / 0 skipped, inner exit 0; runner PID
50890 reaped normally. The caller/terminal evidence runner returned 0 after checking
both expected statuses. Controls cover sync construction, sync listen setup, actual
asynchronous EADDRINUSE using the double's occupied port, primary plus after-real-close
cleanup error with independent double cleanup, and success transfer plus actual
provider/proxy HTTP. The three existing F02 checks were extracted byte-for-byte from
r123 integration source; their assertions and 3,000/20,000/200 ms bounds are unchanged.
They retain caller cleanup, primary+cleanup preservation, and scratch retention for
rejected/unconfirmed stub runtime stop. The stubs launch no processes; their own empty
scratch is removed only after retention assertions. No actual runtime or DB launched.

Raw stdout/stderr, exact argv, PIDs/statuses, provenance, three-path diff, source and
full-leaf metadata manifests, tree method and SHA256 registers are in the owned worker
directory `/Users/davidelaverga/.codex/operator-journal/SOPHIA-INC-2026-11/workers/codex-startup-1117`.

## Remaining obligations and next bounded action

The protected old checkout's origin/main is 61fbe1c6..., and assigned pinned
de7a6ab2... is absent from its object store. No fetch or mutation was attempted.
Current-main composition remains Root's separate task. No full ordinary, SQL, DB,
browser, native/provider qualification, production or release action was performed.
The denied 0110 body, withheld old patch and protected old PR heads stayed closed.
All D1/VoiceLab/default-off/Personal9e/automatic-review/CI/Luis/RTA/app and existing
approval holds remain unchanged. Unknown older effects are not reset by this export.

Return this exact bounded delta to the existing independent reviewer. After accepted
source, Root can compose current main through normal Git and plan the applicable
remaining integration/ordinary/SQL/DB/browser gates. No publication in this Stage A.

**HOLD.**
