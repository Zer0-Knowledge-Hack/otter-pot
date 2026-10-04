import { GenericContractsDeclaration } from "~~/utils/scaffold-eth/contract";
import { challengePoolAbi } from "~~/contracts/challengePoolAbi";
import {
  CHALLENGE_POOL_ADDRESS,
  TREASURY_VAULT_ADDRESS,
  AAVE_V3_STRATEGY_ADDRESS,
  USDC_ADDRESS,
} from "~~/contracts/config";
import { erc20Abi } from "~~/contracts/erc20Abi";
import deployedContracts from "~~/contracts/deployedContracts";

const sepolia = deployedContracts["421614"];

const poolAddress = (CHALLENGE_POOL_ADDRESS ||
  sepolia?.ChallengePool?.address ||
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

const vaultAddress = (TREASURY_VAULT_ADDRESS ||
  sepolia?.TreasuryVault?.address ||
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

const strategyAddress = (AAVE_V3_STRATEGY_ADDRESS ||
  sepolia?.AaveStrategy?.address ||
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

const usdcAddress = (USDC_ADDRESS ||
  "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d") as `0x${string}`;

/**
 * Contratos externos OtterPot — Arbitrum Sepolia (421614).
 * Addresses desde .env / config; ABI alineado a ChallengePool.abi.json.
 */
const externalContracts = {
  421614: {
    ChallengePool: {
      address: poolAddress,
      abi: challengePoolAbi,
    },
    TreasuryVault: {
      address: vaultAddress,
      abi: sepolia.TreasuryVault.abi,
    },
    AaveStrategy: {
      address: strategyAddress,
      abi: sepolia.AaveStrategy.abi,
    },
    USDC: {
      address: usdcAddress,
      abi: erc20Abi,
    },
  },
} as const;

export default externalContracts satisfies GenericContractsDeclaration;
