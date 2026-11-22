import { PROTOTYPE_ENTRY_MAX_BYTES, prototypeEntrySha256 } from '@sophia/design'
import { DomainError } from '@sophia/domain'
import type { ManagedExploreRetainedEntry } from '@sophia/persistence'
import { ByteStoreError, objectPath, storedKey, type ByteStore } from './byte-store.ts'

async function readPrototypeObject(
  { projectId, sourceId, storageKey, byteLength }: ManagedExploreRetainedEntry,
  store: ByteStore | null,
): Promise<Uint8Array> {
  if (!store?.getExact || storageKey !== storedKey(projectId, sourceId)) {
    throw new DomainError('unavailable', 'The retained prototype bytes are unavailable')
  }
  try {
    return await store.getExact(objectPath(projectId, sourceId), {
      expectedBytes: byteLength,
      maxBytes: PROTOTYPE_ENTRY_MAX_BYTES,
    })
  } catch (error) {
    if (error instanceof ByteStoreError && error.status === 409) {
      throw new DomainError('invalid_state', 'The retained prototype bytes did not match their record')
    }
    throw error
  }
}

/** Read the authorized source as exact UTF-8 bytes, bounded by both its recorded length and the prototype limit. */
export async function readRetainedPrototype(
  entry: ManagedExploreRetainedEntry,
  store: ByteStore | null,
): Promise<Uint8Array> {
  const { text, entrySha256, byteLength } = entry
  if (!Number.isSafeInteger(byteLength) || byteLength < 1 || byteLength > PROTOTYPE_ENTRY_MAX_BYTES) {
    throw new DomainError('invalid_state', 'The retained prototype has an invalid recorded length')
  }
  const bytes = text === null ? await readPrototypeObject(entry, store) : Buffer.from(text, 'utf8')
  if (bytes.byteLength !== byteLength) {
    throw new DomainError('invalid_state', 'The retained prototype bytes did not match their record')
  }
  const retained = text === null ? Uint8Array.from(bytes) : bytes
  if (prototypeEntrySha256(retained) !== entrySha256) {
    throw new DomainError('invalid_state', 'The retained prototype bytes did not match their record')
  }
  return retained
}
