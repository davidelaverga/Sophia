/**
 * What the Sophia worker and the first-party Paperclip plugin (`sophia.coordination`) exchange over the plugin's
 * declared routes, under `/api/plugins/sophia.coordination/api`:
 *
 *   POST /commissions               create (or find) the core issue of one commission; company from the body
 *   POST /commissions/lookup        find the issue of a commission key, or prove there is none; company from the body
 *   POST /issues/:issueId/control   mirror a Sophia control onto the issue; company from the issue
 *
 * These are new Sophia-owned plugin routes (03_PAPERCLIP_INTEGRATION §4), not Paperclip endpoints. Every body
 * carries a signed envelope over its payload (envelope.ts). The guards here are the one definition both sides read.
 * @module @sophia/coordination/plugin-wire
 */
import type { SignedEnvelope } from './envelope.ts'

export const PLUGIN_ID = 'sophia.coordination'
/** The origin kind of a commissioned issue: Paperclip's own `plugin:<id>:<kind>` namespace (PluginIssueOriginKind). */
export const COMMISSION_ORIGIN_KIND: `plugin:${string}` = `plugin:${PLUGIN_ID}:commission`

export const ROUTES = {
  commission: '/commissions',
  lookup: '/commissions/lookup',
  control: (issueId: string) => `/issues/${encodeURIComponent(issueId)}/control`,
} as const

export type IssueStatus = 'todo' | 'blocked' | 'cancelled' | 'done' | 'in_progress' | 'backlog' | 'in_review'
export type ControlOp = 'hold' | 'resume' | 'stop' | 'complete' | 'fail'

export interface Commission {
  readonly key: string
  readonly sophiaProjectId: string
  readonly paperclipProjectId: string
  readonly workId: string
  readonly title: string
  readonly description: string
  readonly initialStatus: 'todo' | 'blocked' | 'cancelled'
  /** Ask Paperclip to wake the assignee once the issue exists (the work is ready or running in Sophia). */
  readonly wake: boolean
}

export interface CommissionRequest {
  readonly companyId: string
  readonly envelope: SignedEnvelope
  readonly commission: Commission
}

export interface CommissionReply {
  readonly outcome: 'created' | 'existing'
  readonly issueId: string
  readonly status: string
  readonly wakeQueued: boolean
}

export interface Lookup {
  readonly key: string
  readonly sophiaProjectId: string
  readonly workId: string
}

export interface LookupRequest {
  readonly companyId: string
  readonly envelope: SignedEnvelope
  readonly lookup: Lookup
}

export type LookupReply =
  { readonly outcome: 'found'; readonly issueId: string; readonly status: string } | { readonly outcome: 'absent' }

export interface Control {
  readonly op: ControlOp
  readonly key: string
  readonly commissionKey: string
  readonly sophiaProjectId: string
  readonly workId: string
}

export interface ControlRequest {
  readonly envelope: SignedEnvelope
  readonly control: Control
}

export interface ControlReply {
  readonly outcome: 'applied' | 'already'
  readonly issueId: string
  readonly status: string
  readonly wakeQueued: boolean
}

/** A definite refusal: nothing was created or changed. */
export interface PluginRefusal {
  readonly error: { readonly code: string; readonly message: string }
}

/** The issue status each control leaves, and whether the assignee is woken (a Resume). */
export const CONTROL_EFFECT: Readonly<Record<ControlOp, { readonly status: IssueStatus; readonly wake: boolean }>> = {
  hold: { status: 'blocked', wake: false },
  resume: { status: 'todo', wake: true },
  stop: { status: 'cancelled', wake: false },
  complete: { status: 'done', wake: false },
  fail: { status: 'cancelled', wake: false },
}

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/
const COMMISSION_KEY = /^sophia-wbc02-[0-9a-f-]{36}$/

type Fields = Readonly<Record<string, unknown>>
const record = (value: unknown): Fields | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? { ...value } : null
const text = (value: unknown, pattern: RegExp): boolean => typeof value === 'string' && pattern.test(value)
const bounded = (value: unknown, max: number): boolean =>
  typeof value === 'string' && value.length >= 1 && value.length <= max
const onlyKeys = (fields: Fields, keys: readonly string[]): boolean =>
  Object.keys(fields).every((k) => keys.includes(k))

export function isSignedEnvelope(value: unknown): value is SignedEnvelope {
  const fields = record(value)
  return (
    fields !== null &&
    onlyKeys(fields, ['claims', 'signature']) &&
    bounded(fields.claims, 4096) &&
    bounded(fields.signature, 512)
  )
}

function isCommission(value: unknown): value is Commission {
  const c = record(value)
  return (
    c !== null &&
    onlyKeys(c, [
      'key',
      'sophiaProjectId',
      'paperclipProjectId',
      'workId',
      'title',
      'description',
      'initialStatus',
      'wake',
    ]) &&
    text(c.key, COMMISSION_KEY) &&
    text(c.sophiaProjectId, UUID) &&
    text(c.paperclipProjectId, ID) &&
    text(c.workId, UUID) &&
    bounded(c.title, 200) &&
    bounded(c.description, 2000) &&
    (c.initialStatus === 'todo' || c.initialStatus === 'blocked' || c.initialStatus === 'cancelled') &&
    typeof c.wake === 'boolean'
  )
}

export function isCommissionRequest(value: unknown): value is CommissionRequest {
  const r = record(value)
  return (
    r !== null &&
    onlyKeys(r, ['companyId', 'envelope', 'commission']) &&
    text(r.companyId, ID) &&
    isSignedEnvelope(r.envelope) &&
    isCommission(r.commission)
  )
}

export function isLookupRequest(value: unknown): value is LookupRequest {
  const r = record(value)
  const l = record(r?.lookup)
  return (
    r !== null &&
    l !== null &&
    onlyKeys(r, ['companyId', 'envelope', 'lookup']) &&
    onlyKeys(l, ['key', 'sophiaProjectId', 'workId']) &&
    text(r.companyId, ID) &&
    isSignedEnvelope(r.envelope) &&
    text(l.key, COMMISSION_KEY) &&
    text(l.sophiaProjectId, UUID) &&
    text(l.workId, UUID)
  )
}

const CONTROL_OPS: ReadonlySet<unknown> = new Set(Object.keys(CONTROL_EFFECT))

export function isControlRequest(value: unknown): value is ControlRequest {
  const r = record(value)
  const c = record(r?.control)
  return (
    r !== null &&
    c !== null &&
    onlyKeys(r, ['envelope', 'control']) &&
    onlyKeys(c, ['op', 'key', 'commissionKey', 'sophiaProjectId', 'workId']) &&
    isSignedEnvelope(r.envelope) &&
    CONTROL_OPS.has(c.op) &&
    text(c.key, KEY) &&
    text(c.commissionKey, COMMISSION_KEY) &&
    text(c.sophiaProjectId, UUID) &&
    text(c.workId, UUID)
  )
}

export function isCommissionReply(value: unknown): value is CommissionReply {
  const r = record(value)
  return (
    r !== null &&
    (r.outcome === 'created' || r.outcome === 'existing') &&
    text(r.issueId, ID) &&
    typeof r.status === 'string' &&
    typeof r.wakeQueued === 'boolean'
  )
}

export function isLookupReply(value: unknown): value is LookupReply {
  const r = record(value)
  if (r === null) return false
  if (r.outcome === 'absent') return true
  return r.outcome === 'found' && text(r.issueId, ID) && typeof r.status === 'string'
}

export function isControlReply(value: unknown): value is ControlReply {
  const r = record(value)
  return (
    r !== null &&
    (r.outcome === 'applied' || r.outcome === 'already') &&
    text(r.issueId, ID) &&
    typeof r.status === 'string' &&
    typeof r.wakeQueued === 'boolean'
  )
}

export function isPluginRefusal(value: unknown): value is PluginRefusal {
  const e = record(record(value)?.error)
  return e !== null && typeof e.code === 'string' && typeof e.message === 'string'
}
