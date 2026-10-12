# Q13 local source qualification — Codex takeover

Base `d06f98a136173827bba1243ac8b4f3278eb6ddc1`. The accepted Q13A policy and source-only approval on #198 authorize local candidate/test changes; historical owners have not acknowledged this new pin. No applied migration changes. Proposed r5 SQL from `2ff7daeb` is the reviewed input, not new qualification.

States before implementation:
- Absent/bare assembler: install only with safe attributes, no memberships or dependencies anywhere in the cluster. Existing authority, members or another installation refuse atomically; nothing is normalized or revoked.
- Execution login: only assembler assumable; no broad API/worker or peer assumption. Claimed/begun/unexpired transaction plus its asker selects only that project; absent/wrong/settled claim, actor, project or lease yields no eligible rows.
- Operational writes: real fresh login receives permission denial before any API/worker function or direct writer outside the read allowlist runs. Existing API reads retain their predicates and behavior.
- Activation: every effective privilege/admission/session hold blocks use. PUBLIC admission changes do not settle a pre-existing connection; only its own client closes it. Grant/policy/role drift requires requalification. Local test grants/revokes affect only the freshly owned synthetic cluster and are removed with it.
- Live target: its template1 admission constraint is unresolved; Ask stays disabled regardless of local results. No hosted grants, migrations, connection termination or provider execution.

Affected source: S3 candidate and new read-only activation SQL; assembly module documentation; assembly database qualification tests; the fences test's isolated-role setup where its second database used to adopt the installed role. Shared predicates/functions/view are identity-checked and not rewritten. No runtime binary, bundle, execution-host, tool, role or model configuration changes.

Order: qualify bare identity and claim-bound reads; preserve S3/S4 lifecycle and compiler crossings; independent whole-diff review; ordinary gates; push; automatic review of that exact head. Promotion to 0049/0050 and live activation remain separate.

Independent review P1: r5's name/ACL allowlist missed disabled RLS or changed policies/callable/view semantics. The owned-PG regression failed before the correction. The activation check now binds all 38 SELECT policies (including extra policy detection), table RLS/owner flags, the view definition/options, and all S3 assembly/context helpers, triggers and the four shared read helpers by definition and owner. The S3 and S4 kept-trigger identities are the only reviewed alternatives. Deparsing requires `search_path=pg_catalog`; the installation owner is explicitly `postgres`; alternate owner or PostgreSQL major is held pending a reviewed identity. These catalog identities are source drift checks, not protection against a privileged administrator changing the database after the check.

Qualification is run only on a fresh exclusive owned loopback PostgreSQL cluster, with a 0700 owner-controlled directory and zero other clients before setup. A dedicated opt-in suite verifies actual outside admission before and after a local-only remedy, unchanged old-session liveness after revocation and voluntary client settlement, plus activation hold regressions. Ordinary test runs skip that dedicated cluster-wide suite; they do not imply its crossing passed. No shared or hosted cluster privileges are changed.
