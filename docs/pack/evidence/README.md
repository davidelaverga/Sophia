# Validation evidence

This directory distinguishes a source-grounded plan, executed reference tests, and unrun product integration.

| Report | Meaning |
|---|---|
| [implementation-validation.json](implementation-validation.json) | Exact local environment, compiled reference code, test counts and unrun layers |
| [reference-tests.tap](reference-tests.tap) | 44 executed Node tests of reference wire, control, source and projection rules |
| [api-client-tests.tap](api-client-tests.tap) | Four executed Node tests of the typed reference client |
| [part2-binding-validation.json](part2-binding-validation.json) | API refs/schema structure, generated types, actual UI anchors/hash, renderer examples and table/route crosswalk |
| [pack-validation.json](pack-validation.json) | Local links, source IDs, specimen schemas and goal dependency consistency |

**48 local tests passed.** They are not 48 live product cases. They ran under Node 22.16.0 and TypeScript 5.8.3; the product still targets Node 24. No PostgreSQL parser/server, dsh process, native engineering account, room, provider or renderer was exercised.

Reproduce the local checks from the pack root with `bash scripts/verify_local.sh`. Prerequisites: Node/npm, TypeScript compiler and Python with `jsonschema`. The script installs nothing and runs no migration. It rebuilds local `dist/` output. Check reports can change when rerun; the delivery checksum manifest represents the original packaged bytes, not a subsequent local run.

The SQL test is supplied under db/tests/ and remains **not run**. The renderer extraction helper was syntax-checked but not run against a mounted pinned clone. Source audits are identified in sources/source-register.json with their exact coverage; inherited Part 1 entries are not relabeled fresh.
