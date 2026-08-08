import { createPublicClient, createWalletClient, http } from 'viem';
import { arbitrum, arbitrumSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { Env, validateEnv } from './config';
import { executeSweep } from './sweep';

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`[Sweeper] Cron triggered at ${new Date(event.scheduledTime).toISOString()}`);
    
    try {
      validateEnv(env);

      // Ensure private key is properly formatted
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

      const result = await executeSweep(env, publicClient as any, walletClient as any);
      
      console.log(`[Sweeper] Action: ${result.action}`);
      if (result.idleBalance !== undefined) {
        // USDC has 6 decimals, format it nicely for the logs
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

    } catch (e: any) {
      console.error(`[Sweeper] Fatal error during scheduled execution:`, e.message || e);
    }
  }
};
