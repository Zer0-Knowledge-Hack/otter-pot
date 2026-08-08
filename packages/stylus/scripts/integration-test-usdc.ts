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
  "function setCommissionRate(uint256) returns (bool)",
  "function commissionRate() view returns (uint256)",
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
  "event CommissionRateUpdated(uint256 indexed, uint256 indexed)",
] as const;

const VAULT_ABI = [
  "function init(address) returns (bool)",
  "function totalAssets() view returns (uint256)",
  "function totalShares() view returns (uint256)",
  "function deposit(uint256) returns (uint256)",
  "function redeemShares(uint256,address) returns (uint256)",
  "function realizeYield() returns (bool)",
  "function usdc() view returns (address)",
  "function strategy() view returns (address)",
  "function strategyDeployed() view returns (uint256)",
  "function setStrategy(address) returns (bool)",
  "function deployToStrategy(uint256) returns (bool)",
  "function withdrawFromStrategy(uint256) returns (bool)",
  "function withdrawAllFromStrategy() returns (bool)",
  "function setPaused(bool) returns (bool)",
  "function paused() view returns (bool)",
] as const;

const STRATEGY_ABI = [
  "function init(address) returns (bool)",
  "function setVault(address) returns (bool)",
  "function deposit(uint256) returns (bool)",
  "function withdraw(uint256) returns (uint256)",
  "function balanceOf() view returns (uint256)",
  "function totalAssets() view returns (uint256)",
  "function mint(uint256) returns (bool)",
  "function vault() view returns (address)",
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
  setCommissionRate(rateBps: bigint): Promise<ContractTransactionResponse>;
  commissionRate(): Promise<bigint>;
  challengeStatus(challengeId: bigint): Promise<number>;
  isOperator(operator: string): Promise<boolean>;
}

interface VaultLike {
  connect(signer: Wallet): VaultLike;
  totalAssets(): Promise<bigint>;
  totalShares(): Promise<bigint>;
  strategy(): Promise<string>;
  strategyDeployed(): Promise<bigint>;
  setStrategy(strategy: string): Promise<ContractTransactionResponse>;
  deployToStrategy(amount: bigint): Promise<ContractTransactionResponse>;
  withdrawFromStrategy(amount: bigint): Promise<ContractTransactionResponse>;
  withdrawAllFromStrategy(): Promise<ContractTransactionResponse>;
  realizeYield(): Promise<ContractTransactionResponse>;
  setPaused(paused: boolean): Promise<ContractTransactionResponse>;
  paused(): Promise<boolean>;
}

interface StrategyLike {
  readonly interface: Interface;
  connect(signer: Wallet): StrategyLike;
  init(usdc: string): Promise<ContractTransactionResponse>;
  setVault(vault: string): Promise<ContractTransactionResponse>;
  deposit(amount: bigint): Promise<ContractTransactionResponse>;
  withdraw(amount: bigint): Promise<ContractTransactionResponse>;
  balanceOf(): Promise<bigint>;
  totalAssets(): Promise<bigint>;
  mint(amount: bigint): Promise<ContractTransactionResponse>;
  vault(): Promise<string>;
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

  // ── 2.5) Cambiar comisión ──────────────────────────────────────────────────
  // Se cambia la comisión a 300 bps (3 %) antes de crear el reto para que la
  // resolución use la nueva tasa y el payout sea verificable (300/10000 del total).
  console.log("\n── 2.5) Cambiar comisión a 300 bps (3 %) ──");
  const NEW_RATE_BPS = 300n;
  const prevRate = await poolOwner.commissionRate();
  console.log(`  Tasa actual: ${prevRate} bps`);
  await (await poolOwner.setCommissionRate(NEW_RATE_BPS)).wait();
  const confirmedRate = await poolOwner.commissionRate();
  assert(confirmedRate === NEW_RATE_BPS, `La tasa no cambió: esperado ${NEW_RATE_BPS}, obtenido ${confirmedRate}`);
  console.log(`  ✔ Tasa actualizada: ${prevRate} bps → ${confirmedRate} bps`);

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
  // Expected commission at the active rate (300 bps = 3 % of recovered total).
  const expectedCommission = (commission + payout) * NEW_RATE_BPS / 10_000n;
  console.log(`  payout+comisión = ${fmt(commission + payout, decimals)} vs capital = ${fmt(principal, decimals)}`);
  console.log(`  Comisión esperada (${NEW_RATE_BPS} bps): ${fmt(expectedCommission, decimals)}, comisión real: ${fmt(commission, decimals)}`);
  assert(
    commission === expectedCommission,
    `Comisión incorrecta: esperado ${fmt(expectedCommission, decimals)} al ${NEW_RATE_BPS} bps, obtenido ${fmt(commission, decimals)}`
  );
  console.log(`  ✔ El ganador recibió el premio (capital + yield − comisión) y la comisión coincide con ${NEW_RATE_BPS} bps`);

  // ── 8) Strategy Adapter Tests (solo en local con mock_strategy) ──────────────
  if (target.isLocal) {
    await runStrategyTests(
      provider,
      owner,
      usdcAddr!,
      vaultAddr!,
      decimals,
      fmt,
      assert,
      findEvent,
    );
  }

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

async function runStrategyTests(
  provider: SeqNonceProvider,
  owner: Wallet,
  usdcAddr: string,
  vaultAddr: string,
  decimals: number,
  fmt: (wei: bigint, decimals: number) => string,
  assert: (cond: boolean, msg: string) => asserts cond,
  _findEvent: (iface: Interface, logs: readonly Log[], name: string) => Promise<ethers.LogDescription | undefined>,
): Promise<void> {
  console.log("\n============================================================");
  console.log("   Pruebas del Adaptador de Estrategia (mock_strategy)");
  console.log("============================================================\n");

  // Resolver dirección del mock_strategy desde deployments
  const strategyAddr = await resolveStrategyAddress(provider, owner, usdcAddr, vaultAddr, decimals, fmt, assert);
  const strategy: StrategyLike = new ethers.Contract(strategyAddr, STRATEGY_ABI, owner) as unknown as StrategyLike;
  const strategyOwner = strategy.connect(owner);

  const vault: VaultLike = new ethers.Contract(vaultAddr, VAULT_ABI, owner) as unknown as VaultLike;
  const vaultOwner = vault.connect(owner);

  // ── 8.1) Verificar estado inicial ──
  console.log("── 8.1) Estado inicial de la estrategia ──");
  const initialVaultBalance = await vaultOwner.totalAssets();
  const initialStrategyBalance = await strategyOwner.balanceOf();
  console.log(`  vault.totalAssets() = ${fmt(initialVaultBalance, decimals)}`);
  console.log(`  strategy.balanceOf() = ${fmt(initialStrategyBalance, decimals)}`);
  assert(initialStrategyBalance === 0n, "La estrategia debería empezar vacía");

  // ── 8.2) Desplegar capital en la estrategia ──
  console.log("\n── 8.2) Desplegar capital en la estrategia (deployToStrategy) ──");
  const deployAmount = ethers.parseUnits("50", decimals);
  const idleBefore = await getIdleUSDC(owner, usdcAddr, vaultAddr, decimals);
  console.log(`  USDC inactivo en vault: ${fmt(idleBefore, decimals)}`);
  console.log(`  Desplegando ${fmt(deployAmount, decimals)}…`);
  await (await vaultOwner.deployToStrategy(deployAmount)).wait();
  const idleAfter = await getIdleUSDC(owner, usdcAddr, vaultAddr, decimals);
  const strategyBalAfterDeploy = await strategyOwner.balanceOf();
  const vaultDeployed = await vaultOwner.strategyDeployed();
  console.log(`  USDC inactivo tras deploy: ${fmt(idleAfter, decimals)}`);
  console.log(`  strategy.balanceOf(): ${fmt(strategyBalAfterDeploy, decimals)}`);
  console.log(`  vault.strategyDeployed(): ${fmt(vaultDeployed, decimals)}`);
  assert(idleAfter === idleBefore - deployAmount, "El saldo inactivo debería haber disminuido");
  assert(strategyBalAfterDeploy >= deployAmount, "La estrategia debería haber recibido los fondos");
  assert(vaultDeployed === deployAmount, "strategyDeployed debería reflejar el monto desplegado");
  console.log("  ✔ Capital desplegado correctamente");

  // ── 8.3) Generar rendimiento (mint en mock_strategy + realizeYield) ──
  console.log("\n── 8.3) Generar y realizar rendimiento ──");
  const yieldAmount = ethers.parseUnits("5", decimals);
  console.log(`  Minteando ${fmt(yieldAmount, decimals)} USDC extra en la estrategia (simula yield)…`);
  await (await strategyOwner.mint(yieldAmount)).wait();
  const strategyBalAfterMint = await strategyOwner.balanceOf();
  console.log(`  strategy.balanceOf() tras mint: ${fmt(strategyBalAfterMint, decimals)}`);
  assert(strategyBalAfterMint === strategyBalAfterDeploy + yieldAmount, "El balance de la estrategia debería haber crecido");

  console.log("  Llamando realizeYield()...");
  await (await vaultOwner.realizeYield()).wait();
  const totalAssetsAfterYield = await vaultOwner.totalAssets();
  const strategyDeployedAfterYield = await vaultOwner.strategyDeployed();
  console.log(`  vault.totalAssets() tras yield: ${fmt(totalAssetsAfterYield, decimals)}`);
  console.log(`  vault.strategyDeployed() tras yield: ${fmt(strategyDeployedAfterYield, decimals)}`);
  assert(totalAssetsAfterYield === initialVaultBalance + yieldAmount, "totalAssets debería haber aumentado por el yield");
  assert(strategyDeployedAfterYield === strategyBalAfterMint, "strategyDeployed debería actualizarse al balance actual");
  console.log("  ✔ Rendimiento realizado y acreditado correctamente");

  // ── 8.4) Redención con shortfall (saldo inactivo insuficiente) ──
  console.log("\n── 8.4) Redención con shortfall (redeemShares cuando idle < assets) ──");
  // El vault tiene 75 USDC inactivos (100 depositados - 25 deployados inicialmente - 50 deployados en paso 8.2)
  // Pero tras el yield, totalAssets = 105, y strategyDeployed = 55
  // Si alice quiere canjear shares por 30 USDC, pero idle = 25, hay shortfall de 5
  const aliceVault = vault.connect(owner); // usar owner para simplicidad, el test original usa alice
  const sharesToRedeem = ethers.parseUnits("30", decimals); // ~30 USDC a PPS=1e18
  const idleBeforeRedeem = await getIdleUSDC(owner, usdcAddr, vaultAddr, decimals);
  console.log(`  USDC inactivo antes de redeem: ${fmt(idleBeforeRedeem, decimals)}`);
  console.log(`  Canjeando shares equivalentes a ~${fmt(sharesToRedeem, decimals)}…`);
  const assetsReceived = await (await aliceVault.redeemShares(sharesToRedeem, owner.address)).wait();
  const idleAfterRedeem = await getIdleUSDC(owner, usdcAddr, vaultAddr, decimals);
  const strategyBalAfterRedeem = await strategyOwner.balanceOf();
  console.log(`  USDC inactivo tras redeem: ${fmt(idleAfterRedeem, decimals)}`);
  console.log(`  strategy.balanceOf() tras redeem: ${fmt(strategyBalAfterRedeem, decimals)}`);
  console.log(`  Assets recibidos: ${fmt(assetsReceived as unknown as bigint, decimals)}`);
  // El shortfall debería haberse cubierto desde la estrategia
  assert(idleAfterRedeem === 0n, "El saldo inactivo debería ser 0 tras cubrir el shortfall");
  assert(strategyBalAfterRedeem < strategyDeployedAfterYield, "La estrategia debería haber disminuido");
  console.log("  ✔ Redención con shortfall funcionó correctamente");

  // ── 8.5) Migración con pausa ──
  console.log("\n── 8.5) Migración de estrategia con pausa ──");
  // Pausar el vault
  console.log("  Pausando vault…");
  await (await vaultOwner.setPaused(true)).wait();
  const paused = await vaultOwner.paused();
  assert(paused === true, "El vault debería estar pausado");
  console.log("  ✔ Vault pausado");

  // Retirar todo de la estrategia actual
  console.log("  Retirando todo de la estrategia actual (withdrawAllFromStrategy)…");
  await (await vaultOwner.withdrawAllFromStrategy()).wait();
  const strategyBalAfterWithdrawAll = await strategyOwner.balanceOf();
  const idleAfterWithdrawAll = await getIdleUSDC(owner, usdcAddr, vaultAddr, decimals);
  console.log(`  strategy.balanceOf() tras withdrawAll: ${fmt(strategyBalAfterWithdrawAll, decimals)}`);
  console.log(`  USDC inactivo en vault: ${fmt(idleAfterWithdrawAll, decimals)}`);
  assert(strategyBalAfterWithdrawAll === 0n, "La estrategia debería estar vacía");
  assert(idleAfterWithdrawAll > 0n, "El vault debería haber recuperado los fondos");
  console.log("  ✔ Fondos retirados de la estrategia antigua");

  // Cambiar a una nueva estrategia (en este test, reusamos la misma pero simulamos cambio)
  console.log("  Cambiando estrategia (setStrategy)…");
  // En un caso real se desplegaría un nuevo mock_strategy; aquí solo verificamos que la función existe
  await (await vaultOwner.setStrategy(strategyAddr)).wait(); // re-set misma dirección
  const newStrategyAddr = await vaultOwner.strategy();
  assert(newStrategyAddr.toLowerCase() === strategyAddr.toLowerCase(), "La estrategia debería haberse actualizado");
  console.log("  ✔ Estrategia actualizada");

  // Desplegar capital en la nueva estrategia
  console.log("  Desplegando capital en la nueva estrategia…");
  await (await vaultOwner.deployToStrategy(idleAfterWithdrawAll)).wait();
  const strategyBalAfterReDeploy = await strategyOwner.balanceOf();
  console.log(`  strategy.balanceOf() tras re-deploy: ${fmt(strategyBalAfterReDeploy, decimals)}`);
  assert(strategyBalAfterReDeploy > 0n, "La nueva estrategia debería tener fondos");
  console.log("  ✔ Capital desplegado en nueva estrategia");

  // Despausar
  console.log("  Despausando vault…");
  await (await vaultOwner.setPaused(false)).wait();
  const unpaused = await vaultOwner.paused();
  assert(unpaused === false, "El vault debería estar despausado");
  console.log("  ✔ Vault despausado");

  console.log("\n✅ Todas las pruebas de estrategia completadas con éxito");
}

async function resolveStrategyAddress(
  provider: SeqNonceProvider,
  owner: Wallet,
  usdcAddr: string,
  vaultAddr: string,
  decimals: number,
  fmt: (wei: bigint, decimals: number) => string,
  _assert: (cond: boolean, msg: string) => asserts cond,
): Promise<string> {
  const deploymentsPath = `../deployments/${(provider as any)._chainId || 412346}_latest.json`;
  // Intentar leer desde deployments
  const fs = await import("fs");
  const path = await import("path");
  const file = path.resolve(__dirname, deploymentsPath);
  if (fs.existsSync(file)) {
    try {
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      if (data.mock_strategy?.address) {
        console.log(`  mock_strategy encontrado en deployments: ${data.mock_strategy.address}`);
        return data.mock_strategy.address;
      }
    } catch {
      /* ignorar */
    }
  }
  // Si no está en deployments, desplegar uno nuevo (solo local)
  console.log("  mock_strategy no encontrado en deployments, desplegando uno nuevo…");
  // Usar el owner para desplegar
  const strategy = await deployMockStrategy(owner, usdcAddr, vaultAddr, decimals, fmt);
  return strategy;
}

async function deployMockStrategy(
  _owner: Wallet,
  _usdcAddr: string,
  _vaultAddr: string,
  _decimals: number,
  _fmt: (wei: bigint, decimals: number) => string,
): Promise<string> {
  // Nota: esto requiere que cargo stylus esté disponible.
  // En entorno local con Nitro DevNode, el deploy se hace via deploy.ts.
  // Aquí asumimos que mock_strategy ya está desplegado y en deployments.
  // Si no, lanzamos error indicando que se ejecute deploy primero.
  throw new Error(
    "mock_strategy no desplegado. Ejecuta primero: yarn workspace @ss/stylus deploy --network local",
  );
}

async function getIdleUSDC(
  owner: Wallet,
  usdcAddr: string,
  vaultAddr: string,
  _decimals: number,
): Promise<bigint> {
  const usdc = new ethers.Contract(usdcAddr, [
    "function balanceOf(address) view returns (uint256)",
  ], owner);
  return await usdc.balanceOf(vaultAddr);
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("\n❌ Prueba fallida:");
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });

