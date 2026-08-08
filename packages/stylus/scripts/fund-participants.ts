/**
 * Financia a los participantes de test (alice, bob, charlie) para la red de
 * destino:
 *   1. ETH (gas) — se transfiere desde el owner (cuenta que desplegó).
 *   2. USDC — si el owner tiene saldo suficiente para todos, se transfiere desde el
 *      owner. Si no, se muestran instrucciones para pedir el USDC de prueba en el
 *      faucet público de Circle (https://faucet.circle.com) para cada dirección y
 *      se sondea la cadena hasta que lleguen los fondos (o se agote el timeout).
 *
 * Uso:
 *   npm run participants:fund -- [--network sepolia]
 *     [--usdc <monto>] [--eth <monto>] [--wait-minutes <min>]
 *
 * Nota: el faucet público de Circle requiere un reCAPTCHA y no se puede automatizar;
 * este script guía el trámite manual y verifica el saldo on-chain.
 */

import * as path from "path";
import * as fs from "fs";
import { config as dotenvConfig } from "dotenv";

const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  dotenvConfig({ path: envPath });
}

import { ethers } from "ethers";
import type {
  ContractTransactionResponse,
  Interface,
  JsonRpcProvider,
  Wallet,
} from "ethers";
import {
  getSigner,
  loadParticipants,
  parseArgs,
  resolveTarget,
} from "./otter";

const USDC_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address,uint256) returns (bool)",
  "function decimals() view returns (uint8)",
] as const;

interface UsdcLike {
  readonly interface: Interface;
  connect(signer: Wallet): UsdcLike;
  decimals(): Promise<bigint>;
  balanceOf(account: string): Promise<bigint>;
  transfer(to: string, amount: bigint): Promise<ContractTransactionResponse>;
}

const LABELS = ["alice", "bob", "charlie"];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const target = resolveTarget(args);

  const usdcAddr = process.env["USDC_ADDRESS"] || args["usdc-addr"];
  if (!usdcAddr) {
    throw new Error("Falta USDC_ADDRESS en el entorno o --usdc-addr");
  }

  const usdcAmount = ethers.parseUnits(args["usdc"] || "2", 6);
  const ethAmount = ethers.parseEther(args["eth"] || "0.004");
  const waitMinutes = Number(args["wait-minutes"] || "5");

  const provider: JsonRpcProvider = new ethers.JsonRpcProvider(target.rpc);
  const owner = getSigner(target, "owner", provider);
  const usdc: UsdcLike = new ethers.Contract(usdcAddr, USDC_ABI, owner) as unknown as UsdcLike;
  const decimals = Number(await usdc.decimals());

  const rec = loadParticipants(target.chainId);
  if (!rec) {
    throw new Error(
      `No hay participantes en deployments/${target.chainId}_participants.json. ` +
        "Ejecuta primero participants:create"
    );
  }

  const participants: Wallet[] = LABELS.map((label) => {
    const pk = rec[label]?.privateKey;
    if (!pk)
      throw new Error(`Falta la clave privada de "${label}" en el archivo de participantes`);
    return new ethers.Wallet(pk, provider);
  });

  console.log(`\nFinanciando red ${target.chainId} (${target.rpc})`);
  console.log(`  owner: ${owner.address}`);
  console.log(`  USDC : ${usdcAddr}`);
  console.log(`  monto USDC objetivo: ${ethers.formatUnits(usdcAmount, decimals)}`);

  // 1) ETH para gas
  for (const p of participants) {
    const bal = await provider.getBalance(p.address);
    if (bal >= ethAmount) {
      console.log(`  ETH ok : ${p.address} (${ethers.formatEther(bal)} ya)`);
      continue;
    }
    console.log(`  enviar : ${ethers.formatEther(ethAmount)} ETH → ${p.address}`);
    const tx = await owner.sendTransaction({ to: p.address, value: ethAmount });
    await tx.wait();
  }

  // 2) USDC
  let ownerUSDC = await usdc.balanceOf(owner.address);
  const needy: { wallet: Wallet }[] = [];

  for (const p of participants) {
    const have = await usdc.balanceOf(p.address);
    if (have >= usdcAmount) {
      console.log(`  USDC ok : ${p.address} (${ethers.formatUnits(have, decimals)})`);
    } else {
      needy.push({ wallet: p });
    }
  }

  // Recalcula el need real (target - ya tiene) y reparte el USDC del owner a tantos
  // participantes completos como alcance; el resto queda pendiente de faucet.
  const stillShort: { wallet: Wallet; need: bigint }[] = [];
  for (const { wallet } of needy) {
    const have = await usdc.balanceOf(wallet.address);
    const need = have >= usdcAmount ? 0n : usdcAmount - have;
    if (need === 0n) continue;
    if (ownerUSDC >= need) {
      console.log(
        `  transfer : ${ethers.formatUnits(need, decimals)} USDC (owner) → ${wallet.address}`
      );
      const tx = await usdc.connect(owner).transfer(wallet.address, need);
      await tx.wait();
      ownerUSDC -= need;
    } else {
      stillShort.push({ wallet, need });
    }
  }
  const short = stillShort;

  if (short.length > 0) {
    console.log(
      "\nEl owner no tiene USDC suficiente para todos. Pide el USDC que falte en el faucet público de Circle:"
    );
    console.log("  https://faucet.circle.com   (Red: Arbitrum, Monto: 20 USDC)");
    console.log("  Pega una dirección, confirma y repite con el resto:\n");
    for (const { wallet, need } of short) {
      console.log(`  → ${wallet.address}   (faltan ≥ ${ethers.formatUnits(need, decimals)} USDC)`);
    }
    console.log(`\nSonando el saldo cada 20s hasta ${waitMinutes} min…`);
    const deadline = Date.now() + waitMinutes * 60_000;
    const pending = new Map<Wallet, bigint>(short.map((s) => [s.wallet, s.need]));
    while (pending.size > 0) {
      if (Date.now() > deadline) break;
      await sleep(20_000);
      for (const [w, need] of [...pending]) {
        const bal = await usdc.balanceOf(w.address);
        if (bal >= need) {
          console.log(`  ✓ ${w.address} tiene ${ethers.formatUnits(bal, decimals)} USDC`);
          pending.delete(w);
        }
      }
    }
    if (pending.size > 0) {
      console.warn("\nTiempo de espera agotado. Sin saldo USDC en:");
      for (const w of pending.keys()) console.warn(`  - ${w.address}`);
    }
  }

  console.log("\nResumen final:");
  for (const p of participants) {
    const eth = await provider.getBalance(p.address);
    const usd = await usdc.balanceOf(p.address);
    console.log(
      `  ${p.address}  ETH=${ethers.formatEther(eth)}  USDC=${ethers.formatUnits(usd, decimals)}`
    );
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});