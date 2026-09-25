// The subset of JSON Patch (RFC 6902) that contract amendments use: add, replace and remove, addressed
// by JSON Pointer (RFC 6901). Pure; returns a new document and throws on a path that does not apply,
// so an amendment written against another contract version fails loudly instead of half-applying.

export type PatchOp =
  | { op: 'add'; path: string; value: unknown }
  | { op: 'replace'; path: string; value: unknown }
  | { op: 'remove'; path: string }

type Container = Record<string, unknown> | unknown[]

const isContainer = (value: unknown): value is Container => typeof value === 'object' && value !== null

/** "/a/b~1c" → ["a", "b/c"]; "" addresses the whole document. */
export function pointerTokens(pointer: string): string[] {
  if (pointer === '') return []
  if (!pointer.startsWith('/')) throw new Error(`JSON Pointer must start with "/": ${pointer}`)
  return pointer
    .slice(1)
    .split('/')
    .map((t) => t.replaceAll('~1', '/').replaceAll('~0', '~'))
}

function child(parent: Container, token: string, pointer: string): unknown {
  const value: unknown = Array.isArray(parent) ? parent[Number(token)] : parent[token]
  if (value === undefined) throw new Error(`Path does not exist: ${pointer}`)
  return value
}

function applyOne(target: Container, token: string, op: PatchOp, pointer: string): void {
  if (Array.isArray(target)) {
    const index = token === '-' ? target.length : Number(token)
    if (!Number.isInteger(index) || index < 0 || index > target.length) throw new Error(`Bad array index: ${pointer}`)
    if (op.op === 'add') target.splice(index, 0, op.value)
    else if (index >= target.length) throw new Error(`Path does not exist: ${pointer}`)
    else if (op.op === 'replace') target[index] = op.value
    else target.splice(index, 1)
    return
  }
  if (op.op !== 'add' && !(token in target)) throw new Error(`Path does not exist: ${pointer}`)
  if (op.op === 'remove') delete target[token]
  else target[token] = op.value
}

export function applyPatch<T>(doc: T, ops: readonly PatchOp[]): T {
  const result = structuredClone(doc)
  for (const op of ops) {
    const tokens = pointerTokens(op.path)
    const last = tokens.pop()
    if (last === undefined) throw new Error('Patching the whole document is not supported')
    let target: unknown = result
    for (const token of tokens) {
      if (!isContainer(target)) throw new Error(`Path does not exist: ${op.path}`)
      target = child(target, token, op.path)
    }
    if (!isContainer(target)) throw new Error(`Path does not exist: ${op.path}`)
    applyOne(target, last, op, op.path)
  }
  return result
}
