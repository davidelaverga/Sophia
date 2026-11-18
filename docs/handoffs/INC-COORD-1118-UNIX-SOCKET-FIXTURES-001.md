# Unix socket fixture path repair: held at a newly exposed boundary

Lease: INC-COORD-1118-UNIX-SOCKET-FIXTURES-001. Base commit `66b543ad0f65b40f31d30f533791adffab1fcd43`, tree `6fb10bbf1791f8aa629040b6641476b39a100bc7`. Only the two owning fixture files and this new handoff are changed. The failed fresh checkout, accepted artifact records and prior sealed packets remain unchanged.

## Controlled old and new results

The retained canonical check exited 1 after its first seven phases passed, including fresh artifact VERIFY. Its unit totals were 5,785 tests: 5,713 pass, two fail, 70 skipped, zero cancelled. Integration was not reached. Both failures were real Unix-socket `listen EINVAL` calls at 150- and 221-byte addresses beneath the owned TMPDIR. The local Darwin SDK declares `sun_path[104]`; merely shortening the external TMPDIR to `/tmp` still leaves the original custody fixture too long.

Before source edits, the exact two old source files were copied and pinned as data. The focused two-file command under a new deep owned TMPDIR reproduced both errors: exit 1, 28 tests, 20 pass, two fail, six unchanged Linux-only skips, zero cancelled. Original source pins, command status and raw errors are preserved in `workers/codex-startup-1117/unix-socket-fixtures-001/`.

Only each socket-bearing fixture now creates a unique private directory with `mkdtemp` below canonical POSIX `/tmp`, using short prefixes `sp-` and `sc-`. Canonicalization accommodates Darwin's `/tmp` alias without violating custody's canonical-directory requirements. The host's other scratch files and custody's other fixtures still use the deep TMPDIR. Directory mode 0700 and current ownership are asserted; exact full custody filenames and real socket listeners remain. Explicit assertions and diagnostics verify the live socket type, address byte bound, listener closure, socket removal and normal cleanup of only the unique owned directory. No process working-directory change, fake socket, skip, product change, policy change or general fixture framework was introduced.

The new focused run used the same two files and same deep TMPDIR. Both sockets actually listened: the host-probe address was **29 bytes**, the custody address **96 bytes**. Both listeners closed, socket entries disappeared, and unique fixture directories were removed normally, including on the remaining assertion failure. Results: **exit 1**, 28 tests, **21 pass, one fail, six skipped, zero cancelled**.

The host-probe test passed. Custody now reaches its original refusal assertion and fails because actual code is `unreadable` while the unchanged expected code is `not_regular`. Its socket exists and is listening; the original path-construction failure is no longer the first boundary. All original assertion ASTs remain: host-probe 38 original calls retained in 46 total; custody 89 original calls retained in 97 total. The remaining filesystem, FIFO, symlink, ownership, custody, hard-link and size assertions were not relaxed or removed.

Prettier checks and Node syntax checks passed for both changed files. The maintained targeted type-aware lint exited 0, zero warnings/errors, on one selected file; the ignored `.mjs` file has no lint coverage claim. No ignored-path override was used. No focused retry followed the newly exposed custody classification failure.

## Finite boundary and disposition

HOLD: the fixture path repair is not a green focused result or a full canonical qualification. The newly exposed boundary is `readPrivateFile` in `scripts/lib/contribution-custody.mjs`, whose open-error classifier falls back to `unreadable` outside its recognized nonregular-file errors. This file is outside the present three-path lease. At this focused boundary the product's generic refusal alone did not establish the underlying errno; the expected assertion was not weakened to conceal it.

No product source, artifact record, lock, dependency graph, checker, timeout, concurrency or existing skip changed. No commit, full canonical retry, PostgreSQL, provider, VoiceLab, native product smoke, publication, merge, deployment or activation occurred. Linux behavior and current portable artifact identity remain unqualified by this Darwin run. The opaque closed fixture remains absent and unread; all other base source bodies and modes are exact. All existing holds remain.

The external packet carries old/new raw outcomes, exact input pins, actual socket/cleanup diagnostics, assertion-preservation proof, complete new leaf manifest/permitted export, safe three-path delta and old-packet/source preservation receipts. The candidate requires SAME independent whole-source review and a new bounded task for the remaining boundary.

## Supplemental bounded errno observation

Root subsequently authorized exactly one external diagnostic on an independently owned, real listening 96-byte socket, using the exact current product flags `O_RDONLY | O_NOFOLLOW | O_NONBLOCK | O_NOCTTY`. Actual raw error: `code: "Unknown system error -102"`, `errno: -102`, `syscall: "open"`. The live socket, private ownership, byte length and normal listener/socket/directory teardown are recorded without credentials. No second socket diagnostic or focused retry occurred.

Read-only Node platform metadata reports Darwin `EOPNOTSUPP = 102`, `ENOTSUP = 45`, and `getSystemErrorName(-102) = "Unknown system error -102"`. The existing product recognizes the string `EOPNOTSUPP`, but this actual Node 24.21.0 error reaches its generic `unreadable` fallback instead. Thus the observed failure is not a different fixture inode type or a failed listen.

Minimum proposed next source scope is `scripts/lib/contribution-custody.mjs` only, alongside the current owning regression: retain all existing string-code handling and, under Darwin, recognize the exact negative numeric `EOPNOTSUPP` errno from `node:os` constants as the existing `not_regular` refusal. Do not recognize arbitrary unknown errors, bypass safe opens, proceed to read socket content or relax the expected refusal. This would only refine a fail-closed refusal classification; a product lease and actual focused verification are still required. No such product edit is included here.

## Latest: separately authorized platform-errno successor

After the three-path candidate `e1c6e5dd7d033b8e362cda7a732579a25db5649a` and its actual negative focused result were sealed (4,470 references, SHA-256 register `a9141e02a1110614f47ca3457f1ef43513f51adc145334a6551044eb50143abb`), Root issued extension INC-COORD-1118-UNIX-SOCKET-FIXTURES-001-EXT-01. The earlier candidate and all its failure evidence remain immutable and unaccepted; the historical HOLD sections above describe that stage.

This separate four-path successor adds only the newly leased product source path `scripts/lib/contribution-custody.mjs` to the original fixture/handoff scope. In the existing trusted `openSync` error catch, it preserves the named `ENOENT`, `ELOOP`, `ENXIO` and `EOPNOTSUPP` branches and recognizes exactly the negative current platform `node:os` constant `errno.EOPNOTSUPP` as the same `not_regular` refusal. It does not hardcode 102 or classify arbitrary unknown errors. No safe-open flags, file reads, permissions, ownership checks, link checks, size/stability bounds or refusal text changed. The original named branches and generic `unreadable` fallback remain.

The owning custody file adds a bounded controlled-open-error test: an unnamed exact negative platform EOPNOTSUPP is refused as nonregular, while an unrelated EIO errno, positive EOPNOTSUPP value, absent numeric errno and EACCES remain unreadable. Existing named ENXIO/EOPNOTSUPP/ENOENT/ELOOP classifications are preserved. These controls invoke the actual reader with its exact safe-open flags; they do not replace the real socket case or relax any original assertion.

The complete two-file focused command under a separate deep owned TMPDIR exited **0**: **29 tests, 23 passed, zero failed, zero cancelled, six unchanged Linux-only skips**. Both real sockets listened at 29 and 96 bytes; the original custody socket assertion now passes. Listener closure, socket removal and unique private-directory cleanup all completed normally. No additional standalone socket probe was performed in this successor. Prettier, Node syntax checks for all three code/test paths, and maintained targeted type-aware lint passed; lint selected one TypeScript file, so no `.mjs` lint coverage is claimed and no ignore override occurred.

The host-probe source remains exact to the sealed three-path predecessor. This same HDF is appended to its byte-exact predecessor prefix. No other base source, artifact identity, lock, dependency, checker, timeout, concurrency or skip changed. No source commit, artifact build/record, full canonical retry, PostgreSQL, provider, VoiceLab, native product smoke, publication, merge, deployment or activation occurred. A focused Darwin pass is not Linux qualification or ordinary/PRE/runtime-health acceptance. All existing holds remain pending SAME whole-source review and a new Root task.

Latest successor packet: `workers/codex-startup-1117/unix-socket-fixtures-ext-001/`, with full candidate identity/manifest/permitted source export, four-path cumulative delta, safe delta versus e1c6, exact tested input pins, controls/raw results, and predecessor/failed-checkout preservation receipts.
