import { GenericContractsDeclaration } from "~~/utils/scaffold-eth/contract";
import { challengePoolAbi } from "~~/contracts/challengePoolAbi";
import { getNetworkContracts } from "~~/contracts/config";

/**
 * External contracts for OtterPot on Arbitrum One (42161).
 * Set NEXT_PUBLIC_CHALLENGE_POOL_ADDRESS after deploy.
 *
 * Las addresses salen de `config.ts` fijadas a Arbitrum One, no de la red activa:
 * esta declaración es solo para 42161.
 */
const arbitrumOne = getNetworkContracts("arbitrum");

const poolAddress = (arbitrumOne.challengePool ||
  "0x0000000000000000000000000000000000000000") as `0x${string}`;
const USDC_ADDRESS = arbitrumOne.usdc as `0x${string}`;

const externalContracts = {
  42161: {
    ChallengePool: {
      address: poolAddress,
      abi: challengePoolAbi,
    },
    USDC: {
      address: USDC_ADDRESS,
      abi: [
        {
          type: "function",
          name: "balanceOf",
          stateMutability: "view",
          inputs: [{ name: "account", type: "address" }],
          outputs: [{ name: "", type: "uint256" }],
        },
        {
          type: "function",
          name: "approve",
          stateMutability: "nonpayable",
          inputs: [
            { name: "spender", type: "address" },
            { name: "amount", type: "uint256" },
          ],
          outputs: [{ name: "", type: "bool" }],
        },
        {
          type: "function",
          name: "allowance",
          stateMutability: "view",
          inputs: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
          ],
          outputs: [{ name: "", type: "uint256" }],
        },
      ],
    },
  },
} as const;

export default externalContracts satisfies GenericContractsDeclaration;
