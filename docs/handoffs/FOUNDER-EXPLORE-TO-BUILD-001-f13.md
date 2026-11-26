# Founder Explore to Build · F13 verification return

Davide owns the pilot. Separate Codex backend and Studio contributors prepared this follow-up to PR #541 head `83b0fd049c7c054de61031d1b74ed9c945f98a1f`. Their source snapshots are backend `cdc7e4d6bd617db99caddf78f3b0c35da5fb0c7a` and Studio `cb3a6d86fca8d5b6cf671f4e9e8efea25207b0f2`. The commit containing this handoff identifies the assembled tree. Independent source review, Luis's integration review and deployment verification have separate owners.

## Outcome

A69 and migration 0144 record independent source and deployed-app observations against the exact Build return. The signed-in reviewer route uses scoped grants and binds evidence to the original export, repository and return. Reopening the founder handoff shows each current verification status and any historical receipts. A passing app check records the independently observed commit and immutable deployment reference. Failed, blocked and unknown observations can record an observed mismatch or missing commit. Replaying an old observation cannot restore a withdrawn or superseded pass.

## Evidence

The backend source snapshot passed 47 focused tests against disposable PostgreSQL. These cover grant separation and revocation, concurrent replacement, exact merge and deployment binding, duplicate observations and A68 rollout compatibility. The Studio source snapshot passed 16 focused Chromium cases. Focused WebKit checks on the preceding Studio source passed, and the final browser fixtures use a synthetic HTTPS target. These checks used synthetic identities and evidence. No client publication or deployed application was verified by them.

## Decisions and remaining obligations

Davide approved Studio snapshot `cb3a6d86` for publication and integration review. The Studio files in the assembled commit preserve that snapshot. The managed Explore flag stays default-off. This change records corroboration and does not launch Codex or deploy a client app. The production migration readback, scoped reviewer grants, hosted review and exact-head CI, authorized rollout and signed-in verification remain required.

## Next bounded action

Verify the assembled diff and its hosted checks. Coordinate with Luis on PR #541 and the follow-up. An authorized operator must reconcile migrations and deployment identities before the signed-in founder and independent reviewers perform the actual episode.
