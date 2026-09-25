#!/usr/bin/env python3
"""Offline contract/binding checks, not a live runtime or PostgreSQL test.

Requires jsonschema. Uses only the files in the pack; never retrieves a source,
installs a package, connects to a service, or executes a migration.
"""
from __future__ import annotations

import copy
import hashlib
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parents[1]
errors: list[str] = []
counts: dict[str, int] = {}


def require(condition: bool, message: str) -> None:
    if not condition:
        errors.append(message)


def load(name: str):
    return json.loads((ROOT / name).read_text(encoding='utf-8'))


def walk(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk(child)


def resolve_pointer(document: dict, pointer: str):
    if not pointer.startswith('#/'):
        raise ValueError(f'Non-local reference: {pointer}')
    value = document
    for segment in pointer[2:].split('/'):
        value = value[segment.replace('~1', '/').replace('~0', '~')]
    return value


api = load('api/openapi.json')
require(api.get('openapi') == '3.1.0', 'Expected the authored OpenAPI 3.1 contract')
refs = [v['$ref'] for v in walk(api) if '$ref' in v]
for ref in refs:
    try:
        resolve_pointer(api, ref)
    except (ValueError, KeyError, TypeError) as exc:
        errors.append(f'Unresolved API reference {ref}: {exc}')
counts['api_local_references'] = len(refs)

operations: dict[str, tuple[str, str, dict]] = {}
for path, item in api['paths'].items():
    for method, op in item.items():
        if method not in {'get', 'post', 'put', 'patch', 'delete'}:
            continue
        oid = op['operationId']
        require(oid not in operations, f'Duplicate operation: {oid}')
        operations[oid] = (method, path, op)
        expected_params = set(re.findall(r'\{([^}]+)\}', path))
        actual_params = {p['name'] for p in op.get('parameters', []) if p['in'] == 'path'}
        require(actual_params == expected_params, f'Path parameter mismatch: {oid}')
        require(op.get('x-sophia-implementation') == 'contract_only', f'Unsupported implementation claim: {oid}')
        require(bool(op.get('security')), f'Missing auth declaration: {oid}')
        require(any(k.startswith('2') for k in op['responses']), f'No success shape: {oid}')
counts['api_operations'] = len(operations)

schemas = api['components']['schemas']
for name, schema in schemas.items():
    try:
        Draft202012Validator.check_schema(schema)
    except Exception as exc:
        errors.append(f'Invalid component schema {name}: {exc}')
counts['api_component_schemas'] = len(schemas)

planning = load('delivery/planning.json')
goals = {g['id'] for g in planning['goals']}
routes = load('api/route-bindings.json')['routes']
require({b['operationId'] for b in routes} == set(operations), 'Route map does not cover exact API operation set')
require(len(routes) == len(operations), 'Duplicate route-binding entry')
sql = '\n'.join(p.read_text() for p in sorted((ROOT / 'db/migrations').glob('*.sql')))
tables = set(re.findall(r'CREATE TABLE (?:sophia|sophia_secrets)\.([a-z_]+)', sql))
for binding in routes:
    oid = binding['operationId']
    method, path, op = operations[oid]
    require((method, path) == (binding['method'], binding['path']), f'Route mismatch: {oid}')
    require(binding['goal'] in goals, f'Unknown route goal: {oid}')
    require(binding['goal'] == op['x-sophia-release-goal'], f'Goal differs across API and map: {oid}')
    require(binding['destination'].startswith('apps/api/src/routes/'), f'Unexpected route destination: {oid}')
    for table in binding['tables']:
        require(table in tables, f'Mapped table not declared: {oid} -> {table}')
    for field in ['requestSchema', 'responseSchema']:
        require(binding[field] is None or binding[field] in schemas, f'Unknown schema: {oid}/{field}')
counts['declared_sql_tables'] = len(tables)

# Generation is deterministic and checked against the source OpenAPI.
gen = subprocess.run([sys.executable, str(ROOT / 'scripts/generate_api_types.py'), '--check'],
                     cwd=ROOT, text=True, capture_output=True, timeout=20)
require(gen.returncode == 0, f'Generated types mismatch: {gen.stdout}{gen.stderr}')

frontend = load('frontend/bindings.json')
reference = ROOT / frontend['reference']
require(hashlib.sha256(reference.read_bytes()).hexdigest() == frontend['sha256'], 'Studio reference hash mismatch')
lines = reference.read_text().splitlines()
for b in frontend['bindings']:
    line = b['referenceLine']
    require(1 <= line <= len(lines), f'Invalid anchor line: {b["referenceAnchor"]}')
    if 1 <= line <= len(lines):
        require(b['referenceAnchor'] in lines[line - 1], f'Anchor not at declared source line: {b["referenceAnchor"]}')
    for oid in b['operationIds']:
        require(oid in operations, f'Frontend references unknown operation: {oid}')
    require(b['implementationStatus'] == 'not_started', 'Frontend fixture mislabeled implemented')
    require(b['referenceOutcome'] == 'fixture_not_live', 'Frontend reference mislabeled live')
counts['frontend_source_bindings'] = len(frontend['bindings'])

source_ids = {s['id'] for s in load('sources/source-register.json')['sources']}
manifest = load('renderers/extraction-manifest.json')
require(bool(re.fullmatch('[0-9a-f]{40}', manifest['commit'])), 'Invalid renderer commit')
for f in manifest['files']:
    require(f['source_id'] in source_ids, f'Unregistered extraction source: {f["source_id"]}')
    require(bool(re.fullmatch('[0-9a-f]{40}', f['git_blob_sha1'])), f'Invalid renderer blob: {f["path"]}')
    for field in ['path', 'destination']:
        path = PurePosixPath(f[field])
        require(not path.is_absolute() and '..' not in path.parts, f'Unsafe extraction path: {path}')
counts['renderer_extraction_entries'] = len(manifest['files'])
render_schema = load('renderers/render-contract.schema.json')
Draft202012Validator.check_schema(render_schema)
validator = Draft202012Validator(render_schema, format_checker=FormatChecker())
examples = load('renderers/examples.json')
for i, example in enumerate(examples):
    for error in validator.iter_errors(example):
        errors.append(f'Renderer example {i}: {error.message}')
# Negative contract examples: structural failures, not native render tests.
base = examples[0]
negative = []
x = copy.deepcopy(base); x['slides'] = []; negative.append(x)
x = copy.deepcopy(base); x['entry'] = {'path':'report.html','sha256':'a'*64}; negative.append(x)
x = copy.deepcopy(base); x['sourceManifestHash'] = 'bad'; negative.append(x)
x = copy.deepcopy(base); x['jobId'] = 'not-a-uuid'; negative.append(x)
x = copy.deepcopy(base); x['authorityEpoch'] = 0; negative.append(x)
for i, example in enumerate(negative):
    require(not validator.is_valid(example), f'Negative renderer example accepted: {i}')
counts['renderer_positive_examples'] = len(examples)
counts['renderer_negative_examples'] = len(negative)

fixtures = load('api/omnigent-wire-fixtures.json')
require(fixtures.get('not_live_evidence') is True, 'Native fixture not marked synthetic')
for case in fixtures['cases']:
    require(case['source'] in source_ids, f'Unknown native fixture source: {case["id"]}')
host_case = next(c for c in fixtures['cases'] if c['id'] == 'hosts')
require(isinstance(host_case['response']['hosts'][0]['configured_harnesses'], dict), 'Readiness must be a map, not an array')
counts['synthetic_native_wire_examples'] = len(fixtures['cases'])

# This merely checks inventory and explicit transaction scaffolding, NOT SQL syntax/execution.
migrations = sorted((ROOT / 'db/migrations').glob('*.sql'))
require(len(migrations) == 4, 'Expected four migration candidates')
for p in migrations:
    text = p.read_text()
    require('BEGIN;' in text and 'COMMIT;' in text, f'Missing migration transaction scaffolding: {p.name}')
require('ROLLBACK;' in (ROOT / 'db/tests/0001_scope_and_commands.sql').read_text(), 'SQL fixtures must roll back')
counts['unexecuted_migration_candidates'] = len(migrations)

for p in ROOT.rglob('*'):
    if p.is_file():
        require(p.suffix.lower() not in {'.ttf','.otf','.woff','.woff2','.ttc'}, f'Unexpected font binary: {p}')

report = {
    'status': 'passed' if not errors else 'failed',
    'scope': 'offline_contract_structure_and_binding_consistency',
    'checked_at_utc': datetime.now(timezone.utc).isoformat(),
    'counts': counts,
    'generated_types': 'matched' if gen.returncode == 0 else 'mismatch',
    'not_tested': ['formal full OpenAPI conformance', 'Fastify route implementation', 'runtime response schema validation',
                   'PostgreSQL parsing/execution/RLS/concurrency', 'native device grant or native sessions',
                   'actual renderer extraction/rendering', 'target Node 24 runtime', 'cloud deployment'],
    'errors': errors,
}
(ROOT / 'evidence/part2-binding-validation.json').write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps(report, indent=2))
sys.exit(1 if errors else 0)
