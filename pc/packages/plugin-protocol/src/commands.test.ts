import { describe, expect, it } from 'vitest';
import { commandDeclarationSchema, keywordsForLocale } from './commands';

const valid = {
  id: 'timestamp.convert',
  title: { en: 'Convert Timestamp', 'zh-CN': '时间戳转换' },
  keywords: {
    en: ['timestamp', 'unix time', 'epoch'],
    'zh-CN': ['时间戳', 'shijianchuo', 'sjc'],
  },
};

describe('commandDeclarationSchema', () => {
  it('接受合法声明', () => {
    expect(commandDeclarationSchema.safeParse(valid).success).toBe(true);
  });

  it('拒绝 keywords 为字符串数组的旧形态', () => {
    const result = commandDeclarationSchema.safeParse({
      ...valid,
      keywords: ['timestamp', 'epoch'],
    });
    expect(result.success).toBe(false);
  });

  it('拒绝空 id', () => {
    expect(commandDeclarationSchema.safeParse({ ...valid, id: '' }).success).toBe(false);
  });

  it('拒绝缺少 en 关键词的声明', () => {
    const result = commandDeclarationSchema.safeParse({
      ...valid,
      keywords: { 'zh-CN': ['时间戳'] },
    });
    expect(result.success).toBe(false);
  });

  it('拒绝 en 关键词为空数组', () => {
    const result = commandDeclarationSchema.safeParse({
      ...valid,
      keywords: { en: [] },
    });
    expect(result.success).toBe(false);
  });
});

describe('keywordsForLocale', () => {
  it('合并目标 locale 与 en 关键词', () => {
    const result = keywordsForLocale(valid.keywords, 'zh-CN');
    expect(result).toContain('时间戳');
    expect(result).toContain('sjc');
    expect(result).toContain('timestamp');
  });

  it('地区变体回退到语言主码', () => {
    const keywords = { en: ['a'], zh: ['中'] };
    expect(keywordsForLocale(keywords, 'zh-TW')).toContain('中');
  });

  it('结果去重', () => {
    const keywords = { en: ['dup'], fr: ['dup'] };
    expect(keywordsForLocale(keywords, 'fr').filter((k) => k === 'dup')).toHaveLength(1);
  });

  it('未知 locale 仍返回 en 关键词', () => {
    expect(keywordsForLocale(valid.keywords, 'de')).toContain('epoch');
  });
});
