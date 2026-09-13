export interface Env {
  // Vars
  ENVIRONMENT: string;
  VAULT_ADDRESS: string;
  USDC_ADDRESS: string;
  CHAIN_ID: string;
  SWEEP_THRESHOLD_USDC: string;

  // Secrets
  ADMIN_PRIVATE_KEY: string;
  ARBITRUM_RPC_URL: string;
}

export function validateEnv(env: Env) {
  const required = [
    'VAULT_ADDRESS',
    'USDC_ADDRESS',
    'CHAIN_ID',
    'SWEEP_THRESHOLD_USDC',
    'ADMIN_PRIVATE_KEY',
    'ARBITRUM_RPC_URL'
  ] as const;

  for (const key of required) {
    if (!env[key]) {
      throw new Error(`Missing required environment variable or secret: ${key}`);
    }
  }

  if (!env.VAULT_ADDRESS.startsWith('0x') || env.VAULT_ADDRESS.length !== 42) {
    throw new Error('VAULT_ADDRESS must be a valid hex address');
  }

  if (!env.USDC_ADDRESS.startsWith('0x') || env.USDC_ADDRESS.length !== 42) {
    throw new Error('USDC_ADDRESS must be a valid hex address');
  }

  if (!env.ADMIN_PRIVATE_KEY.startsWith('0x') && env.ADMIN_PRIVATE_KEY.length !== 64) {
      // If it doesn't start with 0x, we prepend it later in index.ts, but let's just make sure it's present.
  }
}
