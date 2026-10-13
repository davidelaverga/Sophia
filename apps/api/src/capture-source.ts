// One immutable object per capture name in an authorized render lease. A replay must hit the database's durable
// write-once claim before it can charge another backup or PUT. A renewed lease owns a new object: 0045 discards the
// lost lease's output associations, and 0039 records the new run's captures. This is refusal, not an idempotent reply.
import { createHash } from 'node:crypto'

/** Only the renderer route supplies these identities, after the database validates the actual capability/lease. */
export function captureSourceId(project: string, job: string, lease: string, name: string): string {
  const digest = createHash('sha256')
    .update(JSON.stringify(['sophia.capture-source.v1', project, job, lease, name]))
    .digest()
  // UUIDv8: domain-separated application data, with the standard version/variant bits and 122 hash bits retained.
  digest.writeUInt8((digest.readUInt8(6) & 0x0f) | 0x80, 6)
  digest.writeUInt8((digest.readUInt8(8) & 0x3f) | 0x80, 8)
  const hex = digest.subarray(0, 16).toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
