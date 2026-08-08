import { z } from 'zod';
import { localizedStringSchema, type Locale, type LocalizedString } from './localized';

/**
 * 指令关键词，按 locale 分组。
 *
 * 这不是"把一个字符串翻译成多语言"——每个 locale 拥有一组独立
 * 关键词，数量可以不同：中文需要拼音全拼与首字母，日文需要罗马字。
 * 关键词与显示名解耦，因为显示名要自然，关键词要覆盖用户可能
 * 输入的各种叫法（spec §9.1）。
 */
export type LocalizedKeywords = Record<Locale, string[]> & { en: string[] };

export const localizedKeywordsSchema = z
  .record(z.string(), z.array(z.string().min(1)))
  .refine(
    (value): value is LocalizedKeywords =>
      Array.isArray(value.en) && value.en.length > 0,
    { message: 'keywords 必须包含非空的 en 关键词组' },
  );

export interface CommandDeclaration {
  /** 全局唯一。插件内指令建议用 `<pluginId>.<name>` 形式 */
  id: string;
  title: LocalizedString;
  keywords: LocalizedKeywords;
  /** 相对插件根的图标路径，宿主指令可省略 */
  icon?: string;
}

export const commandDeclarationSchema = z.object({
  id: z.string().min(1),
  title: localizedStringSchema,
  keywords: localizedKeywordsSchema,
  icon: z.string().min(1).optional(),
});

/**
 * 取出某 locale 下参与检索的全部关键词。
 * 始终并入 en 关键词——用户可能用英文搜中文界面下的插件。
 */
export function keywordsForLocale(
  keywords: LocalizedKeywords,
  locale: Locale,
): string[] {
  const collected: string[] = [];

  const exact = keywords[locale];
  if (exact !== undefined) collected.push(...exact);

  const primary = locale.split('-')[0];
  if (primary !== undefined && primary !== locale) {
    const fallback = keywords[primary];
    if (fallback !== undefined) collected.push(...fallback);
  }

  collected.push(...keywords.en);

  return [...new Set(collected)];
}
