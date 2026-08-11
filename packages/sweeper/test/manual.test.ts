import { describe, it, expect } from 'vitest';
import { authorizeManualTrigger } from '../src/auth';
import { sweepResultToJson } from '../src/runner';
import { Env } from '../src/config';

function makeEnv(token?: string): Env {
  return {
    ENVIRONMENT: 'test',
    VAULT_ADDRESS: '0x1234567890123456789012345678901234567890',
    USDC_ADDRESS: '0x0987654321098765432109876543210987654321',
    CHAIN_ID: '421614',
    SWEEP_THRESHOLD_USDC: '10',
    ADMIN_PRIVATE_KEY: '0xdeadbeef',
    ARBITRUM_RPC_URL: 'http://localhost:8545',
    MANUAL_TRIGGER_TOKEN: token,
  };
}

describe('authorizeManualTrigger', () => {
  it('rejects when no token is configured', () => {
    const req = new Request('https://sweeper.workers.dev/sweep', {
      method: 'POST',
      headers: { authorization: 'Bearer anything' },
    });
    expect(authorizeManualTrigger(req, makeEnv(undefined))).toBe(false);
  });

  it('accepts a matching bearer token', () => {
    const req = new Request('https://sweeper.workers.dev/sweep', {
      method: 'POST',
      headers: { authorization: 'Bearer correct-token' },
    });
    expect(authorizeManualTrigger(req, makeEnv('correct-token'))).toBe(true);
  });

  it('accepts a matching x-sweep-token header', () => {
    const req = new Request('https://sweeper.workers.dev/sweep', {
      method: 'POST',
      headers: { 'x-sweep-token': 'correct-token' },
    });
    expect(authorizeManualTrigger(req, makeEnv('correct-token'))).toBe(true);
  });

  it('rejects a wrong token', () => {
    const req = new Request('https://sweeper.workers.dev/sweep', {
      method: 'POST',
      headers: { authorization: 'Bearer wrong' },
    });
    expect(authorizeManualTrigger(req, makeEnv('correct-token'))).toBe(false);
  });

  it('rejects when no header is present', () => {
    const req = new Request('https://sweeper.workers.dev/sweep', { method: 'POST' });
    expect(authorizeManualTrigger(req, makeEnv('correct-token'))).toBe(false);
  });
});

describe('sweepResultToJson', () => {
  it('serializes bigints as strings and keeps undefined fields', () => {
    const json = sweepResultToJson({
      action: 'SKIPPED_BELOW_THRESHOLD',
      idleBalance: 5000000n,
      threshold: 10000000n,
    });
    expect(json.idleBalance).toBe('5000000');
    expect(json.threshold).toBe('10000000');
    expect(json.deployTxHash).toBeUndefined();
  });

  it('keeps tx hashes for a DEPLOYED result', () => {
    const json = sweepResultToJson({
      action: 'DEPLOYED',
      idleBalance: 15000000n,
      deployTxHash: '0xdeploy',
      realizeYieldTxHash: '0xrealize',
    });
    expect(json.action).toBe('DEPLOYED');
    expect(json.deployTxHash).toBe('0xdeploy');
    expect(json.realizeYieldTxHash).toBe('0xrealize');
  });
});