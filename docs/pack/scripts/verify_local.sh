#!/usr/bin/env bash
# Offline reference and documentation checks. No installs, credentials or migrations.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
command -v node >/dev/null
command -v tsc >/dev/null
command -v python >/dev/null
python -c 'import jsonschema'
python scripts/generate_api_types.py --check
(cd implementation && npm test)
(cd api && tsc -p tsconfig.json && node --test reference-client.test.mjs)
tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext contracts/interfaces.ts
python scripts/validate_part2.py
python scripts/validate_pack.py
printf '\nLocal checks finished. PostgreSQL, native sessions, media and deployment remain separate tests.\n'
