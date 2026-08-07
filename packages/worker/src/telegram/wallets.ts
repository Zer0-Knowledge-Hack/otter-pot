/**
 * Vinculación Telegram ↔ wallet (`BOT.md` §3.2).
 *
 * ⚠️ HOY ESTO NO ESTÁ VERIFICADO. Cualquiera puede declarar cualquier dirección:
 * el bot no comprueba que quien escribe controle esa wallet. Sirve para retos entre
 * conocidos, no para custodiar dinero de terceros. La verificación real llega con
 * Privy (`SDD` §9), y por eso todo mensaje de vinculación lo dice explícitamente.
 */

import { keys, readJson, writeJson } from "./store";
import type { KeyValueStore } from "./store";

export interface LinkedWallet {
  address: string;
  /** Epoch en segundos. Sirve para auditar cuándo se declaró. */
  linkedAt: number;
  /** `false` mientras no exista Privy. Nunca se pone en `true` a mano. */
  verified: boolean;
}

const HEX_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export function esDireccionValida(value: string): boolean {
  return HEX_ADDRESS.test(value.trim());
}

/** Enmascara para mostrar en grupo: `0x1234…cdef`. */
export function enmascarar(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export async function vincular(
  store: KeyValueStore,
  userId: number,
  address: string,
): Promise<LinkedWallet> {
  const wallet: LinkedWallet = {
    address: address.trim(),
    linkedAt: Math.floor(Date.now() / 1000),
    verified: false,
  };
  await writeJson(store, keys.userWallet(userId), wallet);
  return wallet;
}

export async function obtenerWallet(
  store: KeyValueStore,
  userId: number,
): Promise<LinkedWallet | null> {
  return readJson<LinkedWallet>(store, keys.userWallet(userId));
}

export async function desvincular(store: KeyValueStore, userId: number): Promise<void> {
  await store.delete(keys.userWallet(userId));
}
