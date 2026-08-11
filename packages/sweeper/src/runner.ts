import { createPublicClient, createWalletClient, http } from 'viem';
import { arbitrum, arbitrumSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { Env, validateEnv } from './config';
import { executeSweep, SweepResult } from './sweep';

export async function runSweep(env: Env): Promise<SweepResult> {
  validateEnv(env);

  const pkString = env.ADMIN_PRIVATE_KEY.startsWith('0x')
    ? env.ADMIN_PRIVATE_KEY
    : `0x${env.ADMIN_PRIVATE_KEY}`;

  const account = privateKeyToAccount(pkString as `0x${string}`);

  const chainId = parseInt(env.CHAIN_ID, 10);
  const chain = chainId === 421614 ? arbitrumSepolia : arbitrum;

  const publicClient = createPublicClient({
    chain,
    transport: http(env.ARBITRUM_RPC_URL)
  });

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(env.ARBITRUM_RPC_URL)
  });

  return executeSweep(env, publicClient, walletClient);
}

export function logSweepResult(result: SweepResult): void {
  console.log(`[Sweeper] Action: ${result.action}`);
  if (result.idleBalance !== undefined) {
    const formattedBalance = (Number(result.idleBalance) / 1e6).toFixed(2);
    console.log(`[Sweeper] Idle Balance: ${formattedBalance} USDC`);
  }
  if (result.deployTxHash) {
    console.log(`[Sweeper] Deploy Tx: ${result.deployTxHash}`);
  }
  if (result.realizeYieldTxHash) {
    console.log(`[Sweeper] Realize Yield Tx: ${result.realizeYieldTxHash}`);
  }
  if (result.error) {
    console.error(`[Sweeper] Error: ${result.error}`);
  }
}

export function sweepResultToJson(result: SweepResult): Record<string, unknown> {
  return {
    action: result.action,
    idleBalance: result.idleBalance !== undefined ? result.idleBalance.toString() : undefined,
    threshold: result.threshold !== undefined ? result.threshold.toString() : undefined,
    deployTxHash: result.deployTxHash,
    realizeYieldTxHash: result.realizeYieldTxHash,
    error: result.error,
  };
}