# INC04-S03A-CLI-NUMERIC-R1 — exact numbers at the operator capacity CLI

Task `INC04-S03A-CLI-NUMERIC-R1-001`. SAME Routing17 author, session `session_01FGXfrGsUA6jNm3sxRoSro2`. No new role.

This closes only the confirmed CLI numeric boundary of af82: PR519 comment 4570556029 (review 5900412347), adjudicated
CONFIRMED / NEEDS_REVISION (`94a397c5…ea85`) and adopted by root. It does not close C1P/R07, B2/B3, the historical
18-commit automatic coverage, SEC qualification, paired push failures, integration authority, RTA/release, or any
native, owner, deployed or app acceptance. The Personal 9e owner hold remains. No thread is replied to or resolved.

## 1. ACK (recorded before any edit)

- **Context.** Context zip `05a24f9c…7db1`, 51,059 B, every SUMS line verified. `TASK.md` (8,432 B, `88d9fcca…`) was read in full, along with the actual finding, the independent adjudication, the root adoption, the path allocation, the af82 plan copy and root's Node 24 reviver proof.
- **Base.** Exact `af82d575c7746f5605fc7754a27e5816be020225`, tree `b588c6a5d6c087468b9bbcb5cc73ea1a2e7ac537`.
- **Worktree.** A new worktree on new branch `inc04-s03a-cli-numeric-r1-001`, with 0 status lines.
- **Starting blobs, as leased.**

  | Path | Starting blob |
  |---|---|
  | `scripts/record-capacity-observation.ts` | `dc83f9dc` |
  | `packages/persistence/src/capacity-observations.db.test.ts` | `285c2d24` |
  | `docs/plans/capacity-observations.md` | `3730dd0b` |
  | this handoff | absent |

- **Toolchain.** Node 24.21.0, pnpm 11.7.0, umask 0022. The live probe: the reviver's third argument is `{"source":"1.0"}` for the token `1.0`.
- **Chosen comparison.** Each number's lexeme (`context.source`) and its `JSON.stringify` text are each normalized to sign, significant digits and decimal exponent, then compared for equality. The three integral fields additionally need `Number.isSafeInteger` and range. Errors are fixed, and the check runs before `withClient`.

## 2. The defect

`readingOf` used plain `JSON.parse`, and `recordCapacityObservation` sends `JSON.stringify(input)`. A number therefore reached SQL as the JS double's own text, not the operator's lexeme:

| Lexeme in the file | Reached SQL as |
|---|---|
| `9007199254740993` | `9007199254740992` |
| `1.00000000000000001` | `1`, a valid credential revision that replays |
| `1e-999` | `0`, a valid source sequence |

Each could pass, or replay against, valid authority.

## 3. The change (four paths)

**`scripts/record-capacity-observation.ts`.** `readingOf` now parses with a reviver. For every numeric token, anywhere in the file (window `value` included), it requires:

1. a finite number;
2. the token's lexeme, from Node 24's `context.source`, to have exactly the same decimal value as the number's JSON text.

`decimalOf` is a bounded normalization: one regular scan; the significant digits with leading and trailing zeros stripped; the exponent of the first significant digit; zero as a single form. An exponent longer than 15 digits on a nonzero mantissa is refused, because it cannot name a finite nonzero double from a file of any real length.

After parsing, `sourceSequence`, `credentialRevision` and `accountQualificationRevision`, when they are numbers, must be safe integers of at least 0, 1 and 1. A null or absent `sourceSequence` is untouched. A non-number is still the database's refusal, as before.

**Errors.** All fixed, and none echoes a token:
- `A reading's numbers must be finite and keep their written value`;
- `A reading's <field> must be a safe integer of at least <n>`;
- `A reading file is JSON`. This replaces the `SyntaxError`, whose message quotes the file; it is not kept as a cause.

**What is unchanged.** All of this runs before `withClient`, so a refused file never opens a connection. After validation the transport is unchanged: the same parsed object, the same `JSON.stringify` in the persistence wrapper, and the same `number` contract, with no bigint and no parser library. The ES2024 lib does not declare the reviver's third argument, so a local optional `ParseContext` parameter is used; there is no global typing change.

**Unchanged, and not touched:**
- 0107 and every other migration; the SQL guards, the canonical hash, replay, idempotency and conflict;
- revoke, and replay after binding loss;
- the preview and financial admission;
- the persistence wrapper, contracts, GEN, dependencies, the lockfile, workspace and config, and `SOURCE_MAP`;
- the old S03 handoff, B2 and C1P.

**`packages/persistence/src/capacity-observations.db.test.ts`.** Three new tests run the real operator CLI on disposable PG16. The fixtures are raw file text: each of the four numbers is written into the text as a literal lexeme, never as `JSON.stringify` of a number.

1. **Exact numbers record and replay by value.**
   - The first record is `1.0`/`0`/`0.1`. Twelve respellings of the revisions, sequence and value replay the identical receipt.
   - It stores sequence `0` and value `0.1`.
   - Changed exact payloads are the database's conflict, not a CLI refusal. No rows are written.
   - `9007199254740991` and `1e21` are stored exactly, and replay as `9.007199254740991e15` and `9007199254740991.000`.
   - A null or absent sequence, and a null value, record and replay.
2. **Inexact numbers are refused, even where rounding would replay.** There are 19 refused cases across the three integral fields and the window value: rounding fractions, unsafe adjacent integers, fractional revisions, below-range values, `1e999`/`1e400` overflow, `1e-999` underflow and a 30-digit value.
   - Eight are asserted to read in JS as exactly a recorded authority's number. One of those authorities was recorded through raw SQL with sequence `2^53`.
   - Each is exit 1 with exactly its fixed message on stderr and nothing on stdout. No rows are written, and the exact original still replays.
3. **Refusal happens before any database contact.** A SYNTHETIC TCP boundary, not a database, counts connection attempts and closes each one at once.
   - Eight invalid files (inexact, unsafe, malformed JSON and non-object) each give the fixed refusal with 0 connections.
   - An exact file reaches the boundary, with at least 1 connection, and fails there with a non-CLI error. This shows the count can see a connection.

**`docs/plans/capacity-observations.md`.** It gains an "Operator file numbers (CLI R1)" paragraph under Recording (C03), and a "SQL versus CLI" note. SQL still accepts integral revisions up to 2^63-1 and any `bigint` sequence; the CLI refuses what it cannot carry exactly, and never rounds. The `capacity-observations.db.test.ts` Checks row is extended, and the custody limits are kept.

## 4. Checks

- **Fail-before.** In a detached af82 worktree, only the new test file (byte-equal to the candidate's) was replaced; production `dc83f9dc` is unchanged. The run had inner exit 1, 10 passed and 2 failed, both on assertions:
  - test 2: `{"revision":"1.00000000000000001"}` replays with exit 0 and the original receipt;
  - test 3: the first invalid file reaches the boundary ("Connection terminated unexpectedly") instead of the fixed refusal.
- **Focused, on the candidate.** The whole `capacity-observations.db.test.ts` passed 12/12. The existing CLI record/replay/revoke, replay after credential rotation and R2 spelling tests still pass.
- **Static checks.** `format:check`, `lint`, `typecheck` and `contracts:check` each exit 0. The first lint run had three findings, all fixed and retained as development failures:
  - `preserve-caught-error` is disabled for the one line where the cause would carry raw evidence;
  - two `any` types were narrowed to `unknown`.
- **Database.** An owned PG16 on 127.0.0.1:55521, SCRAM over TCP, with its credential only in 0600 files outside the packets.

Every fixture is SYNTHETIC. Nothing here qualifies a real account, route, provider or telemetry source, and nothing ran against a deployment.
