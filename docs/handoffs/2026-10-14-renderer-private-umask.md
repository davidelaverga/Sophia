# Renderer input under the private startup mask

Goal and attempt: SDD-01 / WBC-02, first production PDF gate, renderer permission repair.  
Human owner / executor resource: existing Sophia release operator, existing renderer.  
Native session: the existing pilot session was retained; no replacement task.  
Starting commit: `98ff7edbfce1aeeee949f07733b3d969e5c8fb50`.  
Ending renderer implementation commit: `74d231d458d1e7f6bcff51550ad10f0288e3be85`; full tree `e3601cc325cebf3684eff0c3770ad1e48e74d6a4`, renderer subtree `0128f57b6353f6409b996862a269c3cf307b8133`. This subsequent handoff-only correction does not alter those renderer bytes. Source qualification remains pending.

## Outcome

The runtime Resume repair was deployed and woke the original pilot. Its first real PDF job failed before Chromium: the UML guest refused its input archive and produced no receipt or upload. The pilot is held and research admission is disabled; coordination remains disabled. No subsequent pilot was admitted.

The actual renderer supervisor inherited `umask 077` from the protected startup. Creating `input.tar` with requested mode `0644` therefore produced `0600`, which the guest's distinct UID could not read. A synthetic check on the existing host reproduced `EACCES` as UID 10001 and a successful read after an explicit `chmod 0644`. It made no provider calls and ran no guest kernel. The check's file was removed.

## Evidence

The native synthetic check confirmed the supervisor mask was `0077`; the work directory and its ancestors were searchable. The input was one 8,146-byte HTML entry, so directory traversal and a long package path did not explain the refusal. Private operational receipts retain the exact deployment, job, budget and source hashes.

The source regression runs a PDF through the supervisor's API/launcher/output boundary with the private mask, verifies delivery, and verifies the unrelated synthetic secret remains mode `0600` and the process mask remains `077`. The real UML image's PDF/capture/Stop qualification now starts with the same private mask. Local checks and fresh automatic code/security reviews must finish before integration; Linux image evidence remains required.

## Decisions and changes

After writing the job input, the supervisor explicitly applies its intended `0644` mode before starting the guest. The job directory remains owned by the render UID at `0700`; the archive remains root-owned and unwritable by the guest. The global mask, capability file permissions, launchers, isolation policy and receipt validation remain unchanged.

Changed files: `renderers/web/pdf/supervisor.mjs`, `renderers/web/pdf/test/supervisor-uml.test.ts`, `renderers/web/pdf/uml/supervisor-e2e.mjs`, and this handoff. No bundle, database schema, public route or model configuration changes.

## Remaining obligations

The successful runtime deployment does not pass the production PDF gate. All model calls settled; the pilot's cumulative spend is $0.044136, with zero outstanding reservation, uncertainty or generated images. Its original $2.80 ceiling and the cumulative $25/10-image ceiling still apply. The old uncertain-call hold remains retained. No temporary SSH key was registered.

## Next bounded action

Audit the exact repair head's local checks, automatic reviews, CI and real UML image receipt. Prepare a concrete renderer-only deployment amendment; the consumed runtime-only batch does not authorize this new renderer source. After approval and fresh preflight, resume the same held pilot without replacing it or resetting its costs. Keep later design/Paperclip work behind a real passing PDF round trip. Voice and live two-account acceptance remain deferred/unavailable as recorded.
