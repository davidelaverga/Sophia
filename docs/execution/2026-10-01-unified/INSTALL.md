# Install the new planning authority without changing product state

**Proposed home:** `docs/execution/2026-10-01-unified/` in `davidelaverga/Sophia`.

The user requested a replacement planning pack. Creating these files does not mutate the repository or authorize a production batch. Install through a documentation-only reviewed PR; preserve every existing historical pack in place.

## Installation sequence

1. Validate the extracted directory with `python scripts/validate.py`. Read its validation scope before interpreting the result.
2. Refresh current main and active PRs. Claim documentation pointer files and avoid active implementation paths. Copy the complete directory to the proposed home; do not scatter individual Markdown files without their relative-link neighbors.
3. Add a short **Current continuation** block to `docs/README.md` and the repository-specific navigation section of `AGENTS.md`, pointing to `docs/execution/2026-10-01-unified/00_START_HERE.md`. Preserve all security, permissions, exact toolchain and frozen-reference rules. The new block explicitly supersedes older planning navigation, not those safety rules.
4. Keep `docs/pack/`, prior mission packs and runtime assets byte-identical. Do not copy this packet's recipe inputs or schemas over live configuration or the generated OpenAPI. No migration or environment change is part of installation.
5. Link existing active progress threads rather than creating replacements. M03 remains issue31/PR32 until an actual handoff/disposition. Record current moved heads in the new baseline ledger, not by resetting a checkout to the audit pin.
6. Run affected documentation/source-map checks. Review the exact doc-only diff. A permitted merge does not imply deploying services.

## Proposed pointer text

> Current forward planning: `docs/execution/2026-10-01-unified/00_START_HERE.md` (v2.0). This cumulative continuation supersedes the v0.3/v0.4, September30 SCM, and October1 v1.0 overlay as planning/navigation authority. Retain their bytes as history. Current source, explicit owner decisions, repository security rules and in-flight mission ownership remain binding. Do not restart implemented work or repeat prior operational batches from old checklists.

## Operational handoff remains separate

Paperclip deployment, a new source schema, Grok enrollment/provider tests and any live personal Companion each require the exact owner-authorized operation recorded in their goal. Never install a schedule or spend provider allowance as a side effect of installing documentation.
