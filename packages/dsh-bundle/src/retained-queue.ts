/** Items per request: the contract's `maxItems` for receipt and observation batches (A04). */
export const BATCH_ITEMS = 500

/**
 * Serialized bytes per request: half the API's 8 MiB body limit for these routes. One observation can carry
 * 120,000 characters of assistant text, so after an outage a batch counted by items alone could exceed that limit,
 * and the same rejected batch would then be retried forever, holding back every later item.
 */
export const BATCH_BYTES = 4 * 1024 * 1024

/**
 * The head of the queue that fits one request: at least one item, then as many as fit within `maxItems` and
 * `maxBytes` of JSON. A single item never exceeds the API's limit on its own: the wire bounds each field.
 */
export function headBatch<T>(items: readonly T[], maxBytes = BATCH_BYTES, maxItems = BATCH_ITEMS): T[] {
  let bytes = 0
  let count = 0
  while (count < items.length && count < maxItems) {
    const size = Buffer.byteLength(JSON.stringify(items[count])) + 1
    if (count > 0 && bytes + size > maxBytes) break
    bytes += size
    count += 1
  }
  return items.slice(0, count)
}

/**
 * In-order delivery to the service that keeps every item until the service
 * acknowledges it, retrying with bounded backoff. The service deduplicates
 * (receipts by command and stage, observations by native seq).
 */
export class RetainedQueue<T> {
  private items: T[] = []
  private running: Promise<void> | null = null
  private backoffMs = 0

  constructor(
    private readonly label: string,
    private readonly deliver: (batch: T[]) => Promise<void>,
    private readonly options: { readonly delayMs: number; readonly signal: AbortSignal; readonly log: (line: string) => void; readonly onAck?: (batch: T[]) => void },
  ) {}

  push(...items: T[]): void {
    if (items.length === 0) return
    this.items.push(...items)
    this.schedule(this.options.delayMs)
  }

  private schedule(delayMs: number): void {
    this.running ??= new Promise<void>((resolve) => setTimeout(resolve, delayMs)).then(() => this.drain())
  }

  private async drain(): Promise<void> {
    const batch = headBatch(this.items)
    try {
      await this.deliver(batch)
      this.items.splice(0, batch.length)
      this.backoffMs = 0
      try {
        this.options.onAck?.(batch)
      } catch (error) {
        this.options.log(`${this.label} acknowledgement bookkeeping failed: ${(error as Error).message}`)
      }
    } catch (error) {
      this.backoffMs = Math.min(Math.max(1000, this.backoffMs * 2), 10_000)
      this.options.log(`${this.label} delivery failed (${batch.length} kept, retry in ${this.backoffMs} ms): ${(error as Error).message}`)
    }
    this.running = null
    if (this.items.length > 0 && !this.options.signal.aborted) this.schedule(this.backoffMs || this.options.delayMs)
  }

  /** Best effort on shutdown: wait for the current attempt, then try once more. */
  async flush(): Promise<void> {
    await this.running
    if (this.items.length > 0) await this.drain()
  }
}
