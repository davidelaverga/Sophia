# Validation and evidence boundaries

This pack is a planning deliverable. Documentation and in-memory design checks are not product acceptance.

## Reproduce the checks

Use Python 3.11 or later. Install the documentation-only dependencies from `scripts/requirements.txt` in a separate environment; do not merge them into Sophia's runtime dependencies.

```sh
python -m pip install -r scripts/requirements.txt
python -B scripts/validate.py
python -B scripts/build_reader.py
python -B scripts/check_reader.py
```

The last command needs a system Chromium binary (default `/usr/bin/chromium`, overridable by `CHROMIUM_PATH`). These scripts do not call an AI provider or mutate the application, repository, database, account settings or deployment. The browser checker loads the generated HTML bytes and blocks external requests.

## Structural coverage

The executable validator checks portable links and Markdown headings, JSON parsing, every original goal's mapping, SCM and frontend coverage, unique work/acceptance IDs, valid dependencies without cycles, canonical launch prompts, and positive/negative proposed-schema examples. It rejects font-file payloads. External source URLs retain their access and historical qualifications; this is not a fresh network availability check for every source.

[Machine-readable validation report](tests/documentation-validation.json) · [Coverage map](sources/COVERAGE.md) · [Source/reading limits](sources/REGISTER.md).

## Design rehearsal

The local model tests intended owner isolation, exact-version publication, message/wake/claim separation, duplicate requests, and erasure/late writes. The model has **no network, production OAuth, real database transactions, concurrency, file store, browser agent or provider billing**. Passing it establishes consistency of this executable specification only.

[Design test output](tests/design-model-output.txt) · [Test scope](tests/README.md) · [Model source](design/personal_flow_model.py).

## Reader checks

The standalone HTML reader is tested at desktop and phone widths for contents, full-text search, internal navigation, missing anchors, page errors and horizontal page overflow. Those checks concern this documentation interface, not Sophia Studio or iOS Safari.

[Reader browser report](tests/reader-browser-check.json) · [Reader link map](tests/reader-link-check.json).

## Recorded results

The final validation passed for all 24 original-goal mappings, nine SCM missions, 17 frontend packages, and the 44-record goal/alias map. The 23 proposed-schema examples include 12 deliberately invalid cases; all behaved as specified. The 26 in-memory design tests passed. The offline reader passed navigation/search and all-document width checks at 1440 × 1000 and 390 × 844, with no page errors or external requests. Exact current link/file counts are in the machine-readable reports.

## What remains unexecuted

All 323 product acceptance specifications in [the catalog](tests/acceptance-catalog.json) remain `not_run` **by this delivery**. Prior repository and hosted reports remain separately attributed; their achievements are not reset. No new Paperclip, Omnigent, Grok, local computer, subscription usage, live personal Companion, model route or hosted release is marked accepted here.

The ZIP's `SHA256SUMS.txt` covers packaged files other than itself. Validate it after extraction using `sha256sum -c SHA256SUMS.txt` where available. Rebuilding generated reports/readers legitimately changes their manifest hashes; regenerate the manifest only for a new reviewed pack version.
