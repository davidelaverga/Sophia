// Which join is the call. Joining takes seconds (a room token from the API, then LiveKit), and a Leave, the page
// going away or a newer join can come in meanwhile. Each of those moves the generation, and the connection a
// superseded join opens is left at once instead of becoming the call: no microphone stays connected behind a screen
// that says this person left (Codex's end-to-end check of 4a4176b).

export interface Leavable {
  leave: () => Promise<void>
}

export class CallFence<C extends Leavable> {
  private generation = 0
  /** The call this person is in, if any. */
  current: C | null = null

  /** A join starts: it supersedes any join still under way. */
  begin(): number {
    this.generation += 1
    return this.generation
  }

  /** Is `call` still the latest join? A superseded one's events and failures are not this person's call. */
  isCurrent(call: number): boolean {
    return call === this.generation
  }

  /** The join `call` opened `opened`: it becomes the call, or, superseded meanwhile, it is left at once. */
  adopt(call: number, opened: C): boolean {
    if (!this.isCurrent(call)) {
      void opened.leave().catch(() => undefined)
      return false
    }
    this.current = opened
    return true
  }

  /** Leave, or the page goes away: every join under way is superseded, and the call is left. */
  async end(): Promise<void> {
    this.generation += 1
    const call = this.current
    this.current = null
    await call?.leave()
  }
}
