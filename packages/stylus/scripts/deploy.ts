import deployStylusContract from "./deploy_contract";
import {
  getDeploymentConfig,
  getRpcUrlFromChain,
  printDeployedAddresses,
} from "./utils/";
import { DeployOptions } from "./utils/type";
import { config as dotenvConfig } from "dotenv";
import * as path from "path";
import * as fs from "fs";

const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  dotenvConfig({ path: envPath });
}

/**
 * Define your deployment logic here
 */
export default async function deployScript(deployOptions: DeployOptions) {
  const config = getDeploymentConfig(deployOptions);

  console.log(`📡 Using endpoint: ${getRpcUrlFromChain(config.chain)}`);
  if (config.chain) {
    console.log(`🌐 Network: ${config.chain?.name}`);
    console.log(`🔗 Chain ID: ${config.chain?.id}`);
  }
  console.log(`🔑 Using private key: ${config.privateKey.substring(0, 10)}...`);
  console.log(`📁 Deployment directory: ${config.deploymentDir}`);
  console.log(`\n`);

// Deploy a contract. Each deployStylusContract() call deploys ONE contract
  // (its own tx + address) and, on success, automatically:
  // 1. saves the address/tx to packages/<stylus>/deployments/
  // 2. runs 'cargo stylus export-abi' and writes the ABI + address into
  //    packages/nextjs/contracts/deployedContracts.ts (keyed by chainId + name),
  //    so the Next.js frontend picks it up immediately.
  //
  // Deploy order: TreasuryVault first (challenge_pool.init() references its
  // address), then ChallengePool. Both are initialized post-deploy by the
  // backend (they expose one-shot `init()`, SDD §6/§7).
  await deployStylusContract({
    contract: "treasury_vault", // folder name under packages/stylus/contracts/
    // treasury_vault.init(usdc) is called post-deploy by the Worker (no constructor args).
    ...deployOptions,
  });
  await deployStylusContract({
    contract: "challenge_pool", // folder name under packages/stylus/contracts/
    // challenge_pool.init(treasury_vault, base_commission_rate) is called
    // post-deploy by the Worker, using the TreasuryVault address from above and
    // the configured commission rate. No constructor args at deploy time.
    ...deployOptions,
  });

  // Print the deployed addresses
  console.log("\n\n");
  printDeployedAddresses(config.deploymentDir, config.chain.id.toString());
}
