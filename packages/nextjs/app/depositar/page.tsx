"use client";

/**
 * Página de depósito — el paso que el bot no puede hacer por vos.
 *
 * `deposit` exige la firma del participante (ver `docs/BOT.md` §2), así que el bot
 * manda acá con `/depositar <id>` y el usuario firma con su propia wallet.
 *
 * Autónoma a propósito: usa `window.ethereum` + viem directo, sin RainbowKit ni el
 * árbol de providers del scaffold. Dentro de Telegram no hay extensiones de navegador
 * (`STACK.md` §1), así que esta página se abre en el navegador del sistema mediante un
 * botón de tipo `url` — los botones `web_app` solo funcionan en chats privados.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPublicClient, createWalletClient, custom, http, parseAbi } from "viem";
import type { Address, EIP1193Provider } from "viem";
import { arbitrumSepolia } from "viem/chains";

const POOL_ABI = parseAbi([
  "function deposit(uint256 challengeId)",
  "function challengeStatus(uint256 challengeId) view returns (uint8)",
]);

const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
]);

const POOL = process.env["NEXT_PUBLIC_CHALLENGE_POOL_ADDRESS"] as Address | undefined;
const USDC = process.env["NEXT_PUBLIC_USDC_ADDRESS"] as Address | undefined;
const RPC = process.env["NEXT_PUBLIC_CHAIN_RPC_URL"] ?? "https://sepolia-rollup.arbitrum.io/rpc";

const ESTADOS = ["Abierto", "Bloqueado", "Resuelto", "Reembolsado"] as const;

type Paso = "conectar" | "aprobar" | "depositar" | "listo";

export default function DepositarPage() {
  const [cuenta, setCuenta] = useState<Address | null>(null);
  const [retoId, setRetoId] = useState<string>("");
  const [monto, setMonto] = useState<string>("");
  const [estado, setEstado] = useState<string>("");
  const [paso, setPaso] = useState<Paso>("conectar");
  const [error, setError] = useState<string>("");
  const [ocupado, setOcupado] = useState(false);
  const [txHash, setTxHash] = useState<string>("");

  const publicClient = useMemo(() => createPublicClient({ chain: arbitrumSepolia, transport: http(RPC) }), []);

  // El bot manda el reto en la query: /depositar?reto=3
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setRetoId(params.get("reto") ?? "");
    setMonto(params.get("monto") ?? "");
  }, []);

  const proveedor = useCallback((): EIP1193Provider => {
    const eth = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
    if (!eth) throw new Error("No encontré una wallet en este navegador. Instalá MetaMask y volvé a entrar.");
    return eth;
  }, []);

  const conectar = useCallback(async () => {
    setError("");
    setOcupado(true);
    try {
      const eth = proveedor();
      const cuentas = (await eth.request({ method: "eth_requestAccounts" })) as Address[];
      const primera = cuentas[0];
      if (!primera) throw new Error("No autorizaste ninguna cuenta.");

      // Asegura que la wallet esté en Arbitrum Sepolia; si no la tiene, la agrega.
      try {
        await eth.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: `0x${arbitrumSepolia.id.toString(16)}` }],
        });
      } catch {
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: `0x${arbitrumSepolia.id.toString(16)}`,
              chainName: "Arbitrum Sepolia",
              nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
              rpcUrls: [RPC],
              blockExplorerUrls: ["https://sepolia.arbiscan.io"],
            },
          ],
        });
      }

      setCuenta(primera);
      setPaso("aprobar");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  }, [proveedor]);

  // Estado del reto en la cadena, para no dejar depositar en uno ya cerrado.
  useEffect(() => {
    if (!retoId || !POOL) return;
    publicClient
      .readContract({ address: POOL, abi: POOL_ABI, functionName: "challengeStatus", args: [BigInt(retoId)] })
      .then(s => setEstado(ESTADOS[Number(s)] ?? "Desconocido"))
      .catch(() => setEstado("no pude leerlo"));
  }, [retoId, publicClient]);

  const depositar = useCallback(async () => {
    if (!cuenta || !POOL || !USDC || !retoId) return;
    setError("");
    setOcupado(true);
    try {
      const eth = proveedor();
      const walletClient = createWalletClient({ account: cuenta, chain: arbitrumSepolia, transport: custom(eth) });

      const decimales = await publicClient.readContract({ address: USDC, abi: ERC20_ABI, functionName: "decimals" });
      const requerido = BigInt(monto || "0") * 10n ** BigInt(decimales);

      const saldo = await publicClient.readContract({
        address: USDC,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [cuenta],
      });
      if (saldo < requerido) {
        throw new Error(`No te alcanza el USDC: necesitás ${monto} y tenés menos.`);
      }

      // 1) Aprobar, solo si la autorización vigente no alcanza.
      const permitido = await publicClient.readContract({
        address: USDC,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [cuenta, POOL],
      });

      if (permitido < requerido) {
        setPaso("aprobar");
        const hashAprobar = await walletClient.writeContract({
          address: USDC,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [POOL, requerido],
        });
        await publicClient.waitForTransactionReceipt({ hash: hashAprobar });
      }

      // 2) Depositar.
      setPaso("depositar");
      const hash = await walletClient.writeContract({
        address: POOL,
        abi: POOL_ABI,
        functionName: "deposit",
        args: [BigInt(retoId)],
      });
      await publicClient.waitForTransactionReceipt({ hash });

      setTxHash(hash);
      setPaso("listo");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Los errores de wallet vienen larguísimos; se muestra la primera línea.
      setError(msg.split("\n")[0] ?? msg);
    } finally {
      setOcupado(false);
    }
  }, [cuenta, retoId, monto, proveedor, publicClient]);

  const faltaConfig = !POOL || !USDC;

  return (
    <main style={estilos.pagina}>
      <div style={estilos.tarjeta}>
        <div style={estilos.encabezado}>
          <span style={{ fontSize: 40 }}>🦦</span>
          <h1 style={estilos.titulo}>Depositar en el reto</h1>
        </div>

        {faltaConfig ? (
          <p style={estilos.error}>
            Falta configurar las direcciones de los contratos. Avisale a quien administra el bot.
          </p>
        ) : (
          <>
            <dl style={estilos.datos}>
              <div style={estilos.fila}>
                <dt style={estilos.etiqueta}>Reto</dt>
                <dd style={estilos.valor}>#{retoId || "—"}</dd>
              </div>
              <div style={estilos.fila}>
                <dt style={estilos.etiqueta}>Tu depósito</dt>
                <dd style={estilos.valor}>{monto || "—"} USDC</dd>
              </div>
              <div style={estilos.fila}>
                <dt style={estilos.etiqueta}>Estado</dt>
                <dd style={estilos.valor}>{estado || "…"}</dd>
              </div>
            </dl>

            {estado === "Bloqueado" || estado === "Resuelto" || estado === "Reembolsado" ? (
              <p style={estilos.aviso}>
                Este reto ya no acepta depósitos: está <b>{estado}</b>.
              </p>
            ) : paso === "listo" ? (
              <div style={estilos.exito}>
                <p style={{ margin: 0, fontWeight: 600 }}>✅ Depósito confirmado</p>
                <a
                  href={`https://sepolia.arbiscan.io/tx/${txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  style={estilos.enlace}
                >
                  Ver en Arbiscan
                </a>
                <p style={{ marginBottom: 0 }}>Ya podés volver al grupo de Telegram.</p>
              </div>
            ) : !cuenta ? (
              <button onClick={conectar} disabled={ocupado} style={estilos.boton}>
                {ocupado ? "Conectando…" : "Conectar wallet"}
              </button>
            ) : (
              <>
                <p style={estilos.cuenta}>
                  Conectado: <code>{`${cuenta.slice(0, 6)}…${cuenta.slice(-4)}`}</code>
                </p>
                <button onClick={depositar} disabled={ocupado || !retoId} style={estilos.boton}>
                  {ocupado
                    ? paso === "aprobar"
                      ? "Aprobando USDC…"
                      : "Depositando…"
                    : `Depositar ${monto || ""} USDC`}
                </button>
                <p style={estilos.nota}>
                  Son dos firmas: primero autorizás al contrato a mover tu USDC, después depositás.
                </p>
              </>
            )}

            {error && <p style={estilos.error}>{error}</p>}
          </>
        )}
      </div>
    </main>
  );
}

// Estilos en línea a propósito: la página es autónoma y no depende del Tailwind
// del scaffold, que va a desaparecer (`STACK.md` §1). Paleta de `DESIGN.md` §2.
const estilos: Record<string, React.CSSProperties> = {
  pagina: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    background: "linear-gradient(160deg, #FFE0D0 0%, #A8DADC 100%)",
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  },
  tarjeta: {
    width: "100%",
    maxWidth: 420,
    background: "#FFFFFF",
    borderRadius: 16,
    padding: 28,
    boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
  },
  encabezado: { display: "flex", alignItems: "center", gap: 12, marginBottom: 20 },
  titulo: { margin: 0, fontSize: 22, color: "#1D3557", fontWeight: 700 },
  datos: { margin: "0 0 20px", padding: 0 },
  fila: { display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #A8DADC" },
  etiqueta: { margin: 0, color: "#457B9D", fontSize: 14 },
  valor: { margin: 0, color: "#1D3557", fontWeight: 600 },
  boton: {
    width: "100%",
    padding: "14px 20px",
    fontSize: 16,
    fontWeight: 600,
    color: "#FFFFFF",
    background: "#FF6B35",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
  },
  cuenta: { color: "#457B9D", fontSize: 14, textAlign: "center" as const },
  nota: { color: "#457B9D", fontSize: 13, marginTop: 12, marginBottom: 0, textAlign: "center" as const },
  aviso: { color: "#E5533D", background: "#FFE0D0", padding: 12, borderRadius: 8, margin: 0 },
  error: { color: "#E5533D", background: "#FFE0D0", padding: 12, borderRadius: 8, marginTop: 16, fontSize: 14 },
  exito: { color: "#1D3557", background: "#A8DADC", padding: 16, borderRadius: 8, textAlign: "center" as const },
  enlace: { display: "block", color: "#457B9D", margin: "8px 0" },
};
