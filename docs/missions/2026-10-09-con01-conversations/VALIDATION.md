# Package validation — not product acceptance

Date: 9 October 2026.

## Checks performed

- Read the user-provided v3 CON-01 mission and selected architecture/operation excerpts from the ZIP. The three included original excerpts retain their exact SHA-256 identities.
- Inspect the referenced current GitHub source and UI planning files. This is source inspection, not a full repository build.
- Confirm unique acceptance IDs: **36 cases**, including the five inherited v3 cases. All execution verdicts in the template remain `not_run` with no evidence fabricated.
- Confirm the episode example is explicitly synthetic, not an API response, and contains no execution results.
- Validate every relative link in the active Markdown package and every in-reader internal anchor. Original parent excerpts are `.txt` evidence; their original links refer to the full parent pack.
- Render the offline reader through installed Chromium at **390, 1000 and 1440 px**. Search and navigation to the Codex launch passed; no page-width overflow, page errors or external requests occurred in those checks. Each embedded document was selected individually. The 390 px capture was visually inspected.
- The browser environment blocks direct `file:` navigation, so the exact reader bytes were loaded into a blank Chromium page for those tests. This tests rendered behavior, not that environment's file-opening policy. No Sophia application was opened.
- Verify package hashes and ZIP member bytes after final packaging. The included `scripts/validate_pack.py` can rerun link/reference/checklist/checksum checks using Python's standard library.

## Explicitly not performed

No Sophia source was written, no PR/issue/comment was created, no app or runtime was deployed, no database migration or SQL suite was executed, no provider was called, and no live account or resource was connected. Browser checks above concern this **mission reader only**, not CON-01's app acceptance. No production readiness is implied.

## Outcome

The mission pack is ready to hand to Claude Code and Codex. Its product, privacy-amendment, runtime, deployment and live-app gates remain for the assigned executors and Davide. Final operation targets, amounts, retention authorization and fresh backend IDs are intentionally not invented.
