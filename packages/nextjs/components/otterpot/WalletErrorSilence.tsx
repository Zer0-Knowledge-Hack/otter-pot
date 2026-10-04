"use client";

/**
 * Wagmi/RainbowKit a veces lanza unhandledRejection al restaurar sesión
 * si MetaMask no está inyectado (p. ej. http://192.168.x.x o extensión ausente).
 *
 * El listener se registra al cargar el módulo y en fase de captura: así corre antes
 * que el overlay de errores de Next (que escucha el mismo evento) y antes del
 * reconnect de wagmi. Solo se filtran estos errores conocidos de wallet.
 */
const BENIGN_WALLET_ERRORS = [
  "failed to connect to metamask",
  "metamask extension not found",
  "connector not found",
  "provider not found",
  "user rejected",
  "connection request reset",
];

function onRejection(event: PromiseRejectionEvent) {
  const reason = event.reason;
  const msg = String(reason?.shortMessage || reason?.message || reason?.toString?.() || reason || "").toLowerCase();

  if (!BENIGN_WALLET_ERRORS.some(fragment => msg.includes(fragment))) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  if (process.env.NODE_ENV === "development") {
    console.info("[OtterPot] Wallet reconnect omitido:", msg.slice(0, 120));
  }
}

// La marca evita listeners duplicados cuando HMR reevalúa el módulo.
const FLAG = "__otterpotWalletErrorSilence";
if (typeof window !== "undefined" && !(window as unknown as Record<string, boolean>)[FLAG]) {
  (window as unknown as Record<string, boolean>)[FLAG] = true;
  window.addEventListener("unhandledrejection", onRejection, { capture: true });
}

export function WalletErrorSilence() {
  return null;
}
