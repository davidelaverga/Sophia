/** A bounded source-edit contract, not a universal semantic artifact editor. */
export function safeRelativePath(p: string): boolean {
    if (!p || p.length > 512 || p.startsWith('/') || p.includes('\\') || /[\x00-\x1f:]/.test(p) || /%[0-9a-f]{2}/i.test(p))
        return false;
    return p.split('/').every(s => s !== '' && s !== '.' && s !== '..');
}
export interface FilePatch {
    path: string;
    expectedSha256: string | null;
    replacementSourceId: string | null;
}
export function validatePatch(currentVersion: string, expectedVersion: string, hashes: ReadonlyMap<string, string>, patches: ReadonlyArray<FilePatch>): void {
    if (currentVersion !== expectedVersion)
        throw new Error('source_head_conflict');
    if (!patches.length)
        throw new Error('empty_patch');
    const seen = new Set<string>();
    for (const p of patches) {
        if (!safeRelativePath(p.path))
            throw new Error('unsafe_path');
        if (seen.has(p.path))
            throw new Error('duplicate_path');
        seen.add(p.path);
        if ((hashes.get(p.path) ?? null) !== p.expectedSha256)
            throw new Error('file_conflict');
        if (p.expectedSha256 === null && p.replacementSourceId === null)
            throw new Error('delete_missing_file');
    }
}
export function layoutOutcome(measurement: {
    available: boolean;
    overflowPx: number | null;
}, limit: number): 'passed' | 'failed' | 'unknown' {
    if (!measurement.available || measurement.overflowPx === null)
        return 'unknown';
    if (!Number.isFinite(measurement.overflowPx) || measurement.overflowPx < 0)
        throw new Error('invalid_measurement');
    return measurement.overflowPx > limit ? 'failed' : 'passed';
}
export type CanonicalJson = null | boolean | number | string | ReadonlyArray<CanonicalJson> | {
    readonly [key: string]: CanonicalJson;
};
export function canonicalJson(v: CanonicalJson): string {
    if (v === null || typeof v === 'boolean' || typeof v === 'string')
        return JSON.stringify(v);
    if (typeof v === 'number') {
        if (!Number.isFinite(v))
            throw new Error('nonfinite_json');
        return JSON.stringify(v);
    }
    if (Array.isArray(v))
        return '[' + v.map(x => canonicalJson(x)).join(',') + ']';
    const o = v as {
        readonly [key: string]: CanonicalJson;
    };
    return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + canonicalJson(o[k]!)).join(',') + '}';
}
