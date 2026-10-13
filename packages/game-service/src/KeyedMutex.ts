/**
 * Async mutual exclusion per key: tasks for the same key run one after another in call
 * order, while tasks for different keys run concurrently.
 *
 * It only coordinates callers inside one JavaScript process (one browser tab, one Node
 * process). Several server instances need a lock in shared storage instead (see
 * docs/api.md, "Concurrency and multiple instances").
 */
export class KeyedMutex {
  private readonly tails = new Map<string, Promise<void>>();

  async run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => current);
    this.tails.set(key, tail);

    await previous;
    try {
      return await task();
    } finally {
      release();
      // Drop the entry once the queue for this key is empty, so idle keys do not leak.
      if (this.tails.get(key) === tail) this.tails.delete(key);
    }
  }

  /** Number of keys with queued or running tasks (for tests and diagnostics). */
  get activeKeys(): number {
    return this.tails.size;
  }
}
