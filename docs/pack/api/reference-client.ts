import type { GoalCommand, Receipt, Snapshot, CommandStatus, Operations } from './generated-types.js';
/** A fetch-based client for selected application routes. No automatic write retries. */
export class AdmissionOutcomeUnknown extends Error {
    constructor(readonly idempotencyKey: string, options?: ErrorOptions) { super('Sophia admission reply unavailable; recover with the same key', options); this.name = 'AdmissionOutcomeUnknown'; }
}
export class SophiaApiError extends Error {
    constructor(readonly status: number, readonly payload: unknown) { super(`Sophia API returned ${status}`); this.name = 'SophiaApiError'; }
}
export interface ClientOptions {
    baseUrl: string;
    accessToken: () => Promise<string>;
    fetchImpl?: typeof fetch;
}
export class SophiaClient {
    private readonly origin: string;
    private readonly fetcher: typeof fetch;
    constructor(private readonly options: ClientOptions) {
        const url = new URL(options.baseUrl);
        if (url.username || url.password || url.search || url.hash || url.pathname !== '/')
            throw new Error('Use the configured API origin only');
        if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
            throw new Error('HTTPS required outside local development');
        this.origin = url.origin;
        this.fetcher = options.fetchImpl ?? fetch;
    }
    private async request<T>(method: string, path: string, body: unknown, key?: string): Promise<T> {
        const token = await this.options.accessToken();
        const headers: Record<string, string> = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' };
        if (key !== undefined) {
            if (!key || key.length > 160)
                throw new Error('Invalid Idempotency-Key');
            headers['Idempotency-Key'] = key;
        }
        if (body !== undefined)
            headers['Content-Type'] = 'application/json';
        let response: Response;
        try {
            response = await this.fetcher(this.origin + path, { method, headers, redirect: 'error', ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        }
        catch (error) {
            if (key !== undefined)
                throw new AdmissionOutcomeUnknown(key, { cause: error });
            throw error;
        }
        let payload: unknown;
        try {
            payload = await response.json();
        }
        catch (error) {
            if (response.ok && key !== undefined)
                throw new AdmissionOutcomeUnknown(key, { cause: error });
            throw new SophiaApiError(response.status, 'invalid_json');
        }
        if (!response.ok)
            throw new SophiaApiError(response.status, payload);
        // The product adds generated runtime response validators. This reference supplies compile-time types only.
        return payload as T;
    }
    getProjectSnapshot(projectId: string): Promise<Snapshot> { return this.request('GET', `/api/v1/projects/${encodeURIComponent(projectId)}/snapshot`, undefined); }
    admitGoalCommand(projectId: string, command: GoalCommand, key: string): Promise<Receipt> { return this.request('POST', `/api/v1/projects/${encodeURIComponent(projectId)}/commands`, command, key); }
    getCommandStatus(projectId: string, commandId: string): Promise<CommandStatus> { return this.request('GET', `/api/v1/projects/${encodeURIComponent(projectId)}/commands/${encodeURIComponent(commandId)}`, undefined); }
}
// Compile-time coverage: these names must remain in the generated contract.
export type ImplementedReferenceOperations = Pick<Operations, 'getProjectSnapshot' | 'admitGoalCommand' | 'getCommandStatus'>;
