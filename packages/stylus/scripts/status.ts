/**
 * OtterPot — Estado de saldos en la red de destino (testnet/local).
 *
 * Muestra con prioridad la wallet principal (owner) y, si existen, las carteras
 * de los participantes. Las direcciones y claves se resuelven de forma dinámica:
 *   - owner: desde .env (PRIVATE_KEY_SEPOLIA...) vía getSigner.
 *   - participantes: desde deployments/<chainId>_participants.json (generado por
 *     `participants:create`). Si no existe, se muestra un aviso.
 *
 * Uso:
 *   npm run status [--network local|sepolia]
 */

import { ethers } from "ethers";
import type { JsonRpcProvider } from "ethers";
import { getSigner, loadParticipants, parseArgs, resolveTarget } from "./otter";
import * as path from "path";
import * as fs from "fs";
import { config as dotenvConfig } from "dotenv";

const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  dotenvConfig({ path: envPath });
}

const USDC_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
] as const;

interface UsdcLike {
  symbol(): Promise<string>;
  decimals(): Promise<bigint>;
  balanceOf(account: string): Promise<bigint>;
}

async function main(): Promise<void> {  const args = parseArgs(process.argv.slice(2));
  const target = resolveTarget(args);

  const provider: JsonRpcProvider = new ethers.JsonRpcProvider(target.rpc);
  await provider.ready;

  const usdcAddr = process.env["USDC_ADDRESS"];
  const usdc: UsdcLike = usdcAddr
    ? (new ethers.Contract(usdcAddr, USDC_ABI, provider) as unknown as UsdcLike)
    : { symbol: async () => "—", decimals: async () => 6n, balanceOf: async () => 0n };

  const symbol = await usdc.symbol();
  const decimals = Number(await usdc.decimals());
  const owner = getSigner(target, "owner", provider);
  const rec = loadParticipants(target.chainId);

  const box = (top: string, mid: string[]): string => {
    const w = 60;
    const pad = (s: string) => s.padEnd(w);
    return [
      `┌${"─".repeat(w + 2)}┐`,
      `│ ${pad(top)} │`,
      ...mid.map((m) => `│ ${pad(m)} │`),
      `└${"─".repeat(w + 2)}┘`,
    ].join("\n");
  };

  const fmtUsd = (b: bigint) => ethers.formatUnits(b, decimals);

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  OtterPot — Estado de carteras`);
  console.log(`  Red        : ${target.isLocal ? "local (Nitro DevNode)" : "testnet"} · chain ${target.chainId}`);
  console.log(`  RPC        : ${target.rpc}`);
  console.log(`  Token      : ${symbol} (${decimals} decimals)  @ ${usdcAddr ?? "no configurado"}`);
  console.log(`${"═".repeat(60)}\n`);

  // ── Wallet principal (destacada) ──
  const ownerEth = ethers.formatEther(await provider.getBalance(owner.address));
  const ownerUsd = fmtUsd(await usdc.balanceOf(owner.address));
  console.log(
    box(`WALLET PRINCIPAL (owner)`, [
      `Dirección : ${owner.address}`,
      `wETH       : ${ownerEth}`,
      `USDC        : ${ownerUsd}`,
    ]),
  );

  // ── Participantes (si existen) ──
  const rows = Object.entries(rec ?? {});
  console.log(`\n── Participantes (${rows.length}) ──`);
  if (rows.length === 0) {
    console.log("  No hay wallets de participantes registradas.");
    console.log("  Ejecuta primero: npm run participants:create");
  } else {
    console.log(`  ${"CARTERA".padEnd(10)} ${"DIRECCIÓN".padEnd(44)} ${"ETH".padStart(12)} ${"USDC".padStart(12)}`);
    console.log(`  ${"─".repeat(78)}`);
    for (const [label, p] of rows) {
      const eth = ethers.formatEther(await provider.getBalance(p.address));
      const us = fmtUsd(await usdc.balanceOf(p.address));
      console.log(
        `  ${label.padEnd(10)} ${p.address.padEnd(44)} ${eth.padStart(12)} ${us.padStart(12)}`,
      );
    }
  }

  console.log("");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});