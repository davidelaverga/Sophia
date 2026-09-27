/** Product control reference. Native adapters must supply real settlement observations. */
export interface ControlState {
    revision: number;
    epoch: number;
    phase: 'running' | 'holding' | 'held' | 'stopping' | 'stopped';
}
export function control(s: ControlState, command: 'hold' | 'stop' | 'resume', expectedRevision: number, expectedEpoch: number): ControlState {
    if (s.revision !== expectedRevision || s.epoch !== expectedEpoch)
        throw new Error('stale_control');
    if (command === 'resume') {
        if (s.phase !== 'held')
            throw new Error('not_settled_held');
        return { ...s, epoch: s.epoch + 1, phase: 'running' };
    }
    if (s.phase === 'stopped' || s.phase === 'stopping')
        throw new Error('already_stopped_or_stopping');
    if (command === 'hold' && s.phase !== 'running')
        throw new Error('not_running');
    return { ...s, epoch: s.epoch + 1, phase: command === 'hold' ? 'holding' : 'stopping' };
}
export function settleControl(s: ControlState, proof: {
    inFlightWrites: number;
    allNativeTargetsSettled: boolean;
    effectsReconciled: boolean;
}): ControlState {
    if (s.phase !== 'holding' && s.phase !== 'stopping')
        return s;
    if (proof.inFlightWrites !== 0 || !proof.allNativeTargetsSettled || !proof.effectsReconciled)
        return s;
    return { ...s, phase: s.phase === 'holding' ? 'held' : 'stopped' };
}
export interface DispatchContext {
    projectId: string;
    goalRevision: number;
    epoch: number;
    phase: ControlState['phase'];
    bindingId: string;
    bindingActive: boolean;
    sourceEligible: boolean;
    grantActive: boolean;
}
export function admitDispatch(current: DispatchContext, queued: Pick<DispatchContext, 'projectId' | 'goalRevision' | 'epoch' | 'bindingId'>): void {
    if (current.projectId !== queued.projectId || current.bindingId !== queued.bindingId)
        throw new Error('wrong_scope');
    if (current.goalRevision !== queued.goalRevision || current.epoch !== queued.epoch)
        throw new Error('stale_dispatch');
    if (current.phase !== 'running' || !current.bindingActive || !current.sourceEligible || !current.grantActive)
        throw new Error('dispatch_not_permitted');
}
export type DeliveryState = 'pending' | 'dispatching' | 'acknowledged' | 'outcome_unknown' | 'settled' | 'superseded' | 'denied';
export function expiredLease(state: DeliveryState): DeliveryState { return state === 'dispatching' ? 'outcome_unknown' : state; }
export function mayAutomaticallySend(state: DeliveryState): boolean { return state === 'pending'; }
export type Operation = 'read' | 'sophia_admission' | 'native_message' | 'native_launch' | 'delegate_refresh' | 'deployment';
export function afterAmbiguousTransport(operation: Operation): 'retry_read' | 'retry_same_admission_key' | 'reconcile_first' | 'reauthorize' {
    if (operation === 'read')
        return 'retry_read';
    if (operation === 'sophia_admission')
        return 'retry_same_admission_key';
    if (operation === 'delegate_refresh')
        return 'reauthorize';
    return 'reconcile_first';
}
export function authorizeHumanAction(request: {
    ownerId: string;
    fingerprint: string;
    state: string;
    responseMode: string;
}, actorId: string, fingerprint: string, sprint: 1 | 2): void {
    if (request.ownerId !== actorId)
        throw new Error('wrong_owner');
    if (request.fingerprint !== fingerprint || request.state !== 'pending')
        throw new Error('stale_request');
    if (sprint === 1 || request.responseMode === 'native_only')
        throw new Error('native_handoff_required');
}
