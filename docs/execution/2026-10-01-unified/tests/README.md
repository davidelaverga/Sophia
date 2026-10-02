# Validation scope

`acceptance-catalog.json` is the product acceptance specification. Every case is **not run by this pack delivery**. Previous source/hosted reports remain attributed in the current baseline; no existing achievement is reset by this catalog.

`test_design_model.py` exercises the in-memory model in `design/personal_flow_model.py`. It checks intended ownership, message, claim, publication and erasure invariants. It has no network, database, real concurrency, OAuth, object store, provider computer or product UI. Passing it does not prove production implementation.

`fixtures/personal-assistant/` includes positive and deliberately invalid schema examples. Coordination schemas/fixtures are retained specification material. JSON shape validation cannot establish actor authority or native control.

Run `python scripts/validate.py` from the pack root. It checks links, goal/alias/front-end references, dependency cycles, complete legacy mapping, prompt presence, JSON parsing and schema cases, design rehearsals, and banned font artifacts. The HTML reader is checked separately in Chromium at desktop and mobile widths; that test concerns the documentation reader only.

Application implementation must separately pass current repository tests, actual SQL/RLS and object access, negative privacy queries/caches/events, provider auth/run/message/result paths, release compatibility and human product acceptance. No hidden provider test or charged job is invoked by the pack validation scripts.
