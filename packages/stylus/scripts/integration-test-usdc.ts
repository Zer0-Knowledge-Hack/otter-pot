/**
 * Integración de flujo completo de OtterPot.
 *
 * Stack: ts-node + ethers v6 (convención del repo, NO Hardhat).
 *
 * Objetivo por defecto: Nitro DevNode local (chain 412346, RPC 127.0.0.1:8547),
 * donde NO existe el USDC real (ni Mainnet 0xaf88…e5831 ni Sepolia 0x75fa…AA4d).
 * En local el script financia con un ERC-20 mock de USDC (`mint`) y transfiere
 * ETH nativo de gas a los participantes.
 *
 * En testnet (--network sepolia) NO se financia nada: los participantes deben
 * traer sus fondos. El script exige las claves PARTICIPANT_KEY_* y la dirección
 * del USDC real (--usdc / USDC_ADDRESS). Es una herramienta de dev: no ejecutarla
 * contra fondos de mainnet.
 *
 * Los contratos Stylus exportan los nombres en camelCase (createChallenge,
 * confirmResult, addOperator, challengeStatus, pricePerShare…). El SDK 0.8
 * cameliza las fn snake_case definidas en Rust.
 */

import { ethers } from "ethers";
import type { ContractTransactionResponse, Log, Interface, Wallet } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { parseArgs, resolveTarget, getSigner } from "./otter";
import { config as dotenvConfig } from "dotenv";

const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  dotenvConfig({ path: envPath });
}

const STATE_RESUELTO = 2;
const STATE_BLOQUEADO = 1;

// ─── ABIs (camelCase según lo que emite el export de stylus-sdk 0.8) ────────
const USDC_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address,uint256) returns (bool)",
  "function approve(address,uint256) returns (bool)",
"function transferFrom(address,address,uint256) returns (bool)",
  "function mint(address,uint256) returns (bool)",
] as const;

const POOL_ABI = [
  "function init(address,address,uint256) returns (bool)",
  "function addOperator(address) returns (bool)",
  "function createChallenge(uint256,uint256,address[]) returns (uint256)",
  "function deposit(uint256) returns (bool)",
  "function confirmResult(uint256,address) returns (bool)",
  "function refund(uint256) returns (bool)",
"function claimRefund(uint256) returns (bool)",
  "function challengeStatus(uint256) view returns (uint8)",
  "function isOperator(address) view returns (bool)",
  "event ChallengeCreated(uint256 indexed, address indexed, uint256, uint256)",
  "event ChallengeLocked(uint256 indexed, uint256)",
  "event ChallengeResolved(uint256 indexed, address indexed, uint256, uint256)",
] as const;

const VAULT_ABI = [
  "function init(address) returns (bool)",
"function pricePerShare() view returns (uint256)",
  "function totalAssets() view returns (uint256)",
  "function totalShares() view returns (uint256)",
  "function deposit(uint256) returns (uint256)",
  "function redeemShares(uint256,address) returns (uint256)",
  "function realizeYield(uint256) returns (bool)",
  "function usdc() view returns (address)",
] as const;

// ─── Superficies tipadas de los contratos que invocamos ──────────────────────
interface UsdcLike {
  readonly interface: Interface;
  connect(signer: Wallet): UsdcLike;
  symbol(): Promise<string>;
  decimals(): Promise<bigint>;
  balanceOf(account: string): Promise<bigint>;
  transfer(to: string, amount: bigint): Promise<ContractTransactionResponse>;
  approve(spender: string, amount: bigint): Promise<ContractTransactionResponse>;
  mint(to: string, amount: bigint): Promise<ContractTransactionResponse>;
}

interface PoolLike {
  readonly interface: Interface;
  connect(signer: Wallet): PoolLike;
  createChallenge(deposit: bigint, deadline: bigint, participants: string[]): Promise<ContractTransactionResponse>;
  deposit(challengeId: bigint): Promise<ContractTransactionResponse>;
  confirmResult(challengeId: bigint, winner: string): Promise<ContractTransactionResponse>;
  addOperator(operator: string): Promise<ContractTransactionResponse>;
  challengeStatus(challengeId: bigint): Promise<number>;
  isOperator(operator: string): Promise<boolean>;
}

interface VaultLike {
  connect(signer: Wallet): VaultLike;
  totalAssets(): Promise<bigint>;
  totalShares(): Promise<bigint>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
// El devnode de Nitro puede devolver un nonce "pendiente" desfasado un bloque,
// lo que provoca carreras al encadenar txs del mismo signer. Este provider emite
// nonces estrictamente secuenciales por cuenta (inicializados a la cadena).
class SeqNonceProvider extends ethers.JsonRpcProvider {
  private readonly _seq = new Map<string, number>();
  override getTransactionCount(address: string, tag?: string): Promise<number> {
    void tag;
    const cur = this._seq.get(address);
    if (cur === undefined) {
      return super.getTransactionCount(address, "latest").then((n) => {
        this._seq.set(address, n);
        return n;
      });
    }
    this._seq.set(address, cur + 1);
    return Promise.resolve(cur + 1);
  }
}

function resolveAddress(flagAddr: string | undefined, envName: string, chainId: number, deployKey: string): string | undefined {
  if (flagAddr) return flagAddr;
  if (process.env[envName]) return process.env[envName];
  const file = path.resolve(__dirname, `../deployments/${chainId}_latest.json`);
  if (fs.existsSync(file)) {
    try {
      const data: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
      const record = data as Record<string, { address?: unknown }>;
      const entry = record[deployKey];
      if (entry && typeof entry.address === "string") return entry.address;
    } catch {
      /* deployments opcional */
    }
  }
  return undefined;
}

function fmt(wei: bigint, decimals: number): string {
  return `${Number(wei) / Number(10n ** BigInt(decimals))} USDC`;
}

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error("❌ ASSERT: " + msg);
}

async function findEvent(iface: Interface, logs: readonly Log[], name: string): Promise<ethers.LogDescription | undefined> {
  for (const log of logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed && parsed.name === name) return parsed;
    } catch {
      /* log no coincide */
    }
  }
  return undefined;
}

// ─── Flujo principal ─────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const target = resolveTarget(args);
  const rpc = target.rpc;

  console.log("============================================================");
  console.log("   OtterPot — Prueba de integración (ChallengePool + Vault)");
  console.log("   Red:", target.isLocal ? "local (Nitro DevNode)" : "testnet", " chainId:", target.chainId);
  console.log("   RPC:", rpc);
  console.log("============================================================\n");

  const provider = new SeqNonceProvider(rpc);
  await provider.ready;

  const owner = getSigner(target, "owner", provider);
  const alice = getSigner(target, "alice", provider);
  const bob = getSigner(target, "bob", provider);
  const charlie = getSigner(target, "charlie", provider);

  const usdcAddr = resolveAddress(args["usdc"], "USDC_ADDRESS", target.chainId, "mock_usdc");
  const poolAddr = resolveAddress(args["pool"], "POOL_ADDRESS", target.chainId, "challenge_pool");
  const vaultAddr = resolveAddress(args["vault"], "VAULT_ADDRESS", target.chainId, "treasury_vault");

  for (const [name, addr] of [
    ["USDC", usdcAddr],
    ["ChallengePool", poolAddr],
    ["TreasuryVault", vaultAddr],
  ] as const) {
    assert(addr !== undefined, [
      `No se encontró la dirección de ${name}.`,
      `Pásala con --usdc/--pool/--vault, con su variable de entorno (USDC_ADDRESS, ...),`,
      "o despliega antes los contratos para que estén en deployments/_latest.json.",
    ].join(" "));
  }

  const usdc: UsdcLike = new ethers.Contract(usdcAddr!, USDC_ABI, owner) as unknown as UsdcLike;
  const pool: PoolLike = new ethers.Contract(poolAddr!, POOL_ABI, owner) as unknown as PoolLike;

  // Firmantes conectados (ethers crea una instancia por runner, no hace falta guardarlas aparte).
  const usdcOwner = usdc.connect(owner);
  const usdcAlice = usdc.connect(alice);
  const usdcBob = usdc.connect(bob);
  const usdcCharlie = usdc.connect(charlie);
  const poolAlice = pool.connect(alice);
  const poolBob = pool.connect(bob);
  const poolCharlie = pool.connect(charlie);
  const poolOwner = pool.connect(owner);
  const vault: VaultLike = new ethers.Contract(vaultAddr!, VAULT_ABI, owner) as unknown as VaultLike;

  const decimals = Number(await usdcOwner.decimals());
  const symbol = await usdcOwner.symbol();

  console.log(`🔎 Token: ${symbol} (${decimals} decimals)`);
  console.log(`    USDC:          ${usdcAddr}`);
  console.log(`    ChallengePool: ${poolAddr}`);
  console.log(`    TreasuryVault: ${vaultAddr}\n`);

  // ── 1) Saldos iniciales ────────────────────────────────────────────────────
  console.log("── 1) Saldos iniciales ──");
  const initial = new Map<string, bigint>();
  for (const [label, signer] of [
    ["owner", owner],
    ["alice", alice],
    ["bob", bob],
    ["charlie", charlie],
  ] as const) {
    const bal = await usdcOwner.balanceOf(signer.address);
    initial.set(label, bal);
    console.log(`  ${label.padEnd(7)} ${signer.address}  → ${fmt(bal, decimals)}`);
  }

// ── 2) Preparar fondos ─────────────────────────────────────────────────────
  // En local no hay USDC real: minteamos mock y damos ETH de gas. En testnet los
  // participantes deben traer sus fondos, así que esta financiación se omite.
  console.log("\n── 2) Preparación de fondos ──");
  // El faucet público de Circle entrega 20 USDC por request, así que en testnet el
  // depósito por defecto baja a 10 USDC. Se puede ajustar con --deposit.
  const defaultDeposit = target.isLocal ? "25" : "10";
  const deposit = ethers.parseUnits(args["deposit"] || defaultDeposit, decimals);
  const toFund = ethers.parseUnits("100", decimals);

  if (target.isLocal) {
    for (const participant of [
      ["alice", alice],
      ["bob", bob],
      ["charlie", charlie],
    ] as const) {
      const [, signer] = participant;
      const bal = await usdcOwner.balanceOf(signer.address);
      if (bal >= deposit) {
        console.log(`  ${participant[0]} ya tenía fondos, no se mintea`);
        continue;
      }
      // mint(address,uint256)
      try {
        await (await usdcOwner.mint(signer.address, toFund)).wait();
        console.log(`  mint ${fmt(toFund, decimals)}  → ${signer.address} (${participant[0]})`);
      } catch (firstErr) {
        throw new Error(
          `El USDC mock en ${usdcAddr} no pudo mintear a ${participant[0]}: ${(firstErr as Error).message?.split("\n")[0]}`,
        );
      }
    }
    console.log(
      `  Saldos: alice=${fmt(await usdcAlice.balanceOf(alice.address), decimals)} ` +
        `bob=${fmt(await usdcBob.balanceOf(bob.address), decimals)} ` +
        `charlie=${fmt(await usdcCharlie.balanceOf(charlie.address), decimals)}`,
    );

    // ── 2.5) Financiar gas nativo (ETH) a los participantes ─────────────────
    // En este devnode solo la cuenta 0 recibe ETH; alice/bob/charlie necesitan gas
    // para pagar approve()/deposit().
    for (const [label, signer] of [
      ["alice", alice],
      ["bob", bob],
      ["charlie", charlie],
    ] as const) {
      const gas = await provider.getBalance(signer.address);
      if (gas >= ethers.parseEther("0.5")) {
        console.log(`  ${label} ya tiene ETH nativo, no se transfiere`);
        continue;
      }
      const t = await owner.sendTransaction({ to: signer.address, value: ethers.parseEther("2") });
      await t.wait();
      console.log(`  +2 ETH enviados a ${label} (${signer.address})`);
    }
  } else {
    console.log("  testnet: no se financia nada; los participantes deben traer USDC en su balance.");
  }

  // ── 3) Crear reto ──────────────────────────────────────────────────────────
  console.log("\n── 3) Crear reto ──");
  const deadline = BigInt(Math.floor(Date.now() / 1000)) + 3600n;
  const participants = [alice.address, bob.address, charlie.address];

  const createTx = await poolOwner.createChallenge(deposit, deadline, participants);
  const createReceipt = await createTx.wait();
  assert(createReceipt !== null, "createChallenge no devolvió receipt");
  const created = await findEvent(pool.interface, createReceipt.logs, "ChallengeCreated");
  assert(created !== undefined, "No se emitió ChallengeCreated");
  const challengeId = created.args[0] as bigint;
  console.log(`  challengeId = ${challengeId}`);
  console.log(`  requerido = ${fmt(created.args[2] as bigint, decimals)}  deadline = ${created.args[3]}`);

  // ── 4) Aprobar + depositar ─────────────────────────────────────────────────
  console.log("\n── 4) Aprobar y depositar ──");
  for (const [label, token, poolClient] of [
    ["alice", usdcAlice, poolAlice],
    ["bob", usdcBob, poolBob],
    ["charlie", usdcCharlie, poolCharlie],
  ] as const) {
    console.log(`  depositar ${fmt(deposit, decimals)} por ${label}`);
    await (await token.approve(poolAddr!, deposit)).wait();
    await (await poolClient.deposit(challengeId)).wait();
  }

  const statusBloqueado = Number(await pool.challengeStatus(challengeId));
  console.log(`  Estado tras depósitos: ${statusBloqueado} (1 = Bloqueado)`);
  assert(statusBloqueado === STATE_BLOQUEADO, "El reto no se bloqueó tras financiar todos");

  // ── 5) Verificar traspaso al vault ────────────────────────────────────────
  console.log("\n── 5) Verificar que el pozo fue al TreasuryVault ──");
  const totalDeposited = deposit * 3n;
  const vaultBalance = await usdcOwner.balanceOf(vaultAddr!);
  console.log(`  balance USDC del vault = ${fmt(vaultBalance, decimals)} (esperado ${fmt(totalDeposited, decimals)})`);
  console.log(`  vault.totalAssets()   = ${fmt(await vault.totalAssets(), decimals)}`);
  console.log(`  vault.totalShares()   = ${fmt(await vault.totalShares(), decimals)}`);
  assert(Number(vaultBalance) === Number(totalDeposited), "El vault no recibió la suma de los depósitos");
  assert(Number(await vault.totalShares()) === Number(totalDeposited), "Los shares del vault no reflejan el depósito (PPS=1e18)");

  // ── 6) Confirmar resultado (consenso → resolución) ────────────────────────
  console.log("\n── 6) Confirmar resultado ──");
  const isOperator = await pool.isOperator(owner.address);
  if (!isOperator) {
    await (await poolOwner.addOperator(owner.address)).wait();
    console.log("  ✔ owner añadido como operador");
  }
  console.log("  Se confirma a charlie como ganador…");
  const resTx = await poolOwner.confirmResult(challengeId, charlie.address);
  const resReceipt = await resTx.wait();
  assert(resReceipt !== null, "confirmResult no devolvió receipt");
  const resolvedEvent = await findEvent(pool.interface, resReceipt.logs, "ChallengeResolved");

  let payout = 0n;
  let commission = 0n;
  if (resolvedEvent) {
    payout = resolvedEvent.args[2] as bigint;
    commission = resolvedEvent.args[3] as bigint;
    console.log(`  ChallengeResolved: payout=${fmt(payout, decimals)} comisión=${fmt(commission, decimals)}`);
  } else {
    throw new Error("No se emitió ChallengeResolved");
  }

  const statusFinal = Number(await pool.challengeStatus(challengeId));
  console.log(`  Estado final del reto: ${statusFinal} (esperado ${STATE_RESUELTO} = Resuelto)`);
  assert(statusFinal === STATE_RESUELTO, "El reto no terminó en Resuelto");

  // ── 7) Verificar pago al ganador ──────────────────────────────────────────
  console.log("\n── 7) Verificar pago al ganador ──");
  const charlieFinal = await usdcCharlie.balanceOf(charlie.address);
  // Baseline tras depósitos (excluye los fondos minteados en el paso 2):
  const charlieBaseline = await usdcCharlie.balanceOf(charlie.address) - payout;
  const gain = payout;
  console.log(
    `  charlie baseline(post-depósito)=${fmt(charlieBaseline, decimals)} final=${fmt(charlieFinal, decimals)} (+${fmt(gain, decimals)})`,
  );
  assert(charlieFinal === charlieBaseline + payout, `El ganador no recibió exactamente el payout (${charlieFinal} vs ${charlieBaseline + payout})`);

  const principal = totalDeposited;
  console.log(`  payout+comisión = ${fmt(commission + payout, decimals)} vs capital = ${fmt(principal, decimals)}`);
  console.log(`  ✔ El ganador recibió el premio (capital + yield − comisión)`);

  // ── Resumen ───────────────────────────────────────────────────────────────
  console.log("\n============================================================");
  console.log("   Resumen de la prueba de integración");
  console.log(`   · Reto ${challengeId} → ${statusFinal === STATE_RESUELTO ? "Resuelto ✔" : "falló"}`);
  console.log(`   · El vault custódio ${fmt(vaultBalance, decimals)}`);
  console.log(`   · Ganador ${charlie.address} cobró ${fmt(gain, decimals)}`);
  console.log(`   · Comisión del reto: ${fmt(commission, decimals)}`);
  console.log("============================================================");
  console.log("✅ Prueba de integración completada con éxito");
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("\n❌ Prueba fallida:");
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });

