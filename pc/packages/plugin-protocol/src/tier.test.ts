import { describe, expect, it } from 'vitest';
import { DEFAULT_TIER, capabilitiesForTier, tierSchema } from './tier';

describe('tierSchema', () => {
  it('接受 L0 / L1 / L2', () => {
    expect(tierSchema.safeParse('L0').success).toBe(true);
    expect(tierSchema.safeParse('L1').success).toBe(true);
    expect(tierSchema.safeParse('L2').success).toBe(true);
  });

  it('拒绝未知层级', () => {
    expect(tierSchema.safeParse('L3').success).toBe(false);
  });

  it('默认层级为 L1', () => {
    expect(DEFAULT_TIER).toBe('L1');
  });
});

describe('capabilitiesForTier', () => {
  it('L0 不含任何需要执行代码的能力', () => {
    expect(capabilitiesForTier('L0')).toEqual([]);
  });

  it('L1 含存储与通知，不含文件系统', () => {
    const caps = capabilitiesForTier('L1');
    expect(caps).toContain('storage');
    expect(caps).toContain('notification');
    expect(caps).not.toContain('fs');
  });

  it('L2 在 L1 基础上增加文件系统', () => {
    const caps = capabilitiesForTier('L2');
    expect(caps).toContain('storage');
    expect(caps).toContain('fs');
  });

  it('L1 的能力是 L2 的子集', () => {
    const l1 = capabilitiesForTier('L1');
    const l2 = capabilitiesForTier('L2');
    for (const cap of l1) {
      expect(l2).toContain(cap);
    }
  });

  it('能力集是白名单——未知能力不会出现在任何层级', () => {
    for (const tier of ['L0', 'L1', 'L2'] as const) {
      expect(capabilitiesForTier(tier)).not.toContain('arbitrary-code');
    }
  });
});
