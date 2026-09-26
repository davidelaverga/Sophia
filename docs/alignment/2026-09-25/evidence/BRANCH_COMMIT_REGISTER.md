# Repository register — 25 September 2026

Repository: https://github.com/davidelaverga/Sophia. Main: `01d9117bdcf9ec8ee18cd5414aa08ee4f24265a3`. Integrated working head: `29a570c33feb97a6bc04ea357c84087a47c9b055` (`studio/qol`).

## Coverage and limitations

The review enumerated all 12 visible remote branch heads, the 19-commit main history and the additional 45 commits on the cumulative Studio stack: **64 unique reachable commit records**. It reviewed metadata/messages, all 12 PR descriptions, selected implementation files and current head checks. This is not a claim to have audited every changed line or unreachable/deleted history. Unpushed local work is outside coverage. Merge commits are included; they are not additional delivered features. Descriptions below are review summaries, not verbatim commit subjects.

The comparison reports the working head 45 commits ahead of main and zero behind. Its history contains the other visible branch heads. Do not add the ahead counts of stacked branches together.

The final branch-list recheck was unchanged from the initial inspection. Re-read refs, PR states and checks when starting implementation.

## Branches

| Branch | Inspected head |
|---|---|
| `main` | [`01d9117b`](https://github.com/davidelaverga/Sophia/commit/01d9117bdcf9ec8ee18cd5414aa08ee4f24265a3) |
| `claude/mission-1-repo-setup-yjjjn2` | [`f8f7b3d2`](https://github.com/davidelaverga/Sophia/commit/f8f7b3d2bd2816b4b3b09dab88173c50fa38b8f5) |
| `docs/pack-v0.4` | [`459744a1`](https://github.com/davidelaverga/Sophia/commit/459744a1fee941d19f9d2ac3f2bbcc70ce142f33) |
| `s1-02/admit-command` | [`e85db976`](https://github.com/davidelaverga/Sophia/commit/e85db976efc618d24f220600ddbda5705b8fc091) |
| `tooling/clean-code` | [`e9aa9d4f`](https://github.com/davidelaverga/Sophia/commit/e9aa9d4ff595a51ffe9a95ba92e42c70af773f7b) |
| `s1-02/response-validators` | [`66b8ca84`](https://github.com/davidelaverga/Sophia/commit/66b8ca849a91d1f13253ad13a6f45f93c5861095) |
| `deploy/render-vercel` | [`ff22a249`](https://github.com/davidelaverga/Sophia/commit/ff22a249c5d0ec75ab72f62d775bba347a28a40a) |
| `s1-04/studio-shell` | [`4bd8cb10`](https://github.com/davidelaverga/Sophia/commit/4bd8cb10a70147254280f52a17c9c65dd10f05ec) |
| `studio/vision` | [`e5a7b756`](https://github.com/davidelaverga/Sophia/commit/e5a7b756982f0169a0d4155c81ea37b4935e5b51) |
| `rooms/access` | [`39929967`](https://github.com/davidelaverga/Sophia/commit/39929967b8c1f3d2d480a3d83245ba5947ed7d02) |
| `studio/precise` | [`0554dd69`](https://github.com/davidelaverga/Sophia/commit/0554dd69870b50650fd89670677b35a445bf921d) |
| `studio/qol` | [`29a570c3`](https://github.com/davidelaverga/Sophia/commit/29a570c33feb97a6bc04ea357c84087a47c9b055) |

## Pull request disposition at inspection

| PR | Role | State |
|---|---|---|
| 1 | Repository and reproducible runtime unit | Merged |
| 2 | Native control bridge and supervisor; recovery fixes | Merged; live product acceptance still pending |
| 3 | Cumulative v0.4 documentation import | Open |
| 4 | S1-02 database/API/admission/replay | Open |
| 5 | Scoped clean-code tooling | Open |
| 6 | Generated response validators | Open |
| 7 | Hosted origins, routing and authentication | Open |
| 8 | S1-04 Studio and human voice room | Draft |
| 9 | Visual language, light and video | Draft |
| 10 | S1-04A invitations/lobby/sessions | Draft |
| 11 | Typography, controls and shortcuts | Draft |
| 12 | QOL, decline versus block | Draft |

## Main history (19)

| Commit | Review summary | PR |
|---|---|---|
| [`cde6072d`](https://github.com/davidelaverga/Sophia/commit/cde6072d9bb3f517f04ffeba030162045813d5aa) | Initialize new repository | [1](https://github.com/davidelaverga/Sophia/pull/1) |
| [`314aa685`](https://github.com/davidelaverga/Sophia/commit/314aa685ca86329b03aac7d04fa0ab08cd719bfb) | Build reproducible S1-01 runtime unit | [1](https://github.com/davidelaverga/Sophia/pull/1) |
| [`94f0e5f8`](https://github.com/davidelaverga/Sophia/commit/94f0e5f85f5c74aae3fb04ede26fd1f116e6f145) | Make deployed runtime digest independent of checkout location | [1](https://github.com/davidelaverga/Sophia/pull/1) |
| [`b7798432`](https://github.com/davidelaverga/Sophia/commit/b7798432b773b086ff3f47a6acce139ef530e32f) | Record platform-specific identity and isolate temporary files | [1](https://github.com/davidelaverga/Sophia/pull/1) |
| [`1467f834`](https://github.com/davidelaverga/Sophia/commit/1467f834af8bb4197b759a20f0497cd147594d59) | Record S1-01 evidence and handoff | [1](https://github.com/davidelaverga/Sophia/pull/1) |
| [`5522a4ec`](https://github.com/davidelaverga/Sophia/commit/5522a4ec59b99a8d6638554779b669421c21b8ef) | Initialize GitHub repository history | [1](https://github.com/davidelaverga/Sophia/pull/1) |
| [`fb12ab85`](https://github.com/davidelaverga/Sophia/commit/fb12ab85658ca2f6645219456646f3f1f44af34d) | Join repository initialization histories | [1](https://github.com/davidelaverga/Sophia/pull/1) |
| [`c934e83d`](https://github.com/davidelaverga/Sophia/commit/c934e83d5613a67fa4d6fd07aa61fefafb6e26c0) | Update initial handoff metadata | [1](https://github.com/davidelaverga/Sophia/pull/1) |
| [`014a85fc`](https://github.com/davidelaverga/Sophia/commit/014a85fc0db24c9bab4de681894986a118b10112) | Tree digest v2 ignores empty directories | [1](https://github.com/davidelaverga/Sophia/pull/1) |
| [`363be147`](https://github.com/davidelaverga/Sophia/commit/363be14742cad3b3a30bc73da06b4e37a4b119b1) | Ensure pinned pnpm is available during profile installation | [1](https://github.com/davidelaverga/Sophia/pull/1) |
| [`74936ef6`](https://github.com/davidelaverga/Sophia/commit/74936ef606458b288da548e5fda78be4dce672ab) | Verify installed bundle bytes rather than composition alone | [1](https://github.com/davidelaverga/Sophia/pull/1) |
| [`fbaec894`](https://github.com/davidelaverga/Sophia/commit/fbaec894a63b8075a87e809d484bf0e092f029e5) | Merge PR 1, reproducible runtime foundation | [1](https://github.com/davidelaverga/Sophia/pull/1) |
| [`0b09b6cd`](https://github.com/davidelaverga/Sophia/commit/0b09b6cd3e4a959ee174d803b27246267a288462) | Record approved S1-03 development model route | [2](https://github.com/davidelaverga/Sophia/pull/2) |
| [`4eedb573`](https://github.com/davidelaverga/Sophia/commit/4eedb573fedf78c56d6be9150ba719b7ed65e556) | S1-03 control bridge, journal and public Agent operations | [2](https://github.com/davidelaverga/Sophia/pull/2) |
| [`456ca980`](https://github.com/davidelaverga/Sophia/commit/456ca980240f2727d64c6038cded784781f4d5a6) | Five scoped roles and nested-tool guards | [2](https://github.com/davidelaverga/Sophia/pull/2) |
| [`36dd7099`](https://github.com/davidelaverga/Sophia/commit/36dd7099a99b08947799fd813b728f1a2d566b5f) | Execution-host supervisor and live-steer acceptance command | [2](https://github.com/davidelaverga/Sophia/pull/2) |
| [`a27c019a`](https://github.com/davidelaverga/Sophia/commit/a27c019a53706183f8d944f93bc7b9d314077625) | Repair recovery findings from first Codex review | [2](https://github.com/davidelaverga/Sophia/pull/2) |
| [`f8f7b3d2`](https://github.com/davidelaverga/Sophia/commit/f8f7b3d2bd2816b4b3b09dab88173c50fa38b8f5) | Repair six further ordering/replay/settlement findings | [2](https://github.com/davidelaverga/Sophia/pull/2) |
| [`01d9117b`](https://github.com/davidelaverga/Sophia/commit/01d9117bdcf9ec8ee18cd5414aa08ee4f24265a3) | Merge PR 2, S1-03 implementation with live acceptance pending | [2](https://github.com/davidelaverga/Sophia/pull/2) |

## Additional stack history (45)

Grouped for review; order below is not a new merge sequence. Read the actual graph for ancestry. Broad S1-01 formatting in an early tooling commit was subsequently backed out; do not restore it from the historical commit.

| Commit | Review summary | Primary PR |
|---|---|---|
| [`29a570c3`](https://github.com/davidelaverga/Sophia/commit/29a570c33feb97a6bc04ea357c84087a47c9b055) | Lobby: question stands alone and undo divider removed | [12](https://github.com/davidelaverga/Sophia/pull/12) |
| [`7ff23865`](https://github.com/davidelaverga/Sophia/commit/7ff23865cae272469d2aeccda431daee618159d7) | Decline versus block; amendment A03 and migration 0011 | [12](https://github.com/davidelaverga/Sophia/pull/12) |
| [`f8051e83`](https://github.com/davidelaverga/Sophia/commit/f8051e83e768caa092144aaaf1d77a752fdd1757) | Explicit pass-floor menu and readable composer note | [12](https://github.com/davidelaverga/Sophia/pull/12) |
| [`92f2abff`](https://github.com/davidelaverga/Sophia/commit/92f2abff0198ac77f7dc5cdaace4f1fd9d2d7fae) | Remembered media choices and honest device/connection feedback | [12](https://github.com/davidelaverga/Sophia/pull/12) |
| [`a6e0edfd`](https://github.com/davidelaverga/Sophia/commit/a6e0edfd6f359f1c97004308bf1498f3de16254b) | Viewer controls, floor authority and plain-language work state | [12](https://github.com/davidelaverga/Sophia/pull/12) |
| [`16a5eb98`](https://github.com/davidelaverga/Sophia/commit/16a5eb9806c8ed32a5cb344f82f9206b0fafa8a8) | Invitation delivery, confirmations and keyboard focus | [12](https://github.com/davidelaverga/Sophia/pull/12) |
| [`d131f14a`](https://github.com/davidelaverga/Sophia/commit/d131f14a7ab5430b04ca2bcab045b824494ecf42) | Sign-in and invitations across tabs, network errors and accounts | [12](https://github.com/davidelaverga/Sophia/pull/12) |
| [`9de262c9`](https://github.com/davidelaverga/Sophia/commit/9de262c9f2d3f1c1e3c21b2156693b003e7e4f6f) | Access copy, guest tab titles and draft disclosure | [12](https://github.com/davidelaverga/Sophia/pull/12) |
| [`2104d2a2`](https://github.com/davidelaverga/Sophia/commit/2104d2a2090d4f89be3b1e6ce2aff26aa5dde652) | Remove internal goal codes from Studio copy | [12](https://github.com/davidelaverga/Sophia/pull/12) |
| [`97585c04`](https://github.com/davidelaverga/Sophia/commit/97585c04716a189c9a70c9f4094aac4edb1403a6) | Lobby visible across views and waiting-count tab title | [12](https://github.com/davidelaverga/Sophia/pull/12) |
| [`c3c359af`](https://github.com/davidelaverga/Sophia/commit/c3c359af9797382fa0b979e4af983a687dfc2b55) | Per-device recent projects | [12](https://github.com/davidelaverga/Sophia/pull/12) |
| [`0554dd69`](https://github.com/davidelaverga/Sophia/commit/0554dd69870b50650fd89670677b35a445bf921d) | Light frame radii and human-readable room event labels | [11](https://github.com/davidelaverga/Sophia/pull/11) |
| [`4ed8265d`](https://github.com/davidelaverga/Sophia/commit/4ed8265d9eb5ac39f4b138ca9f0b94cf1edecca9) | Geist typography, square controls, shortcuts and tips | [11](https://github.com/davidelaverga/Sophia/pull/11) |
| [`39929967`](https://github.com/davidelaverga/Sophia/commit/39929967b8c1f3d2d480a3d83245ba5947ed7d02) | S1-04A access, invitations, lobby and room sessions; A02/0010 | [10](https://github.com/davidelaverga/Sophia/pull/10) |
| [`e5a7b756`](https://github.com/davidelaverga/Sophia/commit/e5a7b756982f0169a0d4155c81ea37b4935e5b51) | Room-centered visual language, animated light, cameras and screen share | [9](https://github.com/davidelaverga/Sophia/pull/9) |
| [`4bd8cb10`](https://github.com/davidelaverga/Sophia/commit/4bd8cb10a70147254280f52a17c9c65dd10f05ec) | Close DB test resources despite failed room-child cleanup | [8](https://github.com/davidelaverga/Sophia/pull/8) |
| [`03ec20d1`](https://github.com/davidelaverga/Sophia/commit/03ec20d18d182d5bf6a5d1b168e611e4dbf3a4ab) | Room dock, input floor, evidence and handoff | [8](https://github.com/davidelaverga/Sophia/pull/8) |
| [`1891fe57`](https://github.com/davidelaverga/Sophia/commit/1891fe578ce736c89e217ddf6d95fe4f8a38afdc) | Type-only pg import and non-shadowed test hook | [8](https://github.com/davidelaverga/Sophia/pull/8) |
| [`b059a629`](https://github.com/davidelaverga/Sophia/commit/b059a62917b233eba8ca606da9825bdd6b6b69cb) | Merge deployment branch into Studio work | [8](https://github.com/davidelaverga/Sophia/pull/8) |
| [`13533aff`](https://github.com/davidelaverga/Sophia/commit/13533aff49ec3517654ffcfa71ecf4ae747aa90d) | Room DB/HTTP tests and local LiveKit dev setup | [8](https://github.com/davidelaverga/Sophia/pull/8) |
| [`1df64b8f`](https://github.com/davidelaverga/Sophia/commit/1df64b8f21f00b93b68754fd12ba295e00ecf8cb) | Merge updated S1-02 stack and main runtime into Studio | [8](https://github.com/davidelaverga/Sophia/pull/8) |
| [`074bcd5b`](https://github.com/davidelaverga/Sophia/commit/074bcd5bb90fd09173fdc6ceeda6e27c5fe97dbc) | Room contract A01, migration0009, token/floor WIP checkpoint | [8](https://github.com/davidelaverga/Sophia/pull/8) |
| [`ff22a249`](https://github.com/davidelaverga/Sophia/commit/ff22a249c5d0ec75ab72f62d775bba347a28a40a) | Merge S1-02 review fixes into deploy branch | [7](https://github.com/davidelaverga/Sophia/pull/7) |
| [`66b8ca84`](https://github.com/davidelaverga/Sophia/commit/66b8ca849a91d1f13253ad13a6f45f93c5861095) | Merge scoped tooling and S1-02 fixes into validators | [6](https://github.com/davidelaverga/Sophia/pull/6) |
| [`e9aa9d4f`](https://github.com/davidelaverga/Sophia/commit/e9aa9d4ff595a51ffe9a95ba92e42c70af773f7b) | Merge S1-02 updates into scoped tooling | [5](https://github.com/davidelaverga/Sophia/pull/5) |
| [`e85db976`](https://github.com/davidelaverga/Sophia/commit/e85db976efc618d24f220600ddbda5705b8fc091) | LISTEN reconnect via Promise.withResolvers; ES2024 | [4](https://github.com/davidelaverga/Sophia/pull/4) |
| [`4b48dc84`](https://github.com/davidelaverga/Sophia/commit/4b48dc84d9d9fc1b111b28eef6b4d71a1bb5b870) | Merge S1-02 into tooling | [5](https://github.com/davidelaverga/Sophia/pull/5) |
| [`9ce42f03`](https://github.com/davidelaverga/Sophia/commit/9ce42f03d1e518862676d89d3b29ef8deb34468a) | Narrow formatting/lint gate to product code; restore runtime-owner files | [5](https://github.com/davidelaverga/Sophia/pull/5) |
| [`73a69d45`](https://github.com/davidelaverga/Sophia/commit/73a69d4564bd893be049ac48e4ee58e51cbb5082) | Wait for LISTEN recovery through a promise instead of polling | [4](https://github.com/davidelaverga/Sophia/pull/4) |
| [`805f5e28`](https://github.com/davidelaverga/Sophia/commit/805f5e288ceca1a3baabc055ebcfafb630afec0a) | Preserve SSE disconnect flag through strict control-flow analysis | [4](https://github.com/davidelaverga/Sophia/pull/4) |
| [`04c978dc`](https://github.com/davidelaverga/Sophia/commit/04c978dc7a4bad960e1ba3f4ecc6643656282e38) | Fix encoded-route auth, pool errors, SSE cleanup and LISTEN recovery; migration 0008 | [4](https://github.com/davidelaverga/Sophia/pull/4) |
| [`1f2ed0b5`](https://github.com/davidelaverga/Sophia/commit/1f2ed0b5c8c24c38a2b41a5e1d508274cbc1e4f1) | Merge main S1-03 and pack into S1-02 as a union | [4](https://github.com/davidelaverga/Sophia/pull/4) |
| [`459744a1`](https://github.com/davidelaverga/Sophia/commit/459744a1fee941d19f9d2ac3f2bbcc70ce142f33) | Merge main runtime into v0.4 documentation import | [3](https://github.com/davidelaverga/Sophia/pull/3) |
| [`c1f77512`](https://github.com/davidelaverga/Sophia/commit/c1f77512a30f58dbd7ba04b11ef97d80fc89a122) | Handle dashboard invitations and cross-device sign-in codes | [7](https://github.com/davidelaverga/Sophia/pull/7) |
| [`60653583`](https://github.com/davidelaverga/Sophia/commit/60653583ec6b4c07a5d6b46c54495f6298a65b6a) | Repair Vercel SPA deep-link rewrites | [7](https://github.com/davidelaverga/Sophia/pull/7) |
| [`6b5faf4f`](https://github.com/davidelaverga/Sophia/commit/6b5faf4f163b0ae1406b840ae5f6c6f42782875b) | Add Studio API origin and API CORS for hosted services | [7](https://github.com/davidelaverga/Sophia/pull/7) |
| [`846b177f`](https://github.com/davidelaverga/Sophia/commit/846b177f2f79e30ad1d5e53ebd3cd80c920ef632) | Create Studio shell, shared project feed and per-viewer lenses/drafts | [8](https://github.com/davidelaverga/Sophia/pull/8) |
| [`cf48e8f8`](https://github.com/davidelaverga/Sophia/commit/cf48e8f8f219a274792467e437ec8e13c401a2a5) | Generate and enforce browser/API/SSE response validators | [6](https://github.com/davidelaverga/Sophia/pull/6) |
| [`42133012`](https://github.com/davidelaverga/Sophia/commit/42133012bd519c55a6bed11d1d0ae85008657ac9) | Format old S1-01 scripts; later removed by scoped-tooling revision | [5](https://github.com/davidelaverga/Sophia/pull/5) |
| [`0b859672`](https://github.com/davidelaverga/Sophia/commit/0b859672a2681fc685309983936f5d0ea7d1b339) | Introduce Prettier, typed lint, size limits and contribution rules | [5](https://github.com/davidelaverga/Sophia/pull/5) |
| [`5305facf`](https://github.com/davidelaverga/Sophia/commit/5305facf7ae4f0c9b12cd6c02511ee12c8894ff1) | Remove remaining regex escape after test conversion | [4](https://github.com/davidelaverga/Sophia/pull/4) |
| [`8bc8e3ac`](https://github.com/davidelaverga/Sophia/commit/8bc8e3aca0bdd36f3f14ee345fb2fed6a7f0487b) | Tidy converted node:test tests and type narrowing | [4](https://github.com/davidelaverga/Sophia/pull/4) |
| [`2a50ab92`](https://github.com/davidelaverga/Sophia/commit/2a50ab923591ace6e64d0a713546dbcfee225f5e) | S1-02 SQL, auth, API, persistence, outbox and Studio work view | [4](https://github.com/davidelaverga/Sophia/pull/4) |
| [`1e865660`](https://github.com/davidelaverga/Sophia/commit/1e865660dc3b143091587ad4d81be5e131f76055) | Force LF checkout to preserve frozen pack and contract bytes | [4](https://github.com/davidelaverga/Sophia/pull/4) |
| [`b8b7151f`](https://github.com/davidelaverga/Sophia/commit/b8b7151fa23f5c2ab558b13bc56fe98e85961a19) | Import cumulative v0.4 Part 2 pack; web/pdf and web/deck renderer direction | [3](https://github.com/davidelaverga/Sophia/pull/3) |

## Check evidence

At `29a570c33feb97a6bc04ea357c84087a47c9b055`, GitHub reports successful runtime-unit, PostgreSQL 16 SQL/persistence/API, and local-Supabase-auth jobs for the latest inspected PR workflow. Push and PR triggers produce duplicate check families; do not count six checks as six independent test suites.

[Workflow run](https://github.com/davidelaverga/Sophia/actions/runs/36101824521)

No tests were rerun by this audit. The report's 86 database-test count and earlier handoff counts refer to their own revisions and scopes. CI does not establish hosted LiveKit credentials, actual two-human audio, Google inference, deployment branch configuration or end-to-end product acceptance.
