# Implementation-session handoff

Goal and attempt: FND-SEARCH-HYPHEN-20261106-01, attempt 1  
Human owner / executor resource: Davide (owner); B, the existing Claude Code session; P coordinates, R2 reviews independently  
Native session: `local_cf492b49-c8d1-4ab7-b811-95eaefc2b61c`; no native, provider or model call was made  
Starting worktree/commit: `/Users/davidelaverga/Documents/Codex/2026-11-06/sophia-search-hyphen`, local branch
`fix/search-hyphen-20261106` from main `d5a0d1cf3091f1e6246d631c6aab93bf007b1c40` (tree `bbc35e7b`)  
Ending commit/tree and changed files: the local candidate commit on that branch (its id is in the result record, since a
commit cannot name itself); `packages/persistence/src/search.ts`, `apps/api/src/search.db.test.ts`, this file

## Outcome

On 6 November both members of one project searched for a shared message's exact marker, `V50-20261106-MENTION-01`, and
got "Nothing in this project matches", while the chat showed that message's body.

The cause is a mismatch between the two sides of the match. The query side (`searchWords`) takes runs of letters and
digits, giving `v50`, `20261106`, `mention`, `01`, each a required prefix. The text side is PostgreSQL's `simple` parser,
which reads a hyphen or plus sign before digits as a signed number. The marker's words are `v50`, `-20261106`, `mention`
and `-01`, and `20261106:*` is no prefix of `-20261106`. A date (`2026-11-07` gives `2026`, `-11`, `-07`), a negative
number and `x+5` miss the same way. Hyphenated words (`two-member`) and digits after letters (`x-01abc`) were already
found.

`queryOf` (search.ts) now asks for a word of ASCII digits as that word or that word signed: `(01:* | '-01':* | '+01':*)`.
Every other word is unchanged, as are the required-all, prefix, eight-word, 64-character and two-character rules, the
statement, the row security, the states and sources it reads, the limits, the ordering and the snippet. The snippet
uses the same query, so it now centres on the match. No migration, index, dependency, Studio, worker or native change.

## Evidence

All on a private PostgreSQL 17.11 cluster (local recipe, port 55497), through the real Fastify route, the generated
`parseSearchPage` parser and the restricted API role:

- `ts_debug('simple', 'V50-20261106-MENTION-01: …')` gives `numword V50`, `int -20261106`, `asciiword MENTION`,
  `int -01`.
- Fail before: `apps/api/src/search.db.test.ts` with the new case on main d5a0: 13/14. The new case fails at its first
  assertion: the exact marker finds `[]` for its author.
- Pass after: the same file with the fix: 14/14. The new case finds the message for both members by the exact marker,
  its parts and `two-member`. It finds a date, `-12` and `x+5` by their digits, and a report section by
  `REL-2026-07`. It does not find `…-MENTION-02` or `20261107`. A private source's marker is found only by its owner,
  and withdrawn or corrected-away markers are not found.
- `pnpm check` result and the other commands are in the result record.

## Remaining limits

- Not exercised in the deployed app. A Studio or app retry needs R2's review, a push, CI and V's release.
- A search cursor issued for a digit-word query before the release no longer matches its query, so it is refused
  (422) and the search starts again from the first page.
- The parser keeps other compounds whole as well: `1.2.3` (version), `a@b.com` (email), and paths and URLs. A search
  for a later part of one of those still misses. Arabic-Indic digits are not tokenised at all. None of these is the
  reproduced defect, and none is changed here.
- `artifacts.ts` `searchQuery` (the report-card list search) builds its query the same way and shares the signed-number
  miss. It is outside this packet and unchanged.

## Next bounded action

P: dispatch R2's independent pre-push review of the candidate commit on `fix/search-hyphen-20261106`.
