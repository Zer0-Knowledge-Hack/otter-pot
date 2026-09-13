import { parseAbi } from 'viem';

export const treasuryVaultAbi = parseAbi([
  'function paused() view returns (bool)',
  'function deployToStrategy(uint256 amount)',
  'function realizeYield()',
  'function totalAssets() view returns (uint256)',
  'function strategyDeployed() view returns (uint256)'
]);

export const usdcAbi = parseAbi([
  'function balanceOf(address account) view returns (uint256)'
]);
