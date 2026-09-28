#!/usr/bin/env python3
"""Check authored M01 prompt assets and literal copies; never calls Sophia or providers."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = 'prompts/M01_ASSETS.v1.1.json'
SPEC = 'missions/M01_MISSION_COMPANION.md'
EXPECTED_COMPONENTS = [
    ('sophia.mission-guide.system.v1.1', 'system_prompt', 'prompts/M01_SYSTEM_PROMPT.v1.1.md'),
    ('sophia.team-mission-lifecycle.v1.1', 'skill', 'skills/mission-lifecycle.v1.1.md'),
]
EXPECTED_TOOLS = [
    'project_status', 'read_selected_source', 'record_mission_note',
    'propose_mission_change', 'decide_mission_change', 'control_work',
]


def _sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _read(root: Path, relative: str) -> bytes:
    path = (root / relative).resolve()
    if not path.is_relative_to(root.resolve()):
        raise ValueError(f'Path outside pack: {relative}')
    return path.read_bytes()


def validate_assets(root: Path = ROOT) -> dict:
    failures: list[str] = []
    bodies: list[bytes] = []
    manifest: dict = {}
    expected = b''
    try:
        manifest = json.loads(_read(root, MANIFEST))
        if manifest.get('schema') != 'sophia.m01-prompt-assets.v1' or manifest.get('version') != '1.1':
            failures.append('Wrong prompt manifest schema/version')
        components = manifest.get('components', [])
        if len(components) != 2:
            failures.append('M01 must have exactly two canonical static components')
        for i, (asset_id, kind, path) in enumerate(EXPECTED_COMPONENTS):
            if i >= len(components):
                failures.append(f'Missing component: {asset_id}')
                continue
            item = components[i]
            if (item.get('id'), item.get('kind'), item.get('path')) != (asset_id, kind, path):
                failures.append(f'Wrong identity/order/path for component {i}')
            data = _read(root, path)
            data.decode('utf-8', errors='strict')
            bodies.append(data)
            if b'\r' in data or data.startswith(b'\xef\xbb\xbf') or not data.endswith(b'\n') or data.endswith(b'\n\n'):
                failures.append(f'Non-canonical UTF-8/LF/newline shape: {path}')
            if _sha(data) != item.get('sha256') or len(data) != item.get('bytes'):
                failures.append(f'Hash/size mismatch: {path}')
            if data.startswith(b'---\n'):
                failures.append(f'Unexpected YAML front matter in provider-facing asset: {path}')
            if re.search(rb'\{\{[^}]+\}\}|\$\{[^}]+\}|\b(?:TODO|TBD|INSERT_PROMPT_HERE)\b', data):
                failures.append(f'Unresolved implementation placeholder: {path}')
        assembly = manifest.get('assembly', {})
        if assembly != {
            'operation': 'concatenate_verbatim', 'separator_hex': '0a',
            'source_order': ['system_prompt', 'skill'], 'frontmatter_stripping': False,
            'interpolation': False, 'summarization': False, 'duplicate_skill_injection': False,
        }:
            failures.append('Unexpected assembly policy')
        if manifest.get('model_facing_operation_names') != EXPECTED_TOOLS:
            failures.append('Unexpected M01 operation-name map')
        if len(bodies) == 2:
            expected = bodies[0] + b'\n' + bodies[1]
            supplied = manifest.get('assembled', {})
            combined_path = 'prompts/M01_SYSTEM_INSTRUCTION.v1.1.txt'
            if supplied.get('path') != combined_path:
                failures.append('Wrong combined-payload path')
            actual = _read(root, combined_path)
            if actual != expected:
                failures.append('Combined instruction is not exact core + LF + full skill')
            if supplied.get('sha256') != _sha(expected) or supplied.get('bytes') != len(expected):
                failures.append('Combined instruction hash/length mismatch')
            spec = _read(root, SPEC).decode('utf-8')
            pattern = r'<!-- M01_FULL_SYSTEM_INSTRUCTION_BEGIN -->\n```text\n(.*?)```\n<!-- M01_FULL_SYSTEM_INSTRUCTION_END -->'
            matches = re.findall(pattern, spec, flags=re.S)
            if len(matches) != 1 or matches[0].encode('utf-8') != expected:
                failures.append('M01 section 8 literal payload differs from canonical assembly')
            core = bodies[0].decode('utf-8')
            skill = bodies[1].decode('utf-8')
            if re.findall(r'^- ([a-z_]+) ', core, flags=re.M) != EXPECTED_TOOLS:
                failures.append('System prompt operation rules do not match fixed tool names/order')
            modes = re.findall(r'^## [1-6]\. ([A-Z]+) ', skill, flags=re.M)
            if modes != ['WANTING', 'PREDICTING', 'EXPECTING', 'EXPLAINING', 'ESCAPING', 'ABSTRACTING']:
                failures.append('Full six-mode skill is missing or changed in organization')
            for heading in ['# Sophia — Mission companion', '# Mission-lifecycle skill — Guide the team\'s evolving mission']:
                if expected.decode('utf-8').count(heading) != 1:
                    failures.append(f'Expected exactly one component heading: {heading}')
            for path in ['launch/M01_CLAUDE.md', 'launch/M01_CODEX.md']:
                launch = _read(root, path).decode('utf-8')
                for required in ['shared/M01_PROMPT_LOADING.md', 'prompts/M01_ASSETS.v1.1.json', 'skills/mission-lifecycle.v1.1.md']:
                    if required not in launch:
                        failures.append(f'{path} omits exact input {required}')
            index = json.loads(_read(root, 'mission_index.json'))
            m01 = next(m for m in index['missions'] if m['id'] == 'SMC-M01')
            for case in ['M01-T19', 'M01-T20', 'M01-T21', 'M01-T22']:
                if case not in m01['acceptance_tests'] or case not in spec:
                    failures.append(f'Missing conformance case: {case}')
    except (OSError, ValueError, KeyError, TypeError, StopIteration) as exc:
        failures.append(f'{type(exc).__name__}: {exc}')
    return {
        'schema': 'sophia.m01-authored-assets-validation.v1',
        'scope': 'package_assets_and_literal_equality_only',
        'component_count': len(bodies),
        'combined_bytes': len(expected) if expected else None,
        'combined_sha256': _sha(expected) if expected else None,
        'combined_words': len(expected.decode('utf-8').split()) if expected else None,
        'full_mode_sequence_checked': True if len(bodies) == 2 else False,
        'spec_and_source_byte_equality_checked': True if expected else False,
        'failures': failures,
        'passed': not failures,
        'application_setup_tests_run': False,
        'conversation_quality_tests_run': False,
        'provider_calls_made': False,
        'repository_or_hosted_effects_performed': False,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write', action='store_true', help='Write local package-only validation report')
    args = parser.parse_args()
    result = validate_assets()
    if args.write:
        (ROOT / 'evidence/m01_prompt_validation.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result, indent=2))
    raise SystemExit(0 if result['passed'] else 1)


if __name__ == '__main__':
    main()
