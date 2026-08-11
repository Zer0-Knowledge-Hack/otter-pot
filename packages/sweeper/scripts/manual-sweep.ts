import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Env } from '../src/config';
import { runSweep, logSweepResult } from '../src/runner';

function loadDevVars(): Record<string, string> {
  const filePath = resolve(process.cwd(), '.dev.vars');
  const content = readFileSync(filePath, 'utf8');
  const vars: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }
  return vars;
}

async function main() {
  const devVars = loadDevVars();
  const env: Env = {
    ENVIRONMENT: devVars.ENVIRONMENT ?? 'development',
    VAULT_ADDRESS: devVars.VAULT_ADDRESS,
    USDC_ADDRESS: devVars.USDC_ADDRESS,
    CHAIN_ID: devVars.CHAIN_ID ?? '421614',
    SWEEP_THRESHOLD_USDC: devVars.SWEEP_THRESHOLD_USDC ?? '10',
    ADMIN_PRIVATE_KEY: devVars.ADMIN_PRIVATE_KEY,
    ARBITRUM_RPC_URL: devVars.ARBITRUM_RPC_URL,
  };

  console.log('[Sweeper] Manual sweep started (local script)');
  const result = await runSweep(env);
  logSweepResult(result);

  if (result.error) {
    process.exitCode = 1;
  }
}

main().catch((e: any) => {
  console.error('[Sweeper] Manual sweep failed:', e?.message || e);
  process.exit(1);
});