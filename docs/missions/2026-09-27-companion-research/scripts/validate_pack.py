#!/usr/bin/env python3
"""Validate this documentation package. Never invokes applications, providers or deployment tools."""
from __future__ import annotations
import argparse
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]

def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def anchors(path: Path) -> set[str]:
    text = path.read_text(encoding='utf-8')
    result = set(re.findall(r'<a\s+(?:id|name)=["\']([^"\']+)["\']', text))
    counts: dict[str, int] = {}
    for title in re.findall(r'^#{1,6}\s+(.+?)\s*#*$', text, re.M):
        title = re.sub(r'\[([^\]]+)\]\([^)]*\)', r'\1', title)
        slug = re.sub(r'[^\w\- ]', '', title.lower()).strip().replace(' ', '-')
        n = counts.get(slug, 0); counts[slug] = n + 1
        result.add(slug if n == 0 else f'{slug}-{n}')
    return result

def validate() -> dict:
    failures: list[str] = []
    checked = 0
    for path in ROOT.rglob('*.md'):
        text = path.read_text(encoding='utf-8')
        text = re.sub(r'^```.*?^```\s*$', '', text, flags=re.M | re.S)
        for target in re.findall(r'\[[^\]]*\]\(([^)]+)\)', text):
            target = target.strip().strip('<>')
            if urlsplit(target).scheme or target.startswith('//'):
                continue
            if ' "' in target:
                target = target.split(' "', 1)[0]
            loc, _, anchor = unquote(target).partition('#')
            if not loc and not anchor:
                continue
            dest = (path.parent / loc).resolve() if loc else path.resolve()
            checked += 1
            if not dest.is_relative_to(ROOT.resolve()):
                failures.append(f'Outside package: {path.relative_to(ROOT)} -> {target}')
            elif not dest.exists():
                failures.append(f'Missing: {path.relative_to(ROOT)} -> {target}')
            elif anchor and dest.suffix == '.md' and anchor not in anchors(dest):
                failures.append(f'Missing anchor: {path.relative_to(ROOT)} -> {target}')
    json_count = 0
    for path in ROOT.rglob('*.json'):
        if path.name == 'package_validation.json':
            continue
        try:
            json.loads(path.read_text(encoding='utf-8')); json_count += 1
        except (ValueError, UnicodeError) as exc:
            failures.append(f'Invalid JSON: {path.relative_to(ROOT)}: {exc}')
    index = json.loads((ROOT / 'mission_index.json').read_text())
    allowed = {'R00'} | {x['id'] for x in index['missions']}
    goal_count = len(index['foundation']['goals']); test_count = 0
    for item in [index['foundation'], *index['missions']]:
        for key in ('spec', 'claude_launch', 'codex_launch'):
            if not (ROOT / item[key]).is_file():
                failures.append(f'Missing index destination: {item[key]}')
        body = (ROOT / item['spec']).read_text()
        for goal in item['goals']:
            if goal not in body:
                failures.append(f'Missing goal {goal}')
        if item['id'] != 'R00':
            goal_count += len(item['goals'])
            test_count += len(item['acceptance_tests'])
            for test in item['acceptance_tests']:
                if test not in body:
                    failures.append(f'Missing test {test}')
            for dep in item['dependencies']:
                if dep not in allowed:
                    failures.append(f'Unknown dependency {dep}')
    return {
        'schema': 'sophia.mission-pack-validation.v1',
        'scope': 'local_document_structure_only',
        'relative_links_and_anchors_checked': checked,
        'json_files_parsed': json_count,
        'feature_missions': len(index['missions']),
        'foundation_procedures': 1,
        'goal_sessions': goal_count,
        'named_acceptance_cases': test_count,
        'launch_prompts': len(list((ROOT / 'launch').glob('*.md'))),
        'failures': failures,
        'passed': not failures,
        'application_tests_run': False,
        'external_links_network_checked': False,
        'provider_calls_made': False,
        'repository_or_hosted_effects_performed': False,
    }

def check_sums() -> list[str]:
    errors = []
    manifest = ROOT / 'SHA256SUMS'
    if not manifest.exists():
        return ['SHA256SUMS is missing']
    for line in manifest.read_text().splitlines():
        digest, name = line.split('  ', 1)
        path = (ROOT / name).resolve()
        if not path.is_relative_to(ROOT.resolve()) or not path.is_file() or sha(path) != digest:
            errors.append(f'Checksum mismatch/missing: {name}')
    return errors

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write', action='store_true', help='Write validation report and regenerate package checksums')
    args = parser.parse_args()
    result = validate()
    if args.write:
        (ROOT / 'evidence/package_validation.json').write_text(json.dumps(result, indent=2)+'\n')
        files = sorted(p for p in ROOT.rglob('*') if p.is_file() and p != ROOT / 'SHA256SUMS' and '__pycache__' not in p.parts)
        (ROOT / 'SHA256SUMS').write_text(''.join(f'{sha(p)}  {p.relative_to(ROOT).as_posix()}\n' for p in files))
    errors = check_sums()
    print(json.dumps({**result, 'checksum_failures': errors}, indent=2))
    raise SystemExit(0 if result['passed'] and not errors else 1)

if __name__ == '__main__':
    main()
