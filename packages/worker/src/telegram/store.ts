/**
 * Almacén clave-valor del bot.
 *
 * Mismo patrón que `confirmations.ts`: una interfaz mínima con una implementación en
 * memoria para tests y `wrangler dev`, y otra sobre KV de Cloudflare para producción.
 *
 * ⚠️ La versión en memoria NO sobrevive entre isolates de Workers. Sirve para desarrollo
 * y tests; en producción hay que bindear el namespace real (`STACK.md` §2.3).
 */

export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  /** Lista claves por prefijo. KV lo soporta nativamente; en memoria se filtra. */
  list(prefix: string): Promise<string[]>;
}

export class InMemoryStore implements KeyValueStore {
  private readonly data = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.data.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }

  async list(prefix: string): Promise<string[]> {
    return [...this.data.keys()].filter((k) => k.startsWith(prefix));
  }
}

/** Forma mínima del binding de KV que expone Cloudflare. */
export interface CloudflareKvNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(options: { prefix: string }): Promise<{ keys: { name: string }[] }>;
}

export class CloudflareKvStore implements KeyValueStore {
  constructor(private readonly kv: CloudflareKvNamespace) {}

  async get(key: string): Promise<string | null> {
    return this.kv.get(key);
  }

  async put(key: string, value: string): Promise<void> {
    await this.kv.put(key, value);
  }

  async delete(key: string): Promise<void> {
    await this.kv.delete(key);
  }

  async list(prefix: string): Promise<string[]> {
    const result = await this.kv.list({ prefix });
    return result.keys.map((k) => k.name);
  }
}

// ─── Claves (`BOT.md` §9) ────────────────────────────────────────────────────

export const keys = {
  groupConfig: (chatId: number): string => `grupo:${chatId}:config`,
  assembly: (chatId: number, assemblyId: string): string => `grupo:${chatId}:armados:${assemblyId}`,
  assemblyPrefix: (chatId: number): string => `grupo:${chatId}:armados:`,
  challenge: (chatId: number, localId: string): string => `grupo:${chatId}:retos:${localId}`,
  challengePrefix: (chatId: number): string => `grupo:${chatId}:retos:`,
  userWallet: (userId: number): string => `usuario:${userId}:wallet`,
  userHistory: (userId: number): string => `usuario:${userId}:historial`,
} as const;

/**
 * Lee y parsea JSON. Devuelve `null` si no existe o si está corrupto — un valor
 * ilegible se trata como ausente en vez de tumbar el handler entero.
 */
export async function readJson<T>(store: KeyValueStore, key: string): Promise<T | null> {
  const raw = await store.get(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeJson<T>(store: KeyValueStore, key: string, value: T): Promise<void> {
  await store.put(key, JSON.stringify(value));
}
