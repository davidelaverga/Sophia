# Research that says what it was asked, and reviews that know it

FND-RESEARCH-SCOPE-REVIEW-04. Migration `0091_research_scope_review_context` (P's allocation), amendment A13, research prompt `sophia.research-base.v2+markdown.v1`. No new contract id.

## The three gaps

1. **A fixed web outcome.** Every new research goal got the outcome "drafted by the dsh runtime from the web and the chosen inputs" (`admit_research_task`, 0025). That included a request limited to supplied inputs, and a later source review then held the report to a web obligation the request had excluded.
2. **Claims about other formats.** The research worker was never told that an HTML design is Sophia's separate, later work. Asked for one, it wrote that "HTML design was not delivered: no native design-workflow tool is available", a claim about Sophia's capabilities drawn from its own tool list. Design fidelity then had to keep the sentence word for word.
3. **Reviews that never saw the request.** A source review froze only the goal's 120-character title, its fixed outcome and its criteria. The request's own limits (for example "use only the supplied note; do not search the web") never reached the reviewer.

## What changes

- **The outcome of new research goals** (0091 replaces `admit_research_task` with its exact body but one literal): "drafted by the dsh runtime from the sources its request authorizes".
  - No permission is read from the question, and no tool or provider changes.
  - Existing goals, outcomes, criteria, revisions, amendments and receipts are kept: an amendment reuses its base's goal, and a repeated key returns its first receipt.
- **Research prompt base v2** (`sophia.research-base.v2+markdown.v1`; the Markdown v1 section and PDF v1 are byte-identical). It says:
  - cite a source only for what it states;
  - label a recommendation or inference as yours, and cite its premises;
  - a request limited to supplied inputs stays limited to them;
  - a format the task does not name (a separately admitted HTML design) is not the worker's to deliver or report on;
  - never infer Sophia's tools from the worker's own;
  - a stated limitation is about the evidence, never about Sophia's other capabilities.

  No HTML or CSS tool, output or provider is added.
- **New review proposals freeze manifest v2.** It is v1's fields plus `requestContext`, the request each selected source was researched under:
  - **Exact origin.**
    - The selected source must be a published version's Markdown, or a rendition (HTML page, PDF) of a published version.
    - That Markdown must be one research task's draft (`research_drafts`, then its attempt's research job). An amendment seeds its draft with a copy (0037), so one Markdown has one task.
    - It never uses the goal's latest task, its root, the title or the newest research.
    - A source no research wrote is `not_research`; one two tasks wrote is `ambiguous`; a request record that no longer agrees with itself is `malformed`. Each is said, not guessed.
  - **Only what is needed.**
    - The exact question (the task's question source, at most 2000 characters, its hash and size checked).
    - Its `sourceConstraints` (at most 500 characters).
    - Their provenance: task, question source and hash, the task's manifest source and hash.
    - No manifest dump, inputs, URLs or history.
  - **At most one request per task,** naming every selected source it covers: at most three.
  - **Bytes.** The request's UTF-8 bytes count against the review's 32 KiB with the sources' own. A proposal past it is refused whole, never cut, so a no-web limit at the end of a question is never dropped.
  - **Withdrawal.** A copied question is a dependency already: 0033's closure runs from a research draft through its task's manifest to the question. A question made private, unreleased or withdrawn, or drawn from a withdrawn source, therefore withdraws the report, its pages and its reviews by the rules in place:
    - a proposal over them is refused before anything is frozen;
    - one not yet accepted can no longer be accepted;
    - a running one is withdrawn.

    The copy is also recorded as a dependency of the review's manifest, and a v2 context checks each copied question again.
- **The task statement and the runtime context** give a v2 review the same frozen block, read only from its manifest.
  - The statement gets text after v1's statement.
  - The context gets `requestContext` (A13 `SourceReviewRequestContext`, version `sophia.source-review-manifest.v2`). It says what the request is and is not:
    - it is task scope, never a source to cite;
    - it authorizes no tool, provider or source;
    - it certifies nothing;
    - a request that disagrees with the goal, outcome or criteria is reported, and each criterion is still judged as written.
- **v1 stays v1.** A v1 manifest gets exactly the statement and context it got before. Any other version is refused.
- **The reviewer's own instruction is unchanged** (`sophia-source-review-instruction-v1`). It is the role's cached prompt section, so changing it would also change resumed v1 reviews. The v2 guidance lives in the v2 statement, frozen per work. The conditional name `sophia-source-review-instruction-v2` is therefore unused.

## Compatibility and rollout (for V)

- **The bridge's strict contract.** The deployed native (8d45) has the same generated wire module as 29e. It refuses a v2 context: `requestContext` is not a property it knows, so it cannot read part of one. A bridge built from this accepts v1 and v2 and refuses an unknown version.
- **Rollout order.** Deploy the native built from this before applying 0091 and admitting new proposals. Otherwise a v2 review is blocked, not misread.
- **The research prompt is not frozen per task.** A deployment changes it for any research that runs afterwards.
- **Bundle identity.** The bundle archive changes: `2897b8b0…` → `c76ea236…`, recorded with `pnpm artifacts:record`. The dsh runtime artifact is unchanged.
- **Ask executor digest.** The service executor's digest (`sophia-executor-closure-v2`) hashes the installed bundle's files, so a runtime launched from this bundle has a new executor digest. An Ask grant pinned to the old digest reads `runtime_unavailable` on such a runtime until its pin is renewed. Nothing here re-pins or replaces the active manual pilot; that is V's rollout choice.

## Not done

- No research is admitted and no review is proposed or run here; no model is called.
- Old goals, manifests, results and verdicts are untouched. The latest delivered review stays `changes_required`.
- The renderer, design fidelity and the cited-text reader (0090) are not changed.

## Checks

- `apps/api/src/coordination.db.test.ts` § 0091: real PostgreSQL, the API login, HTTP proposals, and the commission/permit/start path to a running review (its create command's statement and its runtime context, checked by the bridge's own generated validator). It covers:
  - the new outcome, repeated key, amendment, and a viewer refused;
  - the exact 120-plus-character request with its no-web limit at the end, in both the statement and the context;
  - amendments sharing goal and root, an older version and its HTML page each bound to their own task, and dedup;
  - `not_research` and `ambiguous`, with nothing of another task leaked;
  - `malformed`;
  - a question private, unreleased, withdrawn, or drawn from a withdrawn source: the proposal is refused;
  - withdrawal after proposal and while running;
  - a 2000-character multi-byte request: exactly 32 KiB is proposed, one byte more is refused.
- `apps/api/src/review-request-v1.db.test.ts`: a database migrated through 0090, a real v1 proposal by 0042's own code, then 0091 applied.
  - The manifest, statement, plan and receipt are byte-identical, and the key returns the first receipt.
  - A new proposal is v2.
  - An unknown version is refused.
- `tests/unit/research-prompt.test.mjs`: the base v2 id and hash, Markdown v1 byte-identical, and the guards on what v2 says.
- An old and new wire crossing (journal evidence): the 8d45-identical validator refuses v2; the new one accepts v1 and v2 and refuses v9.
