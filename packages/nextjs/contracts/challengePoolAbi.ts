/**
 * ABI for IChallengePool — kept in sync with the Stylus ChallengePool interface.
 * Source of truth: Solidity interface derived from packages/stylus contracts.
 */
export const challengePoolAbi = [
  {
    type: "event",
    name: "ChallengeCreated",
    inputs: [
      { name: "challengeId", type: "uint256", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "requiredDeposit", type: "uint256", indexed: false },
      { name: "deadline", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "DepositReceived",
    inputs: [
      { name: "challengeId", type: "uint256", indexed: true },
      { name: "participant", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ChallengeLocked",
    inputs: [
      { name: "challengeId", type: "uint256", indexed: true },
      { name: "treasuryShares", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ChallengeResolved",
    inputs: [
      { name: "challengeId", type: "uint256", indexed: true },
      { name: "winner", type: "address", indexed: true },
      { name: "totalPayout", type: "uint256", indexed: false },
      { name: "commission", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ChallengeRefunded",
    inputs: [
      { name: "challengeId", type: "uint256", indexed: true },
      { name: "refundPerParticipant", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "RefundClaimed",
    inputs: [
      { name: "challengeId", type: "uint256", indexed: true },
      { name: "participant", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "OperatorAdded",
    inputs: [{ name: "operator", type: "address", indexed: true }],
  },
  {
    type: "event",
    name: "OperatorRemoved",
    inputs: [{ name: "operator", type: "address", indexed: true }],
  },
  {
    type: "function",
    name: "init",
    stateMutability: "nonpayable",
    inputs: [
      { name: "treasuryVault", type: "address" },
      { name: "usdc", type: "address" },
      { name: "baseCommissionRate", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "addOperator",
    stateMutability: "nonpayable",
    inputs: [{ name: "operator", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "removeOperator",
    stateMutability: "nonpayable",
    inputs: [{ name: "operator", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "setCommissionRate",
    stateMutability: "nonpayable",
    inputs: [{ name: "rateBps", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "setTreasuryVault",
    stateMutability: "nonpayable",
    inputs: [{ name: "newVault", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "commissionRate",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "createChallenge",
    stateMutability: "nonpayable",
    inputs: [
      { name: "requiredDeposit", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "participants", type: "address[]" },
    ],
    outputs: [{ name: "challengeId", type: "uint256" }],
  },
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [{ name: "challengeId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "confirmResult",
    stateMutability: "nonpayable",
    inputs: [
      { name: "challengeId", type: "uint256" },
      { name: "winner", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "refund",
    stateMutability: "nonpayable",
    inputs: [{ name: "challengeId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "claimRefund",
    stateMutability: "nonpayable",
    inputs: [{ name: "challengeId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "challengeStatus",
    stateMutability: "view",
    inputs: [{ name: "challengeId", type: "uint256" }],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "isOperator",
    stateMutability: "view",
    inputs: [{ name: "operator", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

/**
 * Solo ABI en este archivo.
 * Addresses: importar desde `~~/contracts/config`. No se re-exportan acá porque
 * `config` importa este archivo y el ciclo rompe la inicialización en Turbopack.
 */
