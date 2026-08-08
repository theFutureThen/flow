import { describe, expect, it } from 'vitest';
import { shouldSearch } from './useCommandSearch';

describe('shouldSearch', () => {
  it('非组合态时应检索', () => {
    expect(shouldSearch({ composing: false, value: '时间' })).toBe(true);
  });

  it('组合态进行中不应检索', () => {
    expect(shouldSearch({ composing: true, value: 'shijian' })).toBe(false);
  });

  it('组合态结束后应检索', () => {
    expect(shouldSearch({ composing: false, value: '时间' })).toBe(true);
  });

  it('空值非组合态时应检索（用于清空结果）', () => {
    expect(shouldSearch({ composing: false, value: '' })).toBe(true);
  });

  it('组合态即使有内容也不检索', () => {
    expect(shouldSearch({ composing: true, value: '' })).toBe(false);
  });
});
