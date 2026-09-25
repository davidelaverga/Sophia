/** Selected Omnigent 7496d36b wire builders. No network or token custody here. */
export type Json = null | boolean | number | string | Json[] | {
    [k: string]: Json;
};
export interface WireRequest {
    method: 'GET' | 'POST' | 'PUT';
    path: string;
    contentType?: string;
    body?: Json | string;
}
function nonempty(s: string, label: string): string { if (!s.trim() || s.includes('\0'))
    throw new Error(`Invalid ${label}`); return s; }
function segment(s: string): string { return encodeURIComponent(nonempty(s, 'native identifier')); }
export function deviceAuthorize(): WireRequest {
    return { method: 'POST', path: '/oauth/device/authorize', contentType: 'application/json', body: { client_id: 'sophia' } };
}
export function exchangeDeviceCode(deviceCode: string): WireRequest {
    return { method: 'POST', path: '/oauth/token', contentType: 'application/x-www-form-urlencoded', body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: nonempty(deviceCode, 'device code') }).toString() };
}
export function refreshDelegate(refreshToken: string): WireRequest {
    return { method: 'POST', path: '/oauth/token', contentType: 'application/x-www-form-urlencoded', body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: nonempty(refreshToken, 'refresh token') }).toString() };
}
export function revokeDelegate(refreshToken: string): WireRequest {
    return { method: 'POST', path: '/oauth/revoke', contentType: 'application/x-www-form-urlencoded', body: new URLSearchParams({ refresh_token: nonempty(refreshToken, 'refresh token') }).toString() };
}
export function nativeMessage(sessionId: string, text: string): WireRequest {
    return { method: 'POST', path: `/v1/sessions/${segment(sessionId)}/events`, contentType: 'application/json', body: { type: 'message', data: { role: 'user', content: [{ type: 'input_text', text: nonempty(text, 'message') }] } } };
}
export function nativeStop(sessionId: string): WireRequest { return { method: 'POST', path: `/v1/sessions/${segment(sessionId)}/events`, contentType: 'application/json', body: { type: 'stop_session', data: {} } }; }
export function launchRunner(hostId: string, sessionId: string, workspace: string, branch: string, base: string): WireRequest {
    if (!workspace.startsWith('/') || workspace.includes('\0'))
        throw new Error('S1 Mac repository must be an absolute path');
    if (!branch.startsWith('sophia/') || /[\s~^:?*\[\\]/.test(branch) || branch.includes('..'))
        throw new Error('Invalid branch');
    return { method: 'POST', path: `/v1/hosts/${segment(hostId)}/runners`, contentType: 'application/json', body: { session_id: nonempty(sessionId, 'session'), workspace, git: { branch_name: branch, base_branch: nonempty(base, 'base') } } };
}
function record(v: unknown): v is Record<string, unknown> { return typeof v === 'object' && v !== null && !Array.isArray(v); }
export type NativeAck = {
    kind: 'denied';
    reason: string;
} | {
    kind: 'accepted';
    nativePendingId: string | null;
} | {
    kind: 'control_acknowledged';
};
export function decodeEventReply(v: unknown, operation: 'message' | 'control'): NativeAck {
    if (!record(v) || typeof v.queued !== 'boolean')
        throw new Error('protocol_mismatch');
    if (v.denied === true)
        return { kind: 'denied', reason: typeof v.reason === 'string' ? v.reason : 'Native policy denied' };
    if (operation === 'control' && v.queued === false)
        return { kind: 'control_acknowledged' };
    if (operation === 'message' && v.queued === true)
        return { kind: 'accepted', nativePendingId: typeof v.pending_id === 'string' ? v.pending_id : typeof v.item_id === 'string' ? v.item_id : null };
    throw new Error('protocol_mismatch');
}
export function decodeMultipartCreate(v: unknown): string {
    if (!record(v) || typeof v.session_id !== 'string' || !v.session_id)
        throw new Error('protocol_mismatch');
    return v.session_id;
}
export function decodeHostList(v: unknown): ReadonlyArray<Record<string, unknown>> {
    if (!record(v) || !Array.isArray(v.hosts) || !v.hosts.every(record))
        throw new Error('protocol_mismatch');
    return v.hosts;
}
export function normalizeNativeResolution(v: unknown): 'accepted' | 'declined' | 'cancelled' | 'expired' | 'resolved_unknown' {
    if (!record(v))
        throw new Error('protocol_mismatch');
    if (v.action === 'accept')
        return 'accepted';
    if (v.action === 'decline')
        return 'declined';
    if (v.action === 'cancel')
        return 'cancelled';
    if (v.reason === 'unanswered')
        return 'expired';
    return 'resolved_unknown';
}
export function approvalOnce(sessionId: string, requestId: string, action: 'accept' | 'decline' | 'cancel'): WireRequest {
    return { method: 'POST', path: `/v1/sessions/${segment(sessionId)}/elicitations/${segment(requestId)}/resolve`, contentType: 'application/json', body: { action } };
}
/** Readiness is a nullable map, not a list. Readiness is not proof of the running model. */
export type HarnessReadiness = 'reported_ready' | 'unavailable' | 'binary-missing' | 'needs-auth' | 'version-too-low' | 'unknown';
export function harnessReadiness(host: unknown, harness: string): HarnessReadiness {
    if (!record(host) || !record(host.configured_harnesses))
        return 'unknown';
    const value = host.configured_harnesses[harness];
    if (value === true)
        return 'reported_ready';
    if (value === false)
        return 'unavailable';
    if (value === 'binary-missing' || value === 'needs-auth' || value === 'version-too-low')
        return value;
    return 'unknown';
}
