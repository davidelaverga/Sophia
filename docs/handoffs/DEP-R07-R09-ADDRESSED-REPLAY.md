# DEP-R07/R09 addressed rollback replay

This local source integration lifts the reviewed backend behavior from
`1597c5dbd09cc47796115deba9f44e5f1ff14e86` onto the Conversations backend in #557
(`523b140640565a68830751d8baf2c37029e82134`).
The candidate tree, tests, and disposable database receipts are recorded in the sibling operator journal.

Migration 0133 preserves the exact 0128 addressed writers' authorization and prior-receipt checks.
It applies a transaction-local fresh-write guard after the prior lookup and installs a sentinel with both guards.
The default-off addressing switch accepts `replay` to recover existing Start and Send receipts.
Replay retains the A64 metadata read and skips actor-profile and observation writes. It leaves the legacy A33 handler
available while suspending the A49 unaddressed recorder. The held artifact observer, work-status, assessment, and Studio
components are outside this integration.

The PostgreSQL regression records an addressed Start and Send before installing 0133, then checks exact receipt recovery,
fresh-key refusal, current permission and erasure checks, and no changes to retained records or effect ledgers.
The dedicated upgrade rehearsal runs the checksum-ledger updater at the #557 migration tip.

Independent source review, ordinary and hosted checks, applicable App verification, and rollout remain separate.
