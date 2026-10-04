import type { DurableNamespaceLike } from "../../src/consensus/gateway";
import type { DurableStateLike } from "../../src/durable/state";

/** Fake `state.storage` over a map; reads and writes yield to the event loop like the real one. */
export function fakeState(): DurableStateLike {
  const map = new Map<string, unknown>();
  return {
    storage: {
      async get<T>(key: string): Promise<T | undefined> {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return map.get(key) as T | undefined;
      },
      async put<T>(key: string, value: T): Promise<void> {
        await new Promise((resolve) => setTimeout(resolve, 1));
        map.set(key, value);
      },
    },
  };
}

export interface DurableShell {
  fetch(request: Request): Promise<Response>;
}

/** Namespace that routes `idFromName(name)` to one shell instance per name, like the runtime does. */
export function fakeNamespace(create: (state: DurableStateLike) => DurableShell): DurableNamespaceLike {
  const instances = new Map<string, DurableShell>();
  return {
    idFromName: (name: string) => name,
    get: (id: unknown) => {
      const key = String(id);
      let shell = instances.get(key);
      if (!shell) {
        shell = create(fakeState());
        instances.set(key, shell);
      }
      const target = shell;
      return {
        fetch: (input: string, init?: RequestInit) => target.fetch(new Request(input, init)),
      };
    },
  };
}
