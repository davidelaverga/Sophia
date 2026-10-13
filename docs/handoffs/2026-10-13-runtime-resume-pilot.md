# Held pilot Resume repair

Goal and attempt: S1-03 runtime control, joint SDD-01/WBC-02 first production pilot repair, 2026-10-13.  
Human owner / executor: Davide / Codex, one writer. Native coding session identity: unknown.  
Starting source: `9d9023f9c63a09a6426a0acf74f6e76bb22923d3`, branch `codex/runtime-resume-interrupted-pilot-20261013`. Ending source is the commit containing this handoff; runtime identity is recorded in `config/runtime-unit.json`.

## Outcome

The first real pilot failed Hold/Resume acceptance: Hold interrupted consumed work, leaving an empty native inbox. Resume lifted the fence and acknowledged delivery but did not wake the interrupted task. The native log ended with `aborted / hook / sophia-hold`. No PDF gate passed and the remaining pilot tasks did not start.

The source repair detects that native ending through public `foldConsumedWork` and sends one durable continuation through the existing native delivery path. It journals before lifting Hold, recovers a crash before delivery, and does not duplicate an already consumed continuation. Completed idle turns remain idle. Existing Stop, authority epoch, native identity, role and spending guards remain in place.

## Evidence

- Exact Node 24.21.0 / pnpm 11.7.0; frozen install passed.
- The first regression failed before the repair: Resume never continued consumed work.
- Four focused tests pass against the real pinned dsh runtime with a keyless model and fixture service: interrupted work, held restart and duplicate command, completed idle work, and crash replay both before and after native delivery.
- `pnpm check` passed: toolchain, formatting, lint, build, typecheck, contracts, 2,219 unit tests passed / 70 skipped, artifact reproduction, and 90 integration tests passed / 2 skipped. The two integration skips require disposable PostgreSQL; this run did not execute them. Platform/provider-dependent unit skips are not live qualification.
- Bundle archive SHA-256: `757f389e92710be0191f52e79964aa1285655bfb5f68342a908091ae1b000dd8`. Upstream pin, package dependencies and workspace lock did not change; the profile lock records the new bundle integrity.
- Source register: DSH-08–11 and new DSH-31. No new destination or schema was created.

Private operator evidence retains the production observation, native ending, four command settlements, spending ledger and gate closure. Those records are not copied into Git.

## Remaining obligations

This candidate is not deployed and does not claim independent review or production acceptance. The original pilot remains held; its three settled calls cost $0.019754, with no reservation, uncertain charge or generated image. Research and coordination grants were disabled, the worker coordination tuple removed and that closure deployed, and the temporary operator SSH key revoked with its sessions closed. Existing report bytes and native task history are retained.

No second owner account is available: live cross-account Key Studio isolation remains unverified. The owner approved using the first budgeted pilot as the PDF gate, but that gate is still incomplete. No new voice qualification, spending allowance or hosted database test is authorized by this repair.

## Next bounded action

Push the candidate, inspect automatic code/security reviews, and audit its CI before integration. Prepare the exact revised production batch and obtain approval for its changed candidate before deployment or paid continuation. Resume the existing lineage only under that approved batch; do not replace it or reset cumulative spending to hide this failed gate.
