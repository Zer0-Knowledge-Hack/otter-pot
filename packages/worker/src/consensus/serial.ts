/**
 * Serial command runner shared by the ledger and the dedupe log.
 *
 * Commands run one at a time, in arrival order. Inside a Durable Object the input gates
 * already give this guarantee; running the same queue in the plain-object path makes the
 * in-memory gateway and the test fakes behave like the real thing, so concurrency tests
 * prove the property that matters in production.
 */
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task, task);
    // A rejected task must not poison the chain: later commands still run.
    this.tail = result.catch(() => undefined);
    return result;
  }
}
