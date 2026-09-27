# Database foundation — executable candidate, not deployed

Four ordered migrations establish the initial schema, least-privilege query roles, selected atomic goal commands/candidate publication and outbox claim/unknown-effect handling. PostgreSQL **15 or later** is the chosen target. Supabase Auth identities are UUIDs checked by the application; the schema does not create passwords or vendor accounts.

## Run on a disposable database first

Use a fresh database with a migration owner allowed to create schemas/roles. Do not run this pack against the existing Sophia database. These versioned migrations intentionally do not use blanket IF NOT EXISTS table creation: incompatible pre-existing objects must fail visibly.

```sh
for file in db/migrations/*.sql; do
  psql "$SOPHIA_DISPOSABLE_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$file" || exit 1
done
psql "$SOPHIA_DISPOSABLE_DATABASE_URL" -v ON_ERROR_STOP=1 -f db/tests/0001_scope_and_commands.sql
```

The SQL test encloses its fixtures in a transaction and rolls them back. It tests two actors, cross-project reads, private source exclusion, duplicate and conflicting admission, Hold fencing, premature Resume and revoked-member receipt access. It is authored **but not run** in this environment: no PostgreSQL server/client or container daemon is available. Text checks and reference TypeScript tests do not certify it.

Deployment provisions distinct login users and grants `sophia_api` or `sophia_worker`; passwords are injected outside the repository. Neither login may inherit the migration owner or BYPASSRLS. Do not run the application using the Supabase service-role key for ordinary user queries. The credential broker is a separate trusted path to encrypted `sophia_secrets` records, with its own narrowly provisioned database access. Never grant those records to the models, generated apps, or browser.

## Function coverage

| Function | Supplied behavior | Caller |
|---|---|---|
| actor_id / is_member / can_edit | Current transaction actor and membership/role checks | API reads and checked writes |
| create_project | Project + initial creator membership + empty frame atomically | API |
| admit_goal_command | Semantic JSON equality/idempotency, revisions/epoch, source eligibility, control fence, metadata event and deterministic target outbox records | API |
| publish_candidate | Current goal/epoch/source, trusted validation and expected stable-head CAS | API |
| claim_outbox | Bounded SKIP LOCKED claim of pending entries; fresh lease; cleanup priority | Worker |
| expire_dispatch_leases | Dispatching → outcome_unknown, never pending | Worker |
| settle_goal_control | Current control epoch, settlement evidence reference, no remaining native bindings or earlier unknown ordinary writes | Worker |

The SQL stores a normalized JSONB semantic request assembled **inside** `admit_goal_command`; equality, not a caller-supplied hash, determines duplicate admission. The HTTP layer can also hash its canonical request for diagnostics, but cannot bypass this comparison.

A three-resource Hold produces one target outbox record per existing native binding; a targetless Hold has a control-settle record. A steer is sent to the lead's amendment procedure, not broadcast blindly to every engineer. The lead creates its bounded worker deliveries separately. Review and Resume likewise schedule the relevant lead action. Claiming any outbox row is not proof its native action succeeded.

## Explicit remaining product handlers

These migrations do **not** implement all 33 HTTP operations. Membership invitation/revocation functions, source import/release/Forget cascades, peer assignment admission, typed decision acceptance, credential rotation, per-recipient delivery completion, external-effect reconciliation and artifact validation writers are still product implementation in their named goals. No unrestricted generic write endpoint substitutes for them. New handlers must follow the same project lock order and current scope checks.

`publish_candidate` expects a trusted validator to have marked the exact source version; this function cannot establish model correctness or render quality. The HTTP handler verifies the submitted verificationSourceId equals the candidate's stored validation source. Publication is not goal completion. The API response/snapshot event for publication must be committed in the **same transaction** as the pointer change; the supplied function is a primitive called inside that handler transaction, not the entire HTTP operation.

Before declaring S1-02 complete, run this SQL suite and extend it for: simultaneous duplicate writes, two competing publishers, cross-project composite FK rejection, denied direct DML, lease expiry during an actual HTTP call, grant revocation while queued, source-withdrawal races, and connection-pool actor leakage. Run two-client concurrency tests on actual PostgreSQL rather than treating a sequential mock as concurrency proof.

## Storage and operational boundaries

Use private Supabase Storage buckets. Ordinary browser access is via a short-lived application-authorized signed URL, never a public bucket. Verify MIME, size, checksum and current ownership at upload completion. Object storage privileges and API credentials do not belong in these SQL tables in plaintext.

All API sequences are decimal strings. Keep project events content-minimal; native prompt/log text is a separately authorized source. Private source metadata is owner-visible; project views must project safe fields rather than SELECT * over resource rows that include repository paths. Sources with several parents need eligibility checked against the entire lineage. Revocation triggers active-runtime retirement and controlled-copy cleanup in addition to database flags.

RLS owners/superusers can bypass policies; that is why migration credentials never serve normal traffic. Narrow SECURITY DEFINER helpers intentionally read membership without recursive RLS, have fixed search paths and no public EXECUTE. This is defense against scope mistakes, not protection from a compromised trusted API that can set any transaction actor. [DB-01, DB-02]
