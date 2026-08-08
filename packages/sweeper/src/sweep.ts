import { PublicClient, WalletClient } from 'viem';
import { treasuryVaultAbi, usdcAbi } from './abi';
import { Env } from './config';

export type SweepResult = {
  action: 'SKIPPED_PAUSED' | 'SKIPPED_BELOW_THRESHOLD' | 'DEPLOYED';
  idleBalance?: bigint;
  threshold?: bigint;
  deployTxHash?: string;
  realizeYieldTxHash?: string;
  error?: string;
};

export async function executeSweep(
  env: Env,
  publicClient: PublicClient,
  walletClient: WalletClient
): Promise<SweepResult> {
  const vaultAddress = env.VAULT_ADDRESS as `0x${string}`;
  const usdcAddress = env.USDC_ADDRESS as `0x${string}`;
  const account = walletClient.account;

  if (!account) {
    throw new Error('WalletClient is not configured with an account');
  }

  try {
    // 1. Check if vault is paused
    const isPaused = await publicClient.readContract({
      address: vaultAddress,
      abi: treasuryVaultAbi,
      functionName: 'paused',
    });

    if (isPaused) {
      return { action: 'SKIPPED_PAUSED' };
    }

    // 2. Read idle USDC balance
    const idleBalance = await publicClient.readContract({
      address: usdcAddress,
      abi: usdcAbi,
      functionName: 'balanceOf',
      args: [vaultAddress],
    }) as bigint;

    // 3. Check against threshold
    const thresholdUsdcStr = env.SWEEP_THRESHOLD_USDC || '10';
    // Multiply by 10^6 because USDC has 6 decimals
    const threshold = BigInt(parseInt(thresholdUsdcStr, 10)) * BigInt(1e6);

    if (idleBalance < threshold) {
      return {
        action: 'SKIPPED_BELOW_THRESHOLD',
        idleBalance,
        threshold,
      };
    }

    // 4. Deploy to strategy
    const deployHash = await walletClient.writeContract({
      address: vaultAddress,
      abi: treasuryVaultAbi,
      functionName: 'deployToStrategy',
      args: [idleBalance],
    });

    await publicClient.waitForTransactionReceipt({ hash: deployHash });

    // 5. Realize yield to update vault accounting
    let realizeHash: string | undefined;
    try {
      realizeHash = await walletClient.writeContract({
        address: vaultAddress,
        abi: treasuryVaultAbi,
        functionName: 'realizeYield',
      });
      await publicClient.waitForTransactionReceipt({ hash: realizeHash });
    } catch (e) {
      // If realizeYield fails, it shouldn't revert the fact that we successfully deployed.
      // But we should log it.
      console.error('Failed to realize yield after deployment:', e);
    }

    return {
      action: 'DEPLOYED',
      idleBalance,
      deployTxHash: deployHash,
      realizeYieldTxHash: realizeHash,
    };
  } catch (error: any) {
    return {
      action: 'DEPLOYED', // Attempted
      error: error.message || String(error),
    };
  }
}
