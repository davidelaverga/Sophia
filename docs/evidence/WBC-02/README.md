# WBC-02 evidence (local, synthetic)

Captured on 2026-10-05 in Claude's container: Chromium driving the real Studio (Vite) against the real API on a local PostgreSQL 16, with synthetic dev identities (`apps/api/scripts/dev-db.ts`), a project enrolled for source review by the migration owner, two synthetic report versions, and a registered runtime that only said hello and ready. No worker, Paperclip service or model was running, so the review stops at "waiting for Paperclip to take the commission". Not live evidence.

| File | What it shows |
|---|---|
| `01-propose-and-decide.png` | Tasks (1280 wide), Davide viewing: the proposals read only on the board (a plan only proposed is never operated), and his admission decision answerable at the pilot's entry under the goal ("You decide · Start the review · Not now") |
| `02-accepted-waiting-on-paperclip.png` | After Start the review: plan r1 accepted and in force, the review queued and waiting on someone outside (the commission), "While you were away: You chose Start the review", the next proposal now answerable on the board, Review sources still offered |
| `03-phone.png` | The same board at 390 wide |
| `mutations.txt` | Each guard reverted once; the check meant to catch it fails |

The integration evidence (pinned dsh, pinned Paperclip harness, PostgreSQL) is listed in [docs/progress/WBC-02.md](../../progress/WBC-02.md).
