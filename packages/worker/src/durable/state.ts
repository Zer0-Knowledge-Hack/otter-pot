/**
 * Structural subset of `DurableObjectState` the shells actually use.
 *
 * The shells depend on this instead of importing `cloudflare:workers`, which plain
 * vitest cannot resolve. The real `DurableObjectState` satisfies it, and tests pass a
 * fake backed by a map.
 */
export interface DurableStorageLike {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
}

export interface DurableStateLike {
  storage: DurableStorageLike;
}

/** Reads a JSON request body, `undefined` when it is not valid JSON. */
export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
