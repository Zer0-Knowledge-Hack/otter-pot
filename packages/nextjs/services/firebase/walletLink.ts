import { isAddress, type Address } from "viem";

/**
 * Preparación SIWE / firma de wallet.
 * Hoy la app asocia wallet tras connect; en producción verificar firma server-side.
 *
 * Flujo objetivo:
 * connect → nonce → sign message → verify → link Firebase UID ↔ address
 */

export function isValidWalletAddress(value: string | undefined | null): value is Address {
  return Boolean(value && isAddress(value));
}

export function shortAddress(address: string): string {
  if (!isValidWalletAddress(address)) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Nonce opaco para el mensaje de vinculación (client-side prep; idealmente server). */
export function createWalletLinkNonce(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function buildWalletLinkMessage(params: {
  address: string;
  uid: string;
  nonce: string;
  chainId: number;
  domain?: string;
}): string {
  const domain =
    params.domain ||
    (typeof window !== "undefined" ? window.location.host : "otterpot.app");
  return [
    `${domain} quiere que firmes para vincular tu wallet a OtterPot.`,
    "",
    `URI: https://${domain}`,
    `Address: ${params.address}`,
    `Firebase UID: ${params.uid}`,
    `Chain ID: ${params.chainId}`,
    `Nonce: ${params.nonce}`,
    `Issued At: ${new Date().toISOString()}`,
    "",
    "Esta firma no gasta gas ni mueve fondos.",
  ].join("\n");
}

export type WalletLinkPending = {
  address: Address;
  chainId: number;
  nonce: string;
  message: string;
  createdAt: number;
};
