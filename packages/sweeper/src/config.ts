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

  // Optional — protege el trigger manual vía HTTP (fetch handler)
  MANUAL_TRIGGER_TOKEN?: string;
}

const HEX_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

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

  if (!HEX_ADDRESS_RE.test(env.VAULT_ADDRESS)) {
    throw new Error('VAULT_ADDRESS must be a valid hex address');
  }

  if (!HEX_ADDRESS_RE.test(env.USDC_ADDRESS)) {
    throw new Error('USDC_ADDRESS must be a valid hex address');
  }

  if (!/^\d+$/.test(env.CHAIN_ID)) {
    throw new Error('CHAIN_ID must be a numeric chain id');
  }

  if (!/^\d+(\.\d+)?$/.test(env.SWEEP_THRESHOLD_USDC)) {
    throw new Error('SWEEP_THRESHOLD_USDC must be a numeric value in USDC');
  }

  const pk = env.ADMIN_PRIVATE_KEY.startsWith('0x')
    ? env.ADMIN_PRIVATE_KEY.slice(2)
    : env.ADMIN_PRIVATE_KEY;

  if (!/^[0-9a-fA-F]{64}$/.test(pk)) {
    throw new Error('ADMIN_PRIVATE_KEY must be a 64-character hex private key');
  }
}