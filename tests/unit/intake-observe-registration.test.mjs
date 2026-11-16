// Registers the intake observation CLI's regression suite (scripts/intake-observe.test.ts) with ordinary test
// discovery: `pnpm test` runs tests/unit/**/*.test.mjs, and nothing under scripts/. This file only imports that suite;
// the tests live beside the CLI. Granted by the coordinator for INC03-CC-001 r2 (review finding F07) in place of a
// shared glob or package.json change.
import '../../scripts/intake-observe.test.ts'
