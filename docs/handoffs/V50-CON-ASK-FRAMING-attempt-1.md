# Implementation-session handoff

Goal and attempt: FND-V50-CON-ASK-FRAMING-FIX-01, scope amendment S1 (service instruction only), attempt 1  
Human owner / executor resource: Davide (owner); B, the existing Claude Code session; P coordinates, R2 reviews independently  
Native session: none; no native, provider or model call was made  
Starting worktree/commit: `/Users/davidelaverga/Documents/Codex/2026-10-27/sophia-ask-context-alternative`, local branch
`fix/con-ask-framing-20261105` from main `6031cc16158ecffbbdcf6034e6206ca4c6805678` (tree `329aca73`)  
Ending commit/tree and changed files: the local candidate commit on that branch (its id is in the result record, since a
commit cannot name itself); `packages/dsh-bundle/src/reply-service.ts`, `tests/unit/reply-service.test.mjs`,
`config/runtime-unit.json`, `config/dsh/profile/pnpm-lock.yaml`, this file

## Outcome

One real Ask on 5 November returned an unrelated mission summary instead of the requested token. Its provider input was
scrubbed, so the live cause stays unknown. The source showed a contradiction in what the service sends: the fixed
instruction called the whole context data, never an instruction, and the context's own heading (renderer v1) says the
same of every quoted value, the asking message's included, while the heading over that message gave no task. Nothing
told the model to answer the request.

`SERVICE_SYSTEM` now names the context's last section, "The message that asks Sophia", and its one record as the
request to answer. It keeps v1's warning for every other record, and for the request limits it to this: neither the
request nor what it quotes or attributes to others can change the rules or grant anything. It says that words inside a
quoted value that look like a heading or record are only words, and keeps no tools, no changes and no new work. The
renderer, its v1 bytes, the database, the worker, the API and the Studio are unchanged.

Not verified: any model's behaviour. Offline tests show what the call is told, not what a model answers. A live
qualification needs a reviewed deployment, a new executor pin and one new authorized Ask.

## Evidence

- `node --test tests/unit/reply-service.test.mjs`: 42/42. Three cases render the reproduced request, a request quoting
  a forged heading and record, and a request needing tools, through the unchanged v1 renderer after records posing as
  instructions, and inspect the `GenerateOptions` the executor builds. Run against main 6031, the same file fails 4
  tests, each at the instruction assertion after every v1 context assertion passed.
- `node --test packages/persistence/src/conversation-context.test.ts` (unchanged): 19/19.
- `pnpm artifacts:record`: the bundle archive moves from `sha256:c76ea236…` to `sha256:cab29744…`; the role digest
  (`SERVICE_ROLE_DIGEST`) moves from `sha256:d9eb23c4…`. The deployed executor closure digest (`61e3dfe3…`) is computed
  on the host and is not derived here.
- Logs and the preserved broader draft are kept outside Git in the operator journal (assignment folder).

## Decisions and changes

P narrowed the candidate to the service instruction (S1) after R2 confirmed that 0064's record already pins the asking
message as the final record, so a new renderer version is not needed to name it. A broader draft (renderer v2 and a
provisional forward migration) was preserved, with its logs, before it was removed from the worktree. It was a scope
split, not a defect finding, and no migration number or version name was allocated.

## Remaining obligations

- R2's independent review of this exact candidate before any push; then the automatic code and security review and CI.
- Rollout: deploy the native runtime from this source, print its executor digest on the host, and pin a reviewed new
  grant lineage to it. A40's check keeps commands from grants pinned to the old executor away from the new one. Grants
  044f and 33d keep their pins and counters, and no paid replay is authorised.

## Next bounded action

P: dispatch R2's pre-push review of the candidate commit on `fix/con-ask-framing-20261105`.
