import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeSweep } from '../src/sweep';
import { Env } from '../src/config';

describe('executeSweep', () => {
  let mockEnv: Env;
  let mockPublicClient: any;
  let mockWalletClient: any;

  beforeEach(() => {
    mockEnv = {
      ENVIRONMENT: 'test',
      VAULT_ADDRESS: '0x1234567890123456789012345678901234567890',
      USDC_ADDRESS: '0x0987654321098765432109876543210987654321',
      CHAIN_ID: '421614',
      SWEEP_THRESHOLD_USDC: '10',
      ADMIN_PRIVATE_KEY: '0xdeadbeef',
      ARBITRUM_RPC_URL: 'http://localhost:8545'
    };

    mockPublicClient = {
      readContract: vi.fn(),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: 'success' }),
    };

    mockWalletClient = {
      account: { address: '0xadmin' },
      writeContract: vi.fn(),
    };
  });

  it('skips if vault is paused', async () => {
    mockPublicClient.readContract.mockResolvedValueOnce(true); // paused = true

    const result = await executeSweep(mockEnv, mockPublicClient, mockWalletClient);
    
    expect(result.action).toBe('SKIPPED_PAUSED');
    expect(mockPublicClient.readContract).toHaveBeenCalledTimes(1);
    expect(mockWalletClient.writeContract).not.toHaveBeenCalled();
  });

  it('skips if idle balance is below threshold', async () => {
    mockPublicClient.readContract
      .mockResolvedValueOnce(false) // paused = false
      .mockResolvedValueOnce(5000000n); // 5 USDC

    const result = await executeSweep(mockEnv, mockPublicClient, mockWalletClient);
    
    expect(result.action).toBe('SKIPPED_BELOW_THRESHOLD');
    expect(result.idleBalance).toBe(5000000n);
    expect(result.threshold).toBe(10000000n); // 10 USDC
    expect(mockWalletClient.writeContract).not.toHaveBeenCalled();
  });

  it('deploys and realizes yield if balance is above threshold', async () => {
    mockPublicClient.readContract
      .mockResolvedValueOnce(false) // paused = false
      .mockResolvedValueOnce(15000000n); // 15 USDC
    
    mockWalletClient.writeContract
      .mockResolvedValueOnce('0xdeploy')
      .mockResolvedValueOnce('0xrealize');

    const result = await executeSweep(mockEnv, mockPublicClient, mockWalletClient);
    
    expect(result.action).toBe('DEPLOYED');
    expect(result.deployTxHash).toBe('0xdeploy');
    expect(result.realizeYieldTxHash).toBe('0xrealize');
    expect(mockWalletClient.writeContract).toHaveBeenCalledTimes(2);
  });

  it('returns DEPLOYED even if realizeYield fails', async () => {
    mockPublicClient.readContract
      .mockResolvedValueOnce(false) // paused = false
      .mockResolvedValueOnce(15000000n); // 15 USDC
    
    mockWalletClient.writeContract
      .mockResolvedValueOnce('0xdeploy')
      .mockRejectedValueOnce(new Error('realizeYield failed'));

    // We expect it to swallow the realizeYield error and still return DEPLOYED
    const result = await executeSweep(mockEnv, mockPublicClient, mockWalletClient);
    
    expect(result.action).toBe('DEPLOYED');
    expect(result.deployTxHash).toBe('0xdeploy');
    expect(result.realizeYieldTxHash).toBeUndefined();
  });

  it('returns DEPLOYED with error if deployToStrategy fails', async () => {
    mockPublicClient.readContract
      .mockResolvedValueOnce(false) // paused = false
      .mockResolvedValueOnce(15000000n); // 15 USDC
    
    mockWalletClient.writeContract
      .mockRejectedValueOnce(new Error('deployToStrategy failed'));

    const result = await executeSweep(mockEnv, mockPublicClient, mockWalletClient);
    
    expect(result.action).toBe('DEPLOYED');
    expect(result.error).toContain('deployToStrategy failed');
    expect(result.deployTxHash).toBeUndefined();
  });
});
