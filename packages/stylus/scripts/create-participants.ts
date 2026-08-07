/**
 * Genera 3 carteras de participantes de prueba (alice, bob, charlie) para la red
 * de destino y las persiste en `deployments/<chainId>_participants.json` junto con
 * sus claves privadas (archivo gitignored).
 *
 * Uso:
 *   yarn workspace @ss/stylus participants:create [--network sepolia]
 *
 * La clave privada queda en el archivo para que el resto de scripts de prueba
 * (fund-participants, integration-test-usdc) puedan firmar sin variables de entorno.
 */

import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { parseArgs, resolveTarget } from "./otter";

const LABELS = ["alice", "bob", "charlie"];

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const target = resolveTarget(args);

  const file = path.resolve(
    __dirname,
    `../deployments/${target.chainId}_participants.json`
  );

  if (fs.existsSync(file)) {
    const backup = file.replace(/\.json$/, `_${Date.now()}.json`);
    fs.renameSync(file, backup);
    console.log(`Archivo previo respaldado en: ${backup}`);
  }

  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const record: Record<string, { address: string; privateKey: string }> = {};
  for (const label of LABELS) {
    const w = ethers.Wallet.createRandom();
    record[label] = { address: w.address, privateKey: w.privateKey };
  }

  fs.writeFileSync(file, JSON.stringify(record, null, 2));

  console.log(`Participantes generados (chain ${target.chainId}):`);
  console.log(`  archivo: ${file}`);
  for (const label of LABELS) {
    console.log(`  ${label.padEnd(7)} ${record[label]!.address}`);
  }
}

main();