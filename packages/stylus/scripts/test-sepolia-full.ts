/**
 * Test de integración completo en Arbitrum Sepolia con 3 wallets de prueba.
 *
 * Flujo:
 * 1. Verificar saldos USDC de los 3 participantes
 * 2. Crear reto (challenge)
 * 3. Los 3 participantes aprueban y depositan USDC
 * 4. Admin hace deployToStrategy (mueve USDC del vault a Aave)
 * 5. Espera configurable (default 5 min) para generar yield en Aave
 * 6. Admin llama realizeYield() para acreditar el yield al vault
 * 7. Admin resuelve el reto (confirmResult)
 * 8. Verificar pagos y yield generado
 *
 * Requisitos:
 * - 3 wallets con USDC en Sepolia (PARTICIPANT_KEY_ALICE, BOB, CHARLIE)
 * - Owner con PRIVATE_KEY_SEPOLIA
 * - Contratos ya desplegados (deploy.ts --network sepolia)
 *
 * Uso:
 *   yarn workspace @ss/stylus test:sepolia:full [--wait-minutes 5] [--deposit 10]
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

// ─── ABIs ──────────────────────────────────────────────────────────────────────
const USDC_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address,uint256) returns (bool)",
  "function approve(address,uint256) returns (bool)",
  "function transferFrom(address,address,uint256) returns (bool)",
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
  "function pricePerShare() view returns (uint256)",
  "event Deposit(address indexed, uint256, uint256, uint256, uint256)",
  "event Redeem(address indexed, address indexed, uint256, uint256)",
  "event YieldRealized(uint256, uint256)",
  "event StrategyDeployed(address indexed, uint256)",
  "event StrategyWithdrawn(address indexed, uint256)",
] as const;

const STRATEGY_ABI = [
  "function init(address,address,address) returns (bool)",
  "function setVault(address) returns (bool)",
  "function deposit(uint256) returns (bool)",
  "function withdraw(uint256) returns (uint256)",
  "function balanceOf() view returns (uint256)",
  "function totalAssets() view returns (uint256)",
  "function vault() view returns (address)",
] as const;

// ─── Interfaces tipadas ────────────────────────────────────────────────────────
interface UsdcLike {
  readonly interface: Interface;
  connect(signer: Wallet): UsdcLike;
  symbol(): Promise<string>;
  decimals(): Promise<bigint>;
  balanceOf(account: string): Promise<bigint>;
  transfer(to: string, amount: bigint): Promise<ContractTransactionResponse>;
  approve(spender: string, amount: bigint): Promise<ContractTransactionResponse>;
  transferFrom(from: string, to: string, amount: bigint): Promise<ContractTransactionResponse>;
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
  pricePerShare(): Promise<bigint>;
  usdc(): Promise<string>;
}

interface StrategyLike {
  readonly interface: Interface;
  connect(signer: Wallet): StrategyLike;
  balanceOf(): Promise<bigint>;
  totalAssets(): Promise<bigint>;
  deposit(amount: bigint): Promise<ContractTransactionResponse>;
  withdraw(amount: bigint): Promise<ContractTransactionResponse>;
  vault(): Promise<string>;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
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

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function printVaultState(vault: VaultLike, decimals: number, label: string): Promise<void> {
  const totalAssets = await vault.totalAssets();
  const totalShares = await vault.totalShares();
  const strategyAddr = await vault.strategy();
  const strategyDeployed = await vault.strategyDeployed();
  const pps = await vault.pricePerShare();
  
  console.log(`\n📊 ${label}`);
  console.log(`   totalAssets:     ${fmt(totalAssets, decimals)}`);
  console.log(`   totalShares:     ${fmt(totalShares, decimals)}`);
  console.log(`   pricePerShare:   ${(Number(pps) / 1e18).toFixed(6)} USDC/share`);
  console.log(`   strategy:        ${strategyAddr}`);
  console.log(`   strategyDeployed:${fmt(strategyDeployed, decimals)}`);
}

async function printStrategyState(strategy: StrategyLike, decimals: number, label: string): Promise<void> {
  const bal = await strategy.balanceOf();
  const assets = await strategy.totalAssets();
  let vaultAddr = "unknown";
  try {
    vaultAddr = await strategy.vault();
  } catch {
    // vault() might not exist in older deployments
  }
  console.log(`\n📈 ${label}`);
  console.log(`   balanceOf:       ${fmt(bal, decimals)}`);
  console.log(`   totalAssets:     ${fmt(assets, decimals)}`);
  console.log(`   vault:           ${vaultAddr}`);
}

async function printParticipantBalances(
  usdc: UsdcLike,
  participants: { label: string; address: string }[],
  decimals: number,
  label: string
): Promise<void> {
  console.log(`\n💰 ${label}`);
  for (const p of participants) {
    const bal = await usdc.balanceOf(p.address);
    console.log(`   ${p.label.padEnd(8)} ${p.address} → ${fmt(bal, decimals)}`);
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const target = resolveTarget(args);
  
  if (target.isLocal) {
    throw new Error("Este script es solo para testnet (--network sepolia). Usa integration-test-usdc.ts para local.");
  }

  const waitMinutes = Number(args["wait-minutes"] ?? "2");
  const depositAmountStr = args["deposit"] ?? "2"; // USDC por participante (máx 3)

  const rpc = target.rpc;
  console.log("============================================================");
  console.log("   OtterPot Sepolia — Test completo con yield (Aave V3)");
  console.log(`   ChainId: ${target.chainId}  RPC: ${rpc}`);
  console.log(`   Depósito por participante: ${depositAmountStr} USDC`);
  console.log(`   Tiempo de espera para yield: ${waitMinutes} min`);
  console.log("============================================================\n");

  const provider = new ethers.JsonRpcProvider(rpc);
  await provider.ready;

  // Cargar firmantes
  const owner = getSigner(target, "owner", provider);
  const alice = getSigner(target, "alice", provider);
  const bob = getSigner(target, "bob", provider);
  const charlie = getSigner(target, "charlie", provider);

  // Cargar direcciones desde deployments
  const deploymentsPath = path.resolve(__dirname, `../deployments/${target.chainId}_latest.json`);
  if (!fs.existsSync(deploymentsPath)) {
    throw new Error(`No existe ${deploymentsPath}. Ejecuta primero: yarn workspace @ss/stylus deploy --network sepolia`);
  }
  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));

  const usdcAddr = process.env["USDC_ADDRESS"] ?? "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d";
  const vaultAddr = deployments["treasury_vault"]?.address;
  const poolAddr = deployments["challenge_pool"]?.address;
  const strategyAddr = deployments["aave_strategy"]?.address;

  if (!vaultAddr || !poolAddr || !strategyAddr) {
    throw new Error("Faltan direcciones en deployments. ¿Ejecutaste deploy?");
  }

  console.log(`\n📋 Contratos:`);
  console.log(`   USDC:           ${usdcAddr}`);
  console.log(`   TreasuryVault:  ${vaultAddr}`);
  console.log(`   ChallengePool:  ${poolAddr}`);
  console.log(`   AaveStrategy:   ${strategyAddr}`);

  // Instancias de contratos
  const usdc: UsdcLike = new ethers.Contract(usdcAddr, USDC_ABI, owner) as unknown as UsdcLike;
  const pool: PoolLike = new ethers.Contract(poolAddr, POOL_ABI, owner) as unknown as PoolLike;
  const vault: VaultLike = new ethers.Contract(vaultAddr, VAULT_ABI, owner) as unknown as VaultLike;
  const strategy: StrategyLike = new ethers.Contract(strategyAddr, STRATEGY_ABI, owner) as unknown as StrategyLike;

  // Firmantes conectados
  const usdcOwner = usdc.connect(owner);
  const usdcAlice = usdc.connect(alice);
  const usdcBob = usdc.connect(bob);
  const usdcCharlie = usdc.connect(charlie);
  const poolOwner = pool.connect(owner);
  const poolAlice = pool.connect(alice);
  const poolBob = pool.connect(bob);
  const poolCharlie = pool.connect(charlie);
  const vaultOwner = vault.connect(owner);
  const strategyOwner = strategy.connect(owner);

  const decimals = Number(await usdcOwner.decimals());
  const symbol = await usdcOwner.symbol();
  const depositAmount = ethers.parseUnits(depositAmountStr, decimals);

  console.log(`\n🔎 Token: ${symbol} (${decimals} decimals)`);

  // ── 0) Verificar estado inicial ──
  console.log("\n============================================================");
  console.log("  0) ESTADO INICIAL");
  console.log("============================================================");
  
  await printParticipantBalances(usdcOwner, [
    { label: "owner", address: owner.address },
    { label: "alice", address: alice.address },
    { label: "bob", address: bob.address },
    { label: "charlie", address: charlie.address },
  ], decimals, "Saldos USDC iniciales");

  await printVaultState(vaultOwner, decimals, "Vault inicial");
  await printStrategyState(strategyOwner, decimals, "Strategy inicial");

  // Verificar que los participantes tienen fondos
  for (const p of [alice, bob, charlie]) {
    const bal = await usdcOwner.balanceOf(p.address);
    if (bal < depositAmount) {
      throw new Error(`${p.address} no tiene suficientes USDC (tiene ${fmt(bal, decimals)}, necesita ${fmt(depositAmount, decimals)})`);
    }
  }
  console.log("\n✅ Todos los participantes tienen fondos suficientes");

  // ── 1) Configurar comisión ──
  console.log("\n============================================================");
  console.log("  1) CONFIGURAR COMISIÓN (300 bps = 3%)");
  console.log("============================================================");
  const NEW_RATE_BPS = 300n;
  const prevRate = await poolOwner.commissionRate();
  console.log(`  Tasa actual: ${prevRate} bps`);
  await (await poolOwner.setCommissionRate(NEW_RATE_BPS)).wait();
  const confirmedRate = await poolOwner.commissionRate();
  assert(confirmedRate === NEW_RATE_BPS, `Tasa no cambió: esperado ${NEW_RATE_BPS}, obtenido ${confirmedRate}`);
  console.log(`  ✔ Tasa actualizada: ${prevRate} bps → ${confirmedRate} bps`);

  // ── 2) Crear reto ──
  console.log("\n============================================================");
  console.log("  2) CREAR RETO");
  console.log("============================================================");
  const deadline = BigInt(Math.floor(Date.now() / 1000)) + 3600n; // 1 hora
  const participants = [alice.address, bob.address, charlie.address];

  const createTx = await poolOwner.createChallenge(depositAmount, deadline, participants);
  const createReceipt = await createTx.wait();
  assert(createReceipt !== null, "createChallenge no devolvió receipt");
  const created = await findEvent(pool.interface, createReceipt.logs, "ChallengeCreated");
  assert(created !== undefined, "No se emitió ChallengeCreated");
  const challengeId = created.args[0] as bigint;
  console.log(`  challengeId = ${challengeId}`);
  console.log(`  Requerido = ${fmt(created.args[2] as bigint, decimals)}  Deadline = ${created.args[3]}`);

  // ── 3) Aprobar y depositar ──
  console.log("\n============================================================");
  console.log("  3) APROBAR Y DEPOSITAR (3 participantes)");
  console.log("============================================================");
  for (const [label, token, poolClient] of [
    ["alice", usdcAlice, poolAlice],
    ["bob", usdcBob, poolBob],
    ["charlie", usdcCharlie, poolCharlie],
  ] as const) {
    console.log(`  ${label}: approve + deposit ${fmt(depositAmount, decimals)}`);
    await (await token.approve(poolAddr, depositAmount)).wait();
    await (await poolClient.deposit(challengeId)).wait();
  }

  const statusBloqueado = Number(await pool.challengeStatus(challengeId));
  console.log(`  Estado tras depósitos: ${statusBloqueado} (1 = Bloqueado)`);
  assert(statusBloqueado === STATE_BLOQUEADO, "El reto no se bloqueó tras financiar todos");

  // ── 4) Verificar traspaso al vault ──
  console.log("\n============================================================");
  console.log("  4) VERIFICAR TRASPASO AL VAULT");
  console.log("============================================================");
  await printVaultState(vaultOwner, decimals, "Vault tras depósitos");
  await printStrategyState(strategyOwner, decimals, "Strategy tras depósitos (antes de deploy)");

  const totalDeposited = depositAmount * 3n;
  const vaultUsdcBalance = await usdcOwner.balanceOf(vaultAddr);
  console.log(`\n  USDC en vault (balanceOf): ${fmt(vaultUsdcBalance, decimals)} (esperado ${fmt(totalDeposited, decimals)})`);
  assert(vaultUsdcBalance >= totalDeposited, "El vault no recibió la suma de los depósitos");

  // ── 5) Deploy a estrategia (Aave) ──
  console.log("\n============================================================");
  console.log("  5) DEPLOY A ESTRATEGIA (vault → Aave V3)");
  console.log("============================================================");
  console.log(`  Desplegando ${fmt(totalDeposited, decimals)} USDC a la estrategia...`);
  
  await printVaultState(vaultOwner, decimals, "Vault ANTES de deployToStrategy");
  
  const deployTx = await vaultOwner.deployToStrategy(totalDeposited);
  await deployTx.wait();
  console.log("  ✔ deployToStrategy completado");

  await printVaultState(vaultOwner, decimals, "Vault DESPUÉS de deployToStrategy");
  await printStrategyState(strategyOwner, decimals, "Strategy DESPUÉS de deployToStrategy");

  const strategyBalAfterDeploy = await strategyOwner.balanceOf();
  const vaultDeployed = await vaultOwner.strategyDeployed();
  assert(strategyBalAfterDeploy >= totalDeposited, "La estrategia debería haber recibido los fondos");
  assert(vaultDeployed === totalDeposited, "strategyDeployed debería reflejar el monto desplegado");
  console.log("  ✔ Capital desplegado correctamente en Aave V3");

  // ── 6) Esperar para generar yield ──
  console.log("\n============================================================");
  console.log(`  6) ESPERANDO ${waitMinutes} MINUTOS PARA GENERAR YIELD EN AAVE`);
  console.log("============================================================");
  console.log("  (El yield se acumula en aUSDC dentro del pool de Aave)");
  console.log("  Puedes verificar en Arbiscan: https://sepolia.arbiscan.io/address/" + strategyAddr);
  
  const waitMs = waitMinutes * 60 * 1000;
  const startWait = Date.now();
  
  // Mostrar progreso cada 30 segundos
  const progressInterval = setInterval(async () => {
    const elapsed = Math.floor((Date.now() - startWait) / 1000);
    const remaining = Math.floor(waitMs / 1000) - elapsed;
    if (remaining > 0) {
      const strategyBal = await strategyOwner.balanceOf();
      console.log(`  ⏳ ${elapsed}s transcurridos, ${remaining}s restantes | Strategy balanceOf: ${fmt(strategyBal, decimals)}`);
    }
  }, 30000);

  await sleep(waitMs);
  clearInterval(progressInterval);

  console.log(`\n  ✅ Espera completada (${waitMinutes} min)`);
  
  const strategyBalAfterWait = await strategyOwner.balanceOf();
  console.log(`  Strategy balanceOf tras espera: ${fmt(strategyBalAfterWait, decimals)}`);
  const yieldGenerated = strategyBalAfterWait - totalDeposited;
  console.log(`  Yield generado en Aave: ${fmt(yieldGenerated, decimals)}`);

  // ── 7) Realizar yield (acreditar al vault) ──
  console.log("\n============================================================");
  console.log("  7) REALIZAR YIELD (realizeYield)");
  console.log("============================================================");
  
  await printVaultState(vaultOwner, decimals, "Vault ANTES de realizeYield");
  
  const realizeTx = await vaultOwner.realizeYield();
  await realizeTx.wait();
  console.log("  ✔ realizeYield completado");

  await printVaultState(vaultOwner, decimals, "Vault DESPUÉS de realizeYield");
  await printStrategyState(strategyOwner, decimals, "Strategy DESPUÉS de realizeYield");

  const totalAssetsAfterYield = await vaultOwner.totalAssets();
  const strategyDeployedAfterYield = await vaultOwner.strategyDeployed();
  const yieldCredited = totalAssetsAfterYield - totalDeposited;
  console.log(`\n  Yield acreditado al vault: ${fmt(yieldCredited, decimals)}`);
  console.log(`  strategyDeployed actualizado: ${fmt(strategyDeployedAfterYield, decimals)}`);
  assert(yieldCredited >= 0n, "El yield acreditado no debería ser negativo");

  // ── 8) Resolver reto (confirmar ganador) ──
  console.log("\n============================================================");
  console.log("  8) RESOLVER RETO (confirmResult → charlie gana)");
  console.log("============================================================");
  
  // Asegurar que owner es operador
  const isOperator = await pool.isOperator(owner.address);
  if (!isOperator) {
    await (await poolOwner.addOperator(owner.address)).wait();
    console.log("  ✔ owner añadido como operador");
  }

  console.log("  Confirmando a charlie como ganador...");
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

  // ── 9) Verificar pagos finales ──
  console.log("\n============================================================");
  console.log("  9) VERIFICACIÓN FINAL");
  console.log("============================================================");
  
  await printParticipantBalances(usdcOwner, [
    { label: "owner", address: owner.address },
    { label: "alice", address: alice.address },
    { label: "bob", address: bob.address },
    { label: "charlie", address: charlie.address },
  ], decimals, "Saldos USDC FINALES");

  await printVaultState(vaultOwner, decimals, "Vault FINAL");
  await printStrategyState(strategyOwner, decimals, "Strategy FINAL");

  // Verificar que charlie recibió el payout
  console.log(`\n  🎯 Ganador (charlie): ${fmt(payout, decimals)} recibidos`);
  console.log(`  🏦 Comisión del pool: ${fmt(commission, decimals)}`);

  // Verificar comisión esperada
  const expectedCommission = (commission + payout) * NEW_RATE_BPS / 10_000n;
  console.log(`  Comisión esperada (${NEW_RATE_BPS} bps): ${fmt(expectedCommission, decimals)}`);
  console.log(`  Comisión real: ${fmt(commission, decimals)}`);

  // Resumen de yield
  console.log("\n============================================================");
  console.log("  RESUMEN DE YIELD");
  console.log("============================================================");
  console.log(`  Depósito total:          ${fmt(totalDeposited, decimals)}`);
  console.log(`  Yield generado en Aave:  ${fmt(yieldGenerated, decimals)}`);
  console.log(`  Yield acreditado al vault: ${fmt(yieldCredited, decimals)}`);
  console.log(`  Total assets final:      ${fmt(totalAssetsAfterYield, decimals)}`);
  console.log(`  Payout al ganador:       ${fmt(payout, decimals)}`);
  console.log(`  Comisión:                ${fmt(commission, decimals)}`);
  console.log(`  Neto para ganador:       ${fmt(payout - commission, decimals)}`);

  console.log("\n============================================================");
  console.log("✅ TEST COMPLETO FINALIZADO CON ÉXITO");
  console.log("============================================================\n");
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("\n❌ Test fallido:");
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });