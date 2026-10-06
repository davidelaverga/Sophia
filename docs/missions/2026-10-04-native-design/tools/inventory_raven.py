#!/usr/bin/env python3
"""Inventory a pinned local Raven Git object tree; never fetch, install or execute it.

Reads only the selected skill roots and optional notice paths in the supplied
trusted manifest. Writes one new JSON file, refusing to overwrite an existing
output. Original donor files are not copied, and no font files are distributed.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path, PurePosixPath
from typing import Any

MAX_BLOB_BYTES = 64 * 1024 * 1024
FONT_SUFFIXES = {'.ttf', '.otf', '.woff', '.woff2', '.ttc', '.pfb', '.pfa'}
IMAGE_SUFFIXES = {'.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'}
SHA = re.compile(r'^[0-9a-f]{40}$')

class InventoryError(RuntimeError):
    pass

def git(repo: Path, *args: str) -> bytes:
    try:
        result = subprocess.run(
            ['git', '-C', str(repo), '--no-pager', *args],
            check=True, capture_output=True, timeout=30,
        )
        return result.stdout
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError) as exc:
        # Avoid echoing arbitrary repository content or a large stderr dump.
        raise InventoryError(f'Git read failed: {args[0] if args else "unknown"}') from exc

def validate_path(value: Any) -> str:
    if not isinstance(value, str) or not value or '\\' in value or '\x00' in value or '\n' in value:
        raise InventoryError('Invalid donor path')
    p = PurePosixPath(value)
    if p.is_absolute() or '..' in p.parts or str(p) != value:
        raise InventoryError('Donor path must be canonical and repository-relative')
    return value

def read_blob(repo: Path, oid: str) -> bytes:
    if not SHA.fullmatch(oid):
        raise InventoryError('Invalid Git blob ID')
    size = int(git(repo, 'cat-file', '-s', oid).strip())
    if size > MAX_BLOB_BYTES:
        raise InventoryError('Donor blob exceeds the inventory safety limit')
    data = git(repo, 'cat-file', 'blob', oid)
    actual = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
    if len(data) != size or actual != oid:
        raise InventoryError('Git blob identity mismatch')
    return data

def rows_for(repo: Path, commit: str, prefix: str) -> list[tuple[str, str, str, str]]:
    out: list[tuple[str, str, str, str]] = []
    for row in git(repo, 'ls-tree', '-r', '-z', commit, '--', prefix).split(b'\0'):
        if not row:
            continue
        header, name = row.split(b'\t', 1)
        mode, typ, oid = header.decode('ascii').split()
        path = validate_path(name.decode('utf-8'))
        out.append((mode, typ, oid, path))
    return out

def inventory(repo: Path, manifest: dict[str, Any]) -> dict[str, Any]:
    commit = manifest.get('commit')
    roots = manifest.get('roots')
    if not isinstance(commit, str) or not SHA.fullmatch(commit):
        raise InventoryError('Manifest needs an exact 40-character commit')
    if not isinstance(roots, list) or len(roots) != 4:
        raise InventoryError('This mission requires exactly four skill roots')
    resolved = git(repo, 'rev-parse', '--verify', f'{commit}^{{commit}}').decode().strip()
    if resolved != commit:
        raise InventoryError('Pinned commit did not resolve exactly')
    entries: dict[str, dict[str, Any]] = {}
    root_receipts: list[dict[str, Any]] = []
    for root in roots:
        if not isinstance(root, dict):
            raise InventoryError('Invalid root record')
        prefix = validate_path(root.get('path'))
        expected = root.get('entry_git_blob')
        if not isinstance(expected, str) or not SHA.fullmatch(expected):
            raise InventoryError('Missing expected entry blob')
        path = prefix + '/SKILL.md'
        entry = git(repo, 'rev-parse', '--verify', f'{commit}:{path}').decode().strip()
        if entry != expected:
            raise InventoryError(f'Entry blob mismatch for {root.get("id", prefix)}')
        rows = rows_for(repo, commit, prefix)
        if not rows:
            raise InventoryError('Selected skill tree is empty')
        root_receipts.append({'id': root.get('id'), 'path': prefix, 'entry_git_blob': entry, 'tracked_files': len(rows)})
        for mode, typ, oid, name in rows:
            if name in entries:
                raise InventoryError('Selected roots overlap')
            suffix = PurePosixPath(name).suffix.lower()
            if typ != 'blob':
                entries[name] = {'path': name, 'git_object': oid, 'mode': mode, 'status': 'non_blob_excluded'}
                continue
            data = read_blob(repo, oid)
            lfs = data.startswith(b'version https://git-lfs.github.com/spec/v1\n')
            if mode == '120000':
                kind, status = 'symlink', 'do_not_follow_or_activate'
            elif suffix in FONT_SUFFIXES:
                kind, status = 'font', 'excluded_from_distribution'
            elif lfs:
                kind, status = 'lfs_pointer', 'materialization_required_not_asset_bytes'
            elif suffix in IMAGE_SUFFIXES:
                kind, status = 'reference_image', 'rights_and_perception_review_required'
            elif suffix in {'.md', '.txt', '.json', '.yaml', '.yml'}:
                kind, status = 'text_reference', 'clause_disposition_required'
            else:
                kind, status = 'other_inert_reference', 'manual_review_no_execution'
            entries[name] = {
                'path': name, 'git_blob': oid, 'sha256': hashlib.sha256(data).hexdigest(),
                'bytes': len(data), 'mode': mode, 'kind': kind, 'status': status,
                'active': False,
            }
    notices = []
    for path in ('LICENSE', 'NOTICES.md', 'LICENSES', 'plugins-dist/design-engine/LICENSE', 'plugins-dist/design-engine/NOTICES.md'):
        for mode, typ, oid, name in rows_for(repo, commit, path):
            if typ == 'blob':
                data = read_blob(repo, oid)
                notices.append({'path': name, 'git_blob': oid, 'sha256': hashlib.sha256(data).hexdigest(), 'mode': mode})
    return {
        'schema': 'sophia.raven-file-inventory.v0.1', 'repository': manifest.get('repository'),
        'commit': commit, 'roots': root_receipts,
        'files': [entries[k] for k in sorted(entries)],
        'notice_files': sorted(notices, key=lambda x: x['path']),
        'notes': [
            'Inert Git-object inventory only; nothing was installed, executed or copied.',
            'No proof of reference rights, model image perception, source adaptation or runtime parity.',
            'No claim that the local checkout HEAD is the pin; all bytes were read directly from pinned Git objects.',
        ],
    }

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, required=True, help='Existing external Raven clone containing the pinned commit')
    parser.add_argument('--manifest', type=Path, default=Path(__file__).resolve().parents[1]/'sources/RAVEN_IMPORT_MANIFEST.json')
    parser.add_argument('--output', type=Path, required=True, help='New JSON output path; existing files are refused')
    args = parser.parse_args()
    try:
        manifest = json.loads(args.manifest.read_text(encoding='utf-8'))
        result = inventory(args.repo.resolve(), manifest)
        # Exclusive creation: never silently overwrite previously reviewed evidence.
        with args.output.open('x', encoding='utf-8') as handle:
            json.dump(result, handle, ensure_ascii=False, indent=2)
            handle.write('\n')
    except (InventoryError, ValueError, OSError) as exc:
        print(f'Inventory not completed: {exc}', file=sys.stderr)
        return 1
    print(f'Inventoried {len(result["files"])} files at {result["commit"]}; no source was activated.')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
