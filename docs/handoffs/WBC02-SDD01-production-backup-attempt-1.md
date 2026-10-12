# WBC-02 / SDD-01 production backup preparation

- Human owner: Davide. Executor: Codex, task `01a10cf9-0fab-7561-9de4-702f30a511f4`.
- Base: `3c40b1c64eadaef56537a9e9123e71557cfd2a7b`; branch `codex/joint-production-backups-20261012`.
- Authority: direct 12 October direction to finish both missions without Claude, prepare the final deployment batch with daily backups, and inspect automatic code reviews after every push.
- Writable scope: API byte-store factory, private byte-backup modules/tests, validated renderer upload context and its HTTP tests, operational binding and this handoff. No shared CON runtime/Studio window is opened.
- Runtime unit: unchanged `sophia-runtime-wbc02-dev`; bundle and artifacts unchanged. New voice qualification deferred.

The new optional API disk copy closes the gap between database backups and report object bytes. It remains **off by default**. The source behavior and all recovery/capacity limits are in [REPORT_BYTE_BACKUP](../coordination/WBC-02/REPORT_BYTE_BACKUP.md). A source pass is not deployed backup acceptance.

PR #270's automatic security review of `39665346e1b46a5ecfe3a1835aaccb59397f4639` identified repeated fresh capture keys filling the shared pilot disk. The repair reserves cumulative job/project/global byte and count budgets durably before copying, including failed/uncertain writes. Both validated PNG/PDF lease paths propagate the stable job UUID. SQLite admission runs in bounded workers with fail-closed deadlines and no report bytes or credentials. It changes no migration or capture-name retry protocol; upstream slot/claim accumulation remains outside this filesystem capacity guard.

Validation, exact candidate identity and independent/automatic review dispositions are recorded with each immutable PR head. Before pushing, obtain the repository-required independent review; after every push inspect the fresh automatic review and address actionable findings before merge. No source or operational acceptance is asserted by this uncommitted handoff.

Production remains in the separately reviewed batch: current API, dispatcher, runtime and bridge; Studio; reused renderer; private Paperclip; existing Supabase with restricted permanent database/login and private report storage; daily backups; explicit access/credential custody; migrations and rollback; cumulative model/image allowance and direct app verification. Legacy Render/Vercel cleanup has its own operator receipt. No new service, disk, credential, model call, migration or deployment was performed by this source change.
