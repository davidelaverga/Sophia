# Implementation-session handoff

Goal and attempt: FND-B-REVIEW-CITED-INPUTS-02, attempt 2 of the cited-sources offer (attempt 1:
[FND-B-REVIEW-CITED-INPUTS-attempt-1](FND-B-REVIEW-CITED-INPUTS-attempt-1.md)). It has two parts: one review
correction, and the integration of current main.

Executor: Claude Code lane B (runtime `60d65501-d779-4a4c-80e8-89485d10c86e`), packet `5d74da4e…`.

Inputs:

- R2's finding R2-482-R1, with its result `6539f64b…`, proof `c337d2db…` and host-label witness `47223718…`.

Start: `2a27b0bb` (PR482, draft), branch `fix/source-review-cited-inputs-20261024`.

## Integration

- Remote main was `26aa0507` (tree `dfff0ebe`). It carries PR480 and Luis's PR481 (addressed navigation).
- It was merged into this branch by an ordinary merge (`ecff1798`, tree `00ae682a`, which is the combined tree R2
  derived).
- There were no conflicts: main's delta from the common base `9aa70441` is the eight Luis paths, disjoint from this
  branch's.
- All eight Luis paths are byte-identical to main.

## The correction (R2-482-R1, P2)

- 0082's label for a page the research read took everything before the first `@`. So a stored `reportedFinalUrl` of
  `https://reader:demo@docs.example/path` was offered as "Web page · reader:demo". It also exposed a port and passed a
  bracketed literal through.
- A stored reported URL is not checked for its authority (0025 keeps it as reported).
- Now the whole authority, up to the first `/`, `?` or `#`, must be a DNS name with at most a port. The port is
  dropped and the host lowercased.
- A user or password, a bracketed or malformed authority, or no URL gives the neutral "Web page".
- Path, query and fragment are never part of a label.
- 0082 is not applied anywhere yet, so it is corrected in place. Nothing else in it changes. The contract is
  unchanged (labels were already free text up to 200 characters).

## Evidence (journal `B-REVIEW-CITED-INPUTS-02-logs`)

- **Same final test bytes**, real PostgreSQL, on the integrated head:
  - the old 0082 fails, offering `Web page · reader:demo`, `Web page · Docs.Example.org:8443` and
    `Web page · [2001:db8::1]` (log 21);
  - the corrected 0082 passes (log 23).
- The regression seeds synthetic pages only, each under a settled read of an allowance:
  - userinfo with path, query and fragment;
  - an uppercase host with a port, path, query and fragment;
  - a plain host with a query;
  - an IPv6 literal;
  - a value that is not a URL.
- The full checks on the integrated head are listed in the journal handback.

## Deployment compatibility (unchanged, stated)

- Apply 0082 before the matching API, then the matching Studio.
- The new API on the old SQL answers 503, because `supporting` is a required field.
- A ready API does not prove the migration was applied.

## Reader contract integration (FND-B-482-PRESERVE-A44-INTEGRATION-01)

- This branch still declared a version trigger as `research | rendition`. Published as it was, after the reader fix
  (PR483, A44), it would reintroduce the design-version read failure.
- The accepted reader source (`8cf20dad`) is merged in, with an ordinary merge.
- The only conflict was the generated `validators.js`. `openapi.json`, `generated-types.ts` and `validators.js` were
  regenerated with the normal contract tooling from both amendments: A43's supporting sources, and A44's `design`
  trigger kind.
- Unchanged: 0082, A43, A44 and Luis's files.
- Browser, real PostgreSQL and the full checks then passed on that candidate (`24df`), before its push.

## Bounded offer correction (FND-B-482-BOUNDED-OFFER-CORRECTION-01)

- The CODE review of `24df` found a P2 at 0082:69, and R2 confirmed it.
  - Supporting left out every cited source that is a report version.
  - The offer names only the newest 50 report versions that may be offered.
  - So a report citing an older readable version (the 51st) had that citation offered nowhere, though the proposal
    admits it.
- Now a cited report version is left out of supporting only when the bounded offer actually returns it.
  - One the bound leaves out is listed beside the report citing it.
  - One the offer never shows (a candidate or a rejected version) is still not listed.
- The offered report versions keep 0042's predicates, order and bound of 50. They are now named once, so supporting is
  compared with what is actually offered.
- Unchanged: supporting's own predicates (a member, a released eligible ready project source, with text, within 32 KiB,
  nothing withdrawn, never a private source), its order and its bound of 50, and the proposal.
- A43's rationale said a cited report version is never listed as supporting. That sentence now states the corrected
  behavior. A43's patch and the generated contract are unchanged.
- A cited report version listed this way has the neutral label "Cited source", like any other citation with no recorded
  origin (labels are unchanged).

Evidence (journal `B-482-BOUNDED-OFFER-CORRECTION-01-logs`), from the same final test bytes on real PostgreSQL:

- the old 0082 fails: the 51st report is listed nowhere (log 10);
- the corrected 0082 passes (log 11).

The case also checks:

- exactly 50 are offered;
- a cited report that the offer returns is not listed again;
- at most 50 per version, by label then id;
- cited candidate, rejected and over-32 KiB versions are never named, nor are reports citing a forgotten or a private
  version;
- the report and the citation it lists are proposed together (201).

## Limits

- The regression is synthetic. No production URL, credential or data was read, and no production leak is claimed:
  the current Jina reads report no final URL, and a requested URL carrying credentials is refused.
- The Studio witnesses run on the Vite fixture page.
