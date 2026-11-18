// Ownership for the new H fixtures only: readers drain before DB drop or private files, and every cleanup is attempted.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ChildProcess } from 'node:child_process'
import type { Server } from 'node:http'
import type { TestContext } from 'node:test'

type Phase = 'fences' | 'readers' | 'database' | 'files'
type Cleanup = { name: string; phase: Phase; run: () => void | Promise<void> }
type Close = [number | null, NodeJS.Signals | null]
const asError = (value: unknown): Error =>
  value instanceof Error ? value : new Error('Fixture threw a non-error', { cause: value })
export async function fixtureDeadline<T>(pending: Promise<T>, ms = 3000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      pending,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Owned H fixture deadline')), ms)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
async function closesSoon(closed: Promise<Close>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      closed,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, 250)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
function combined(primary: Error | undefined, cleanup: Error | undefined): Error | undefined {
  return primary && cleanup
    ? new AggregateError([primary, cleanup], 'H fixture body and cleanup failed', { cause: primary })
    : (primary ?? cleanup)
}
export class OwnerHostFixtureResources {
  private readonly tasks: Cleanup[] = []
  private closing: Promise<void> | null = null
  private readonly pendingChildren = new Set<ChildProcess>()
  private readonly pendingPools = new Set<object>()
  readonly childReports: { pid: number | null; signals: NodeJS.Signals[]; close: Close | null }[] = []
  own(name: string, run: () => void | Promise<void>, phase: Phase = 'readers'): void {
    if (this.closing) throw new Error('H fixture ownership already closing')
    this.tasks.push({ name, run, phase })
  }
  directory(prefix: string): string {
    const dir = mkdtempSync(join(tmpdir(), prefix))
    this.own(
      'private directory',
      () => {
        if (this.pendingChildren.size) throw new Error('Owned child close unproven; private directory retained')
        rmSync(dir, { recursive: true, force: true })
      },
      'files',
    )
    return dir
  }
  pool<T extends { end(): Promise<void> }>(pool: T): T {
    this.pendingPools.add(pool)
    this.own('pool drain', async () => {
      await fixtureDeadline(pool.end(), 15_000)
      this.pendingPools.delete(pool)
    })
    return pool
  }
  database<T extends { drop(): Promise<void> }>(db: T): T {
    this.own(
      'owned database drop',
      async () => {
        if (this.pendingPools.size) throw new Error('Owned pool drain unproven; database retained')
        await db.drop()
      },
      'database',
    )
    return db
  }
  app<T extends { close(): Promise<void> }>(app: T): T {
    this.own('app close', () => fixtureDeadline(app.close(), 15_000))
    return app
  }
  server<T extends Server>(server: T): T {
    const errors: Error[] = []
    const onError = (err: Error) => {
      errors.push(err)
    }
    server.on('error', onError)
    this.own('server close', async () => {
      try {
        server.closeAllConnections()
        await fixtureDeadline(
          new Promise<void>((resolve, reject) =>
            server.close((err) => {
              if (err && !('code' in err && err.code === 'ERR_SERVER_NOT_RUNNING' && !server.listening)) reject(err)
              else resolve()
            }),
          ),
        )
      } finally {
        server.removeListener('error', onError)
      }
      if (errors.length) throw new AggregateError(errors, 'Owned H server reported errors')
    })
    return server
  }
  child(child: ChildProcess): { closed: Promise<Close> } {
    this.pendingChildren.add(child)
    const report: { pid: number | null; signals: NodeJS.Signals[]; close: Close | null } = {
      pid: child.pid ?? null,
      signals: [],
      close: null,
    }
    this.childReports.push(report)
    let spawnError: Error | undefined
    child.once('error', (err) => {
      spawnError = err
    })
    const closed = new Promise<Close>((resolve) =>
      child.once('close', (code, signal) => {
        report.close = [code, signal]
        this.pendingChildren.delete(child)
        resolve([code, signal])
      }),
    )
    const running = () =>
      report.close === null && child.exitCode === null && child.signalCode === null && child.pid !== undefined
    this.own('child close', async () => {
      if (running()) {
        if (child.kill('SIGTERM')) report.signals.push('SIGTERM')
        await closesSoon(closed)
        if (running() && child.kill('SIGKILL')) report.signals.push('SIGKILL')
      }
      await fixtureDeadline(closed)
      if (spawnError) throw spawnError
    })
    return { closed }
  }
  close(): Promise<void> {
    return (this.closing ??= this.cleanup())
  }
  private async cleanup(): Promise<void> {
    const failures: Error[] = []
    for (const phase of ['fences', 'readers', 'database', 'files'] as const) {
      for (const task of this.tasks.toReversed().filter((item) => item.phase === phase)) {
        try {
          await task.run()
        } catch (err: unknown) {
          failures.push(new Error(task.name + ' failed', { cause: err }))
        }
      }
    }
    if (failures.length) throw new AggregateError(failures, 'Owned H fixture cleanup failed')
  }
  async setup<T>(body: () => Promise<T>): Promise<T> {
    try {
      return await body()
    } catch (err: unknown) {
      let cleanup: Error | undefined
      try {
        await this.close()
      } catch (failure: unknown) {
        cleanup = asError(failure)
      }
      throw combined(asError(err), cleanup) ?? asError(err)
    }
  }
  async run<T>(body: () => Promise<T>): Promise<T> {
    const value = await this.setup(body)
    await this.close()
    return value
  }
}
const owners = new WeakMap<TestContext, OwnerHostFixtureResources>()
export function ownerHostFixtures(t: TestContext): OwnerHostFixtureResources {
  const known = owners.get(t)
  if (known) return known
  const owner = new OwnerHostFixtureResources()
  owners.set(t, owner)
  t.after(() => owner.close())
  return owner
}
