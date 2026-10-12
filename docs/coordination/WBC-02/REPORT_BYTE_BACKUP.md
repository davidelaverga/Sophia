# Report object backup on the existing API service

Source preparation for Davide's 12 October 2026 direction: reuse Supabase and the renderer, add private Paperclip and a paid API, retain daily backups, defer new voice qualification, and keep the cumulative $25 / 10-image test ceiling. Nothing in this document activates a resource, creates access or authorizes a production deployment.

## The gap and the selected mechanism

Supabase's daily database backups contain object metadata, not the report bytes in Storage. The existing `sophia-next` project already has daily **PHYSICAL** backups; Codex observed snapshots dated 5–12 October, including 12 October 11:14:35 UTC. Those are project/cluster recovery, not a qualified Paperclip-only restore.

The API can keep an immutable, flushed copy of each object on its own small persistent disk **before** uploading the same bytes to Storage. Render automatically snapshots persistent disks every 24 hours and retains snapshots for at least seven days. This uses the existing API service; no backup scheduler, new worker, broader storage credential or database credential on Paperclip is introduced.

Proposed final-batch resource: one 1 GiB disk on `srv-daqrn08473hc73flhi8g`, mounted at `/var/data/report-byte-backup`. Indicative marginal disk cost $0.25/month, to be checked on the final account form. The proposed paid API is the account's $7/month 0.5 CPU / 512 MB plan. Adding a disk prevents overlapping instances and zero-downtime deployment; the release batch must account for that brief API restart.

## Configuration and states

`SOPHIA_STORAGE_BACKUP_ROOT=/var/data/report-byte-backup` enables copying; absent means the existing store is unchanged. The five existing `SOPHIA_STORAGE_*` S3 settings remain all-or-none. Setting only a backup root is refused.

- Startup requires an existing canonical absolute root that is a dedicated, non-volatile mount in Linux's actual mount table. An absent disk is not created as an ephemeral fallback. The provider disk ID, mount and persistence across recreation must still be verified on Render before admission.
- The API creates/checks its own `objects/` and project subdirectories at mode 0700, owned by its effective user. It refuses symlinks and directories readable by other users.
- Only canonical lower-case `<project UUID>/<source UUID>` keys and objects up to 32 MiB are accepted. Copies live at `objects/<project UUID>/<source UUID>`, with the **exact original bytes** and mode 0600. MIME and authoritative SHA-256 stay in the database records; backups do not create a second content catalogue.
- The existing database write-once claim still commits before this store is invoked. A private temporary file is opened exclusively, written and fsynced. A hard link commits its immutable final name without replacing an existing file. Parent directory entries are flushed too. Only then may the remote PUT begin.
- A failed, full, unavailable or slow backup refuses the upload. Copying has a ten-second application deadline. An operation that completes late can leave a private orphan, but cannot continue to a remote upload. The database claim is never released or reset by this code.
- If the remote PUT fails after copying, keep the copy and the uncertain claim. There is no automatic replay, refund, import or publication. A later retry still meets the ordinary database claim guard.
- Reads and signed URLs still use the existing authenticated Storage path. There is no backup reader route, local fallback or public backup URL.

## Retention and recovery

Live copies have the same retention obligation as the primary immutable report objects. They are not automatically erased by a database rollback or by a source's loss of read eligibility. Snapshot copies remain under Render's provider retention policy, **at least** seven days; this is not a promise of physical erasure within exactly seven days. Governed physical deletion must include both locations when it is performed. This source change performs no deletion.

Before deployment, retain the existing source/data census and a compatible PostgreSQL 17 logical export for the approved operation. Paperclip's persistent home separately uses its own Render disk's daily snapshots; its database stays in Supabase. Do not enable the unqualified JavaScript backup fallback in the upstream Paperclip pin.

Recovery is operator-controlled: close affected admission and settle/fence writers, choose compatible database and disk recovery points, match each copied object's canonical identity and SHA-256 to the restored ledger, then restore only missing approved bytes. A copy is not evidence that its source was published or remains eligible. Never overwrite a surviving object with different bytes or silently recreate a missing governed record. Reconcile Paperclip issue bindings with Sophia's ledger before reopening coordination.

Daily snapshots across providers are not atomic. A paired restore may require an older common recovery point; a strict whole-system 24-hour RPO is not proven by the cadence alone. Missing or inconsistent evidence stays unavailable. A project-wide database restore or a destructive disk restore requires its own actual recovery authority; ordinary rollback does not invoke either.

The 1 GiB size is a bounded pilot choice. Check free space and byte growth on the actual disk; a full disk stops new object writes. No automatic resizing, deletion or resource upgrade is permitted. Snapshot encryption at rest is provided by Render, not an application encryption key introduced by this patch.

## Qualification and rollout

Unit tests use real temporary filesystem I/O and a **labelled mount-table fixture**. They prove copy ordering, first-writer behavior, directory/file permissions, traversal/symlink refusal, restart retention, uncertainty, timeout and immutable input handling. They do not prove a mounted Render volume, a Supabase upload or provider snapshot recovery.

Before a production grant: bind the final source and deployment IDs; attach the actual API disk; prove the mount and private directories; upload one labelled synthetic object through the deployed API; compare its database SHA, Storage bytes and disk copy; recreate the API on the same disk and compare again; verify the daily snapshot is available when one is due. Keep new admission closed on any failure.

The final batch separately retains Supabase's daily backups, the Paperclip home disk and the cross-system recovery procedure. New voice qualification remains off, with PR #190's two billing findings open. This change touches no migration, runtime bundle, native role, prompt, contract or Studio path.

References checked 12 October 2026: [Supabase database backups](https://supabase.com/docs/guides/platform/backups), [Render disk snapshots and limitations](https://render.com/docs/disks).
