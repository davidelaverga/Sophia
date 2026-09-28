# Sophia — Three PR mission pack v1.1

Start with [00_START_HERE](00_START_HERE.md). This is the complete revised pack, not an add-on that requires the previous ZIP.

**M01 now contains the full literal system prompt and complete mission-lifecycle skill.** Read [Mission 1 section 8](missions/M01_MISSION_COMPANION.md#8-exact-system-prompt-complete-skill-and-context-binding), the separate [system prompt](prompts/M01_SYSTEM_PROMPT.v1.1.md), the [actual skill](skills/mission-lifecycle.v1.1.md), and [exact loading contract](shared/M01_PROMPT_LOADING.md). [Changes from v1.0](CHANGELOG_v1.1.md) are limited to this content amendment and its references/checks.

The pack retains R00, three feature missions, 19 goal sessions and eight Claude/Codex launch prompts. Four prompt-loading cases bring the named feature acceptance cases to 59. M02/M03 specifications and their launches remain unchanged. The current continuation record is [ledger v0.4](Sophia_Mission_Companion_and_Research_Ledger_v0.4_2026-09-28.md); earlier ledgers and [pass 2](references/pass2/README.md) remain preserved.

These are authored implementation assets and specifications, not deployed code. [Local package validation](evidence/package_validation.json) and [M01 asset validation](evidence/m01_prompt_validation.json) check documents and hashes only. Run `python scripts/validate_pack.py` and `python scripts/validate_m01_assets.py` using Python 3.10 or later. Neither script contacts providers or deployment services.
