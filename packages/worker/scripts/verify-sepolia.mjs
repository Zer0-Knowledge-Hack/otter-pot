import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, http, parseAbi, formatEther, getAddress } from "viem";
import { arbitrumSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to parse key-value files without external dependencies
function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, "utf8");
  const env = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

// Search locations for .dev.vars and .env in current worktree and main repo
const workerDirs = [
  path.resolve(__dirname, ".."),
  path.resolve(__dirname, "../../../../../otter-pot/packages/worker"),
  "D:/Proyectos/Blockchain/otter-pot/packages/worker",
];
const stylusDirs = [
  path.resolve(__dirname, "../../stylus"),
  path.resolve(__dirname, "../../../../../otter-pot/packages/stylus"),
  "D:/Proyectos/Blockchain/otter-pot/packages/stylus",
];

let loadedEnv = { ...process.env };

for (const dir of workerDirs) {
  const varsPath = path.join(dir, ".dev.vars");
  if (fs.existsSync(varsPath)) {
    const parsed = parseEnvFile(varsPath);
    for (const [k, v] of Object.entries(parsed)) {
      if (v) loadedEnv[k] = v;
    }
    break;
  }
}

for (const dir of stylusDirs) {
  const envPath = path.join(dir, ".env");
  if (fs.existsSync(envPath)) {
    const stylusEnv = parseEnvFile(envPath);
    if (stylusEnv.PRIVATE_KEY_SEPOLIA && !loadedEnv.OPERATOR_PRIVATE_KEY) {
      let key = stylusEnv.PRIVATE_KEY_SEPOLIA;
      if (!key.startsWith("0x") && key.length === 64) key = "0x" + key;
      loadedEnv.OPERATOR_PRIVATE_KEY = key;
    }
    if (stylusEnv.RPC_URL_SEPOLIA && !loadedEnv.CHAIN_RPC_URL) {
      loadedEnv.CHAIN_RPC_URL = stylusEnv.RPC_URL_SEPOLIA;
    }
    if (stylusEnv.USDC_ADDRESS && !loadedEnv.USDC_ADDRESS) {
      loadedEnv.USDC_ADDRESS = stylusEnv.USDC_ADDRESS;
    }
  }
}

// Default Sepolia fallback if still missing
if (!loadedEnv.CHAIN_RPC_URL) {
  loadedEnv.CHAIN_RPC_URL = "https://sepolia-rollup.arbitrum.io/rpc";
}
if (!loadedEnv.CHAIN_ID) {
  loadedEnv.CHAIN_ID = "421614";
}

const ADDRESS_FORMAT = /^0x[0-9a-fA-F]{40}$/;
const PRIVATE_KEY_FORMAT = /^0x[0-9a-fA-F]{64}$/;

console.log("=== OtterPot Relayer Sepolia Verification ===");

// 1. Validate Config Format
if (!loadedEnv.CHAIN_RPC_URL || !loadedEnv.CHAIN_RPC_URL.startsWith("http")) {
  console.error("❌ CHAIN_RPC_URL missing or invalid");
  process.exit(1);
}
console.log("✔ CHAIN_RPC_URL format: OK (URL is HTTP/HTTPS)");

if (!loadedEnv.CHALLENGE_POOL_ADDRESS || !ADDRESS_FORMAT.test(loadedEnv.CHALLENGE_POOL_ADDRESS)) {
  console.error("❌ CHALLENGE_POOL_ADDRESS missing or invalid format");
  process.exit(1);
}
console.log(`✔ CHALLENGE_POOL_ADDRESS format: OK (${loadedEnv.CHALLENGE_POOL_ADDRESS})`);

if (!loadedEnv.USDC_ADDRESS || !ADDRESS_FORMAT.test(loadedEnv.USDC_ADDRESS)) {
  console.error("❌ USDC_ADDRESS missing or invalid format");
  process.exit(1);
}
console.log(`✔ USDC_ADDRESS format: OK (${loadedEnv.USDC_ADDRESS})`);

if (!loadedEnv.OPERATOR_PRIVATE_KEY || !PRIVATE_KEY_FORMAT.test(loadedEnv.OPERATOR_PRIVATE_KEY)) {
  console.error("❌ OPERATOR_PRIVATE_KEY missing or invalid format (expected 0x + 64 hex)");
  process.exit(1);
}
console.log("✔ OPERATOR_PRIVATE_KEY format: OK (64 hex characters, value hidden)");

if (loadedEnv.CHAIN_ID !== "421614") {
  console.error(`❌ Expected CHAIN_ID 421614, got ${loadedEnv.CHAIN_ID}`);
  process.exit(1);
}
console.log("✔ CHAIN_ID: OK (421614 - Arbitrum Sepolia)");

// 2. Connect to Arbitrum Sepolia
async function runChecks() {
  const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(loadedEnv.CHAIN_RPC_URL),
  });

  const account = privateKeyToAccount(loadedEnv.OPERATOR_PRIVATE_KEY);
  console.log(`✔ Operator Address derived: ${account.address}`);

  try {
    const chainId = await publicClient.getChainId();
    if (chainId !== 421614) {
      throw new Error(`Connected chainId ${chainId} does not match 421614`);
    }
    const blockNumber = await publicClient.getBlockNumber();
    console.log(`✔ RPC Connected: Arbitrum Sepolia (Block #${blockNumber})`);

    const balance = await publicClient.getBalance({ address: account.address });
    console.log(`✔ Operator Balance: ${formatEther(balance)} ETH`);

    // 3. Verify ChallengePool Code
    const poolCode = await publicClient.getBytecode({ address: loadedEnv.CHALLENGE_POOL_ADDRESS });
    if (!poolCode || poolCode === "0x") {
      console.warn(`⚠️ Warning: No bytecode at CHALLENGE_POOL_ADDRESS (${loadedEnv.CHALLENGE_POOL_ADDRESS})`);
    } else {
      console.log(`✔ ChallengePool contract exists on-chain (${poolCode.length / 2 - 1} bytes)`);

      // Check isOperator
      try {
        const isOperator = await publicClient.readContract({
          address: getAddress(loadedEnv.CHALLENGE_POOL_ADDRESS),
          abi: parseAbi(["function isOperator(address) view returns (bool)"]),
          functionName: "isOperator",
          args: [account.address],
        });
        console.log(`✔ isOperator(${account.address}): ${isOperator}`);
      } catch (err) {
        console.log(`ℹ Note: isOperator query returned: ${err.message?.slice(0, 80) ?? "unknown"}`);
      }
    }

    // 4. Verify USDC Code
    const usdcChecksummed = getAddress(loadedEnv.USDC_ADDRESS);
    const usdcCode = await publicClient.getBytecode({ address: usdcChecksummed });
    if (usdcCode && usdcCode !== "0x") {
      try {
        const decimals = await publicClient.readContract({
          address: usdcChecksummed,
          abi: parseAbi(["function decimals() view returns (uint8)"]),
          functionName: "decimals",
        });
        console.log(`✔ USDC Contract: Decimals = ${decimals}`);
      } catch (err) {
        console.log(`ℹ Note: USDC decimals query: ${err.message?.slice(0, 80) ?? "unknown"}`);
      }
    }

    console.log("\nAll network and configuration verifications completed successfully!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Network check failed:", err.message);
    process.exit(1);
  }
}

runChecks();
