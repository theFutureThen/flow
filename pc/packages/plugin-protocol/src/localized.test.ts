import { describe, expect, it } from 'vitest';
import { localizedStringSchema, resolveLocalized } from './localized';

describe('localizedStringSchema', () => {
  it('接受含 en 的多语言对象', () => {
    const result = localizedStringSchema.safeParse({ en: 'Timestamp', 'zh-CN': '时间戳' });
    expect(result.success).toBe(true);
  });

  it('拒绝缺少 en 兜底的对象', () => {
    const result = localizedStringSchema.safeParse({ 'zh-CN': '时间戳' });
    expect(result.success).toBe(false);
  });

  it('拒绝纯字符串', () => {
    const result = localizedStringSchema.safeParse('Timestamp');
    expect(result.success).toBe(false);
  });

  it('拒绝空的 en', () => {
    const result = localizedStringSchema.safeParse({ en: '', 'zh-CN': '时间戳' });
    expect(result.success).toBe(false);
  });
});

describe('resolveLocalized', () => {
  const value = { en: 'Timestamp', 'zh-CN': '时间戳', ja: 'タイムスタンプ' };

  it('精确匹配优先', () => {
    expect(resolveLocalized(value, ['zh-CN'])).toBe('时间戳');
  });

  it('按偏好顺序回退到下一个 locale', () => {
    expect(resolveLocalized(value, ['ko', 'ja'])).toBe('タイムスタンプ');
  });

  it('地区变体回退到语言主码', () => {
    expect(resolveLocalized({ en: 'X', zh: '中' }, ['zh-TW'])).toBe('中');
  });

  it('全部未命中时回退到 en', () => {
    expect(resolveLocalized(value, ['de'])).toBe('Timestamp');
  });

  it('空偏好列表回退到 en', () => {
    expect(resolveLocalized(value, [])).toBe('Timestamp');
  });
});
