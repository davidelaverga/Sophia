# Launch — Luis / Mission 1 (WBC-01)

You are implementing **WBC-01: finish the Tasks experience for real work state**, owned by Luis. Use the complete accompanying packet and the installed v2.0 unified continuation. This is a follow-up to merged PR #63, not a rebuild of it.

Read `00_START_HERE.md`, `01_CURRENT_LEDGER.md`, `missions/WBC-01_UI_READINESS.md`, `contracts/01_WORKBOARD_BINDING.md` and `sources/REGISTER.md`. Then fetch the current main and inspect all open work affecting your files. This packet inspected `c8dd5aa975fb8f0a872e32a89d7d674a356e79f2`. Preserve newer corrections and update only the remaining delta. Create a new branch such as `lfe-07/workboard-readiness` from current main.

Preserve Luis's rail, board, sheet, dependency lighting, typography, shared SessionActs, mobile/call controls, keyboard behavior, reduced-motion support and local Claude greeting. Several prior findings have already been fixed; do not reimplement or revert them.

Deliver the five sessions in the mission: separate accepted plans from live observations; correct completion/closed-work/result semantics; consume exact assignments, typed waiting and per-action availability; correlate real admission/delivery/effect receipts; and prepare contextual Ask without artificial streaming or another chatbot. Support a Sophia-native reviewer without a fake subscription account. Keep current plan visible while a replan is proposed.

Before implementing a shared DTO change, post one compact contract proposal for Davide/backend agreement. Use the supplied schema/examples as the proposed interface; no production endpoint or migration is added by this PR. Missing live services stay unavailable. No fixture import, simulated balance or fake answer may enter the production route.

Work through one useful tested slice at a time. Run the repository's actual toolchain/check/build scripts and affected unit/browser suites, including UI-01–UI-21. Add regressions that fail before a behavioral repair. Record fixtures separately from live evidence. Ask Codex for a scoped independent review of the exact commit through the coordination issue, not through desktop automation.

Open one follow-up PR with the before/after semantic changes, retained existing fixes, contract digest, tests actually run, short desktop/phone evidence and backend handoff. No production deploy, schema mutation, paid call, native account action or runtime prompt change is authorized. Stop at the Mission 1 definition of done; do not absorb the remainder of SCM/LFE.
