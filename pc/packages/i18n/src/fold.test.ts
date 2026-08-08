import { describe, expect, it } from 'vitest';
import { foldForSearch } from './fold';

describe('foldForSearch', () => {
  it('去除重音', () => {
    expect(foldForSearch('café')).toBe('cafe');
    expect(foldForSearch('naïve')).toBe('naive');
  });

  it('转为小写', () => {
    expect(foldForSearch('TimeStamp')).toBe('timestamp');
  });

  it('去除首尾空白', () => {
    expect(foldForSearch('  epoch  ')).toBe('epoch');
  });

  it('保留 CJK 字符不变', () => {
    expect(foldForSearch('时间戳')).toBe('时间戳');
    expect(foldForSearch('タイムスタンプ')).toBe('タイムスタンプ');
  });

  it('空字符串返回空字符串', () => {
    expect(foldForSearch('')).toBe('');
  });

  it('重音与非重音形态折叠后相等', () => {
    expect(foldForSearch('Café')).toBe(foldForSearch('cafe'));
  });
});
