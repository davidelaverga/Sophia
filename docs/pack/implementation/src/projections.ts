/** Safe client projection rules. Own sequences are decimal strings, not JS Numbers. */
export interface EntityEvent {
    sequence: string;
    eventId: string;
    entityId: string;
    entityRevision: number;
    type: 'entity.changed';
}
export interface AdvanceEvent {
    sequence: string;
    type: 'cursor.advanced';
}
export interface Projection {
    cursor: string;
    seenIds: ReadonlySet<string>;
    versions: ReadonlyMap<string, number>;
    needsSnapshot: boolean;
}
function seq(s: string): bigint { if (!/^(0|[1-9][0-9]*)$/.test(s))
    throw new Error('invalid_cursor'); return BigInt(s); }
export function applyEvent(s: Projection, e: EntityEvent | AdvanceEvent): Projection {
    if (s.needsSnapshot)
        return s;
    const old = seq(s.cursor), next = seq(e.sequence);
    if (next <= old)
        return s;
    // An authorized cursor advance explicitly accounts for omitted private events.
    if (e.type === 'cursor.advanced')
        return { ...s, cursor: e.sequence };
    if (next !== old + 1n)
        return { ...s, needsSnapshot: true };
    const seen = new Set(s.seenIds);
    const versions = new Map(s.versions);
    if (!seen.has(e.eventId)) {
        seen.add(e.eventId);
        if ((versions.get(e.entityId) ?? 0) < e.entityRevision)
            versions.set(e.entityId, e.entityRevision);
    }
    return { ...s, cursor: e.sequence, seenIds: seen, versions };
}
export interface View {
    lens: 'Converse' | 'Explore' | 'Build';
    localVersionId: string | null;
    sharedFocusRevision: number;
    draft: string | null;
}
export function navigate(s: View, lens: View['lens'], versionId: string | null): View { return { ...s, lens, localVersionId: versionId }; }
export function reconnectView(s: View, sharedFocusRevision: number): View { return { ...s, sharedFocusRevision }; }
export function chooseCurrentPreview(stable: string | null, candidate: {
    id: string;
    state: 'building' | 'failed' | 'ready';
} | null): string | null {
    return candidate?.state === 'ready' ? candidate.id : stable;
}
