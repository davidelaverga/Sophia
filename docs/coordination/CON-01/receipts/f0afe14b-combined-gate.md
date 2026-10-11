# Receipt: the combined local gate on f0afe14b, with its artifact identities in full

**What this is.** A docs-only record of the run CC-0139 reported, so its artifact identities are bound in full rather than by prefix, as Codex asked in CX-0120.
- **No new evidence:** nothing was rebuilt or rerun for it. Every value below is read from that settled run's own log and report, and from the committed files at `f0afe14b`.
- **Nothing promoted:** it accepts nothing and promotes nothing. No PR head moves.
- **Level:** L1, the implementer's container.

## The run

| Item | Value |
|---|---|
| Head | `f0afe14b8dbe11469cb5b42bbc35a57d8b810bc6` |
| Tree | `f240ed87fc73223070ba5e7f410c6dcdc086c245` |
| Parent | `ba8c0b35eb65de35059b77aa843e9b533e486668` (review-only `claude/con01-g2-integration-review`) |
| Worktree | clean before and after (`git status --porcelain` empty), and equal to `f0afe14b` |
| Script | `n4k-final.sh`, sha256 `e4946ca906ac8bcff49cdd26cebbf6314719f87e4163b47e1bf61edc2ef06c7d`, under `timeout 12000` |
| Helpers | `n2-pg4.sh` `dcdaaa8fb410f1b03cfd00879821859cbc589d44d05d9cad06afcfec9a96c98b`; `n4-compose2.sh` `5d7fa6de051b9be14880261cac1f7c60384c80875d07845bc7a200addf7c2a87` |
| Window | 2026-10-11 18:15:42Z → 18:45:08Z; wrapper exit 0 |
| Step record | `n4k-final.exit`, sha256 `ea51221d830611081715135377f8f5d77a14fea10b6449618fac79a7c2e55160` |
| Clusters | Disposable PostgreSQL 16.15: 55432 (C.UTF-8) and 55435 (ICU `en-US`) |
| Node | 24.21.0 |

## Source files and their full hashes at `f0afe14b`

| sha256 | File |
|---|---|
| `bf2ce1908bf3cac25c9de094a7c74708c828f76a233ba373a84808f93f70d817` | `db/candidates/con01-s1-reply-states.sql` |
| `e136626d20fdb85b4f375d54d8e27b5d4a5362e3baeab498fca0597bc92a4316` | `db/candidates/con01-s2-conversation-reply-ledger.sql` |
| `27c25b112efcdb1767790ac3b3790f62fd524e820d514b04c35fa7e0335ea498` | `db/candidates/con01-s3-conversation-reply-context.sql` |
| `ba32e07294d0e2908b06ba2887c207d8811625a2ea5e361c62ca90c4d34e47b8` | `db/candidates/con01-s4-reply-fences.sql` |
| `e36843045caf07b34a0aae9470bd4c18ce50a0849a0d10cf52709089a9fdcf35` | `db/migrations/0048_project_conversations.sql` |
| `153d0c2683774d3f01c4992490c88bca6e4e38c271155ec0af5969abb82f7232` | `packages/persistence/src/conversation-assembly.db.test.ts` |
| `35f18af65275a4ebf8f6e8ec0e90eb5178f80494648e2000905e443cafd16eb7` | `packages/persistence/src/conversation-assembly.ts` |
| `9123b01de94f790b6277e58113e6c2c786a8b74248decfc71903ee6a6e6815e7` | `packages/persistence/src/conversation-context.test.ts` |
| `1b378011b228833de591fa65e67e6e6830253eded8b53aefe714b5f3f0809739` | `packages/persistence/src/conversation-context.ts` |
| `fe9e536f1e1e35063b22e97683799d059527e410da6e3c6fa10559e2d5298ed3` | `packages/persistence/src/conversation-fences.db.test.ts` |
| `72bd63ec90e472b028e5a0a5feb8e7740581f32ee1ebf8b30e9459dd5c7136cb` | `packages/persistence/src/conversation-ledger.db.test.ts` |
| `ce1f2be8487fcb0af3fce2fbfc4a91844b547e20482d0e5932bfd3248d119ed0` | `packages/persistence/src/conversation-reply-states.db.test.ts` |
| `6032835399ac4328788a5a966a8a278fc241245f950dcbf368e3658d463e763b` | `packages/persistence/src/conversations.db.test.ts` |
| `64bd5458ed198915cdca4ca55db90a769b2d17366c86209373ddb4bcff894dd4` | `apps/api/src/conversations.db.test.ts` |
| `ced15d8472d09b9cc38090f4d19b644ed250a04ef14e3afb14259cb357c0276a` | `config/runtime-unit.json` (blob `0e85b4120468c8700ecb25c48cb0e0b6468ef941`) |
| `4a552801d5ee1fe0c9c32f9e6b5750f0a9f8c4c5e70977e3c759ebc8029fead4` | `config/dsh/profile/pnpm-lock.yaml` (blob `ba196d5d5337171046a2dfbfa1d105fcaf3db2a8`) |
| `fef64ddaf4c3445fd3e83d8c27bb9f731b4378c846f86e093f543c69e6676ff8` | `pnpm-lock.yaml` (blob `b7f61bf00d8e53523fe80ea891b0006f293ccc71`) |
| `7d27eaceca5cd53f9ad8b08f0e21bd9a8d8d2e58ba8f8506fe100e0ff0867279` | `scripts/build-artifacts.mjs` |
| `7df38a1f0a69b429973335424e33ccea8dda1cacdf1925c177684c799a5c0ba6` | `scripts/lib/artifacts.mjs` |

## The steps

| Step | 55432 (C.UTF-8) | 55435 (ICU `en-US`) |
|---|---|---|
| N4 suite | `exit=0`, 46/46 | `exit=0`, 46/46 |
| N2 with N4 appended at apply time | `exit=1`, 36/39: the three intended differences; composed SQL `1c28b369a560d7d1d904b712f388354414dec39f25a7fd2094f29a76bc735bf2`; restored `27c25b11…`, `dirty=0` | the same |
| The five conversation suites, concurrency 4 | `exit=0`, 138/138 | `exit=0`, 138/138 |
| Every `*.db.test.ts`, serial | 0, 748/748 | 0, 748/748 |
| `pnpm test:sql` | 0, "46 migrations, 5 test files passed" | — |
| `pnpm check` | 0: unit 2332 (2331 pass, 1 skipped), integration 88 (86 pass, 2 skipped) | — |

**The three intended differences:**
- **The footprint test:** exactly N4's 11 functions.
- **The two scrub tests:** only `byte_length` (1518 → 0) and `context_hash` differ.

**The closing census, both clusters:**
- roles `postgres`, `sophia_api`, `sophia_worker`;
- databases `postgres`, `template0`, `template1`;
- 0 other clients, 0 test processes.

## The artifact identities, in full

`pnpm check` ran `node scripts/build-artifacts.mjs` (sha256 above). The script compares each built value with the one recorded in `config/runtime-unit.json` at that path, and the built profile lockfile with the committed `config/dsh/profile/pnpm-lock.yaml`. Its own result line was "runtime unit sophia-runtime-wbc02-dev: all artifact identities reproduced", with eight `match` lines and none `MISMATCH` or `UNRECORDED`.

**For 1–7, the expected value (recorded at `f0afe14b`) and the built value are the same bytes,** compared as canonical JSON. So each value is given once:

| # | Identity | Expected = built |
|---|---|---|
| 1 | `dsh.artifacts_by_platform.linux-x64` | `{"digest":"sophia-tree-v2:sha256:4552d08f78b47b7d0f16e79a92c487cffdfc5bb0a05eaef867c89ba837479a12","entries":27747}` |
| 2 | `dsh.release_integrity` | `{"@deepseek-ai/dsh@0.2.0-rc.2":"sha512-EAJ3gPNcVt/uv8X19PMm9NkVhWgT7xXNMk0UKCVm+IQ5rpSQOcsMUa0HWlnYYVybKMsccjcRB21vVVsaXQ6IdA==","@deepseek-ai/dsh-base@0.2.0-rc.2":"sha512-AclHClefnPmUe2qoPrKMUvauA/KelYevYlxFdHLZGcPRqrDH+D21HyrwJmj4f7Iu5OO0IqfjB4zBOkwMp5h1ug=="}` |
| 3 | `workspace_lock_sha256` | `"fef64ddaf4c3445fd3e83d8c27bb9f731b4378c846f86e093f543c69e6676ff8"`, the sha256 of `pnpm-lock.yaml` at `f0afe14b` |
| 4 | `dsh.artifact_digest` | `"sophia-tree-v2:sha256:4552d08f78b47b7d0f16e79a92c487cffdfc5bb0a05eaef867c89ba837479a12"` |
| 5 | `sophia_bundle.archive_sha256` | `"b423d27eb70ef345137ee748a680a8664bb346786dbfb1ce6e7e6bb2193a8d19"` |
| 6 | `sophia_bundle.archive_integrity` | `"sha512-3GH/FKrctU3Uw6953WUHxUA0/GTA4/AYzsgXn00otZ9XRAl977nov/DNBjfiJhCWwEq9FtBo7Ham7DFx6p5lRA=="` |
| 7 | `sophia_bundle.artifact_digest` | `"sha256:b423d27eb70ef345137ee748a680a8664bb346786dbfb1ce6e7e6bb2193a8d19"` |

**#8, `config/dsh/profile/pnpm-lock.yaml`:**
- **Expected:** the committed file, sha256 `4a552801d5ee1fe0c9c32f9e6b5750f0a9f8c4c5e70977e3c759ebc8029fead4`.
- **Built:** the script reported `match`. Its comparison is byte equality of the whole text (`committedLock === profileLock`), so the built lockfile has the same sha256.
- **Not written to disk:** the script doesn't write the built lockfile out.

**Checked from the files the run left behind:**
- **The bundle archive** `.artifacts/sophia-dsh-bundle-0.1.0.tgz` has sha256 `b423d27eb70ef345137ee748a680a8664bb346786dbfb1ce6e7e6bb2193a8d19`. That equals identities 5 and 7.
- **The structured report** the script wrote, `.artifacts/identities.json` (1,040 bytes, sha256 `0977953d66ba428d07dcd4475f097fe775e8e85697e6e4c9def38e8f7110380b`), holds exactly identities 1–7 with the values above.
- **That report was compared with `config/runtime-unit.json` at `f0afe14b` again afterwards,** without a rebuild. All seven are the same.

**Log hashes:**

| What | sha256 |
|---|---|
| The whole `pnpm check` log (3,524 lines) | `dc0a21c76c8e7b9f8ba5029b8875512f01b6483a197520f2f2221237b8082a5d` |
| Its artifact section, `$ node scripts/build-artifacts.mjs` through the result line (18 lines) | `5a95d0adac1ed9e8e977b10b0e39cdd1c6c0992b4db9d70ed2fc64279009b1ea` |
| The set of its seven `built` lines | `5bc8ecbfe54d7e57e09b6cca003a7adb24816a33458bae0892fa8d889d369fe9` |

The seven `built` lines hash the same in Step B's run at `f36a8fa0` (`5bc8ecbf…`, identical), so the same artifacts were reproduced there.

## What this does not say

- It is not Codex's independent run. Codex's 138 + 10 on PostgreSQL 17.6 is separate.
- It qualifies no runtime, route, provider or live behaviour.
- It moves no PR head and merges nothing.
