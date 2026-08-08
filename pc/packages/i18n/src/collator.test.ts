import { describe, expect, it } from 'vitest';
import { createCollator } from './collator';

describe('createCollator', () => {
  it('瑞典语把 å 排在 z 之后', () => {
    const collator = createCollator('sv');
    expect(collator.compare('å', 'z')).toBeGreaterThan(0);
  });

  it('德语把 ä 视为接近 a', () => {
    const collator = createCollator('de');
    expect(collator.compare('ä', 'z')).toBeLessThan(0);
  });

  it('相同字符串比较结果为 0', () => {
    expect(createCollator('en').compare('abc', 'abc')).toBe(0);
  });

  it('未知 locale 不抛异常', () => {
    expect(() => createCollator('xx-YY')).not.toThrow();
  });

  it('同 locale 重复调用返回同一实例', () => {
    expect(createCollator('fr')).toBe(createCollator('fr'));
  });

  it('数字按数值而非字典序排列', () => {
    expect(createCollator('en').compare('item2', 'item10')).toBeLessThan(0);
  });
});
