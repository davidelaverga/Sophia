# WBC-02 reviewer replacement concurrency regression

Human owner: Davide. Executor: Codex task `01a10cf9-0fab-7561-9de4-702f30a511f4`. Base `6d5a0aae704b5f3caf3e06f8266e2930c4737670`. Scope: one PostgreSQL test file and this handoff. Runtime unit and production source unchanged; no deployment, migration or provider call.

Push CI `38301624527`, job `114985652955`, failed the replacement test's exact reconcile-call count (three versus two). Its preceding one-live-replacement and both-assignees assertions passed. A contender can read a missing reviewer before the winner binds it, then reclaim the ended provisioning row after the winner settles. The pinned host's warm reconcile re-reads and returns the existing binding, without creating an agent or queuing model work. Counting reconciles as creations incorrectly rejects that permitted interleaving.

The test now counts the exact created population: the old terminated reviewer and one replacement. It retains the single live replacement, both assignments and final ended-claim assertions. A separate controlled crossing pauses the stale claimant before its claim, lets the winner bind and settle, then proves a third warm reconcile creates no additional agent and preserves both assignments and the final claim. Gates are released on failure, and new commission waits assert a bounded sentinel.

Validation and independent whole-diff review belong to the exact immutable candidate. Automatic review is checked after each push. This corrects the concurrency test without changing the provisioner, its SQL, host API or image runtime bytes; the deployment's image closure must distinguish changed test evidence from unchanged actual bundled inputs.
