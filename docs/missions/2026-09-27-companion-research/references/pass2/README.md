# Sophia — Research agent and DeepSeek Harness upgrade
## Pass 2 package · 27 September 2026

**Status:** source-backed design and implementation strategy, not applied code, deployment authority or runtime test evidence.

## Start here

[Read the updated continuation ledger](Sophia_Mission_Companion_and_Research_Ledger_v0.2_2026-09-27.md) for the current direction, source corrections, proposed decisions and open bindings.

[Research implementation amendment](RESEARCH_AGENT_IMPLEMENTATION_PLAN.md) specifies one research-worker family; Markdown/PDF presets; source/evidence records; confined rendering; nonblocking Google admission and result delivery; mission integration; exact existing code seams; and bounded acceptance sessions.

[DeepSeek Harness upgrade strategy](DSH_UPGRADE_STRATEGY.md) separates installed rc.1, tagged rc.2 and latest-source candidates; identifies the newer failed-step recovery change; specifies coherent runtime identity, preset/restart compatibility, old/new data compatibility, cutover, fallback and tests.

[Prompt and skill candidates](prompts/RESEARCH_PROMPTS.md) provide the initial shared research procedure and format additions. These are not installed or measured.

[Source audit](SOURCE_AUDIT.md) distinguishes current source, repository documentation, existing plan, release claims and proposed design. Exact pins and available returned blob IDs are also in `evidence/source_manifest.json`.

## Main changes since pass 1

Native declarative presets already exist in Sophia's installed rc.1 source: no duplicate preset system is needed. Upgrade and activation are separate work. A newer main-source fix for failed-step tool-history pairing deserves a concrete regression test. Google tool-call termination is separate from durable job lifetime, and passive client content must explicitly set `turnComplete:false`. Native fetch does not read PDFs; native file presentation does not prove cloud delivery. The old PDF kernel is a useful same-blob donor, subject to the existing isolation changes. Later slides have a newer native-service donor question, deliberately outside this increment.

## Preservation and evidence

The original ledger is retained byte-for-byte under [prior/](prior/Sophia_Mission_Companion_and_Research_Ledger_v0.1_2026-09-27.md). Original plan ZIPs are unchanged.

No repository tests, paid provider calls, production changes or external writes were performed in this pass. The generated package validation checks local Markdown links, JSON syntax/source pins and preserved-file hashes only. A valid package is not a qualified runtime.

## Suggested implementation entry

Begin DSHU-01 target/compatibility qualification and RA-01 exact source/task/projection contract binding. UI and PDF fixed-kernel work may proceed in parallel under coordinated ownership. Release only the tested source unit and enabled capabilities; preserve the user's current model/payer and the outstanding S1-05A obligations.
