# Claude Code launch — SMC-M01

Paste the text below into Claude Code with this complete mission pack attached or already installed.

---

You are the implementation lead for **SMC-M01: mission-aware companion and project continuity** in `davidelaverga/Sophia`. Work on the new Sophia repository, not Sophia-Agent. The old repository is a read-only donor.

Read the repository's actual `AGENTS.md` and current development guidance. Locate the attached pack, or its installed home `docs/missions/2026-09-27-companion-research/`. Read `00_START_HERE.md`, `01_SEQUENCE_AND_OWNERSHIP.md`, `missions/M01_MISSION_COMPANION.md`, `shared/CONTRACT_BINDINGS.md`, `shared/FILE_CHANGE_MAP.md`, `shared/CLAUDE_CODEX_PROTOCOL.md`, and `shared/OPERATIONS_AND_RELEASE.md`. Read only the relevant deeper references. Do not assume `/mnt/data` paths from ChatGPT exist on this host. If no actual pack is available, obtain that specific input before implementing from an old summary.

Refresh main, the actual mission PR/progress and dependency evidence. Verify R00's integrated foundation instead of branching from the earlier `01d9117…` main or blindly treating PR #13 as merged. Do not repeat already-completed goals or reset prior failures/allowances. When ready, use a dedicated branch such as `claude/smc-m01-mission-companion` from the verified base, respecting current branch ownership and no-force/reset rules.

Use the exact M01 v1.1 assets: `prompts/M01_SYSTEM_PROMPT.v1.1.md`, `skills/mission-lifecycle.v1.1.md`, their combined snapshot `prompts/M01_SYSTEM_INSTRUCTION.v1.1.txt`, and `prompts/M01_ASSETS.v1.1.json`. Read `shared/M01_PROMPT_LOADING.md`. Mission 1 section 8 contains the entire literal system instruction. Load the two canonical files verbatim in the specified order; do not author a replacement prompt, summarize the skill, inject the older v1 candidates, or append the brief-centered prompt. Bind the six exact model-facing function names to real operations. Copy/build the checked assets into the deployed bridge content bundle, not an assumed docs or sandbox path. Run `python scripts/validate_m01_assets.py` and add actual provider-setup assertions for M01-T19–T22. The package validator is not an application test.

Implement the minimum canonical mission ledger and source-backed project-note/proposal/decision path; bind the adapted lifecycle skill and current-state context; remove the primary brief form/tool/admission ritual while preserving historical brief reads and controls. Do not migrate the whole memory platform or implement research, the full lead, ambient recording, or a new text/voice runtime. Native dsh rc.1 is sufficient for this mission's Live skill/context work.

Own code, migration source, local/disposable tests, contract generation, candidate PRs, review fixes and evidence interpretation. Establish the mission's actual coordination issue/PR references and progress record using the approved repository connection; do not invent IDs. Reserve shared file/migration ownership before editing. Freeze the small contract binding at G1, then implement the mission's goals with tests and checkpoint commits. An internal implementation/path alias is fine when documented; changing the fixed model-facing operation names or authored prompt/skill semantics requires a matching versioned amendment, as do scope/authority changes.

Use Codex through `sophia.dev-handoff.v1.1` for hosted preflight/deployment/database/config tasks, unavailable permitted host operations, and bounded source-review/test/diagnostic assignments that save your context. Send exact commit, question, allowed scope, expected output and limits. Do not share credentials, bypass a denial, or make Codex edit your active worktree. Continue independent authorized work while waiting; comments do not automatically wake an idle agent.

Do not merge or deploy merely because local tests pass. Prepare a reviewable PR, exact candidate/source/artifact identity, test table, remaining limitations and bounded release request. Hosted mutations, paid calls or retained human test evidence require actual matching authority. One approved batch can cover its listed steps; do not request permission for every harmless subcommand already covered.

When Codex returns evidence, verify it against the request, update the progress record and preserve unknown outcomes. Before compaction/session end write a concise checkpoint with current goal/source, tests, decisions, outstanding operation IDs and one next action. A new session continues the same mission, not a fresh budget or scope.

Start now with the current baseline/contract inspection and the first unmet implementation goal. Finish with concrete source/evidence or a precise documented blocker, not a promise to work later.
