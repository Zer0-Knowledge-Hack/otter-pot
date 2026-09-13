import { GenericContractsDeclaration } from "~~/utils/scaffold-eth/contract";
import { challengePoolAbi, CHALLENGE_POOL_ADDRESS, USDC_ADDRESS } from "~~/contracts/challengePoolAbi";

/**
 * External contracts for OtterPot on Arbitrum One (42161).
 * Set NEXT_PUBLIC_CHALLENGE_POOL_ADDRESS after deploy.
 */
const poolAddress = (CHALLENGE_POOL_ADDRESS ||
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

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
