import { z } from 'zod';

/** BCP 47 语言标签，如 'en'、'zh-CN'、'ja' */
export type Locale = string;

/**
 * 面向用户的文本。协议中所有会展示给用户的字段都用这个类型，
 * 而不是 string——插件贡献的指令名会直接出现在 launcher 搜索
 * 结果里，只允许单一字符串会导致中文界面下混入英文指令名。
 *
 * 强制包含 'en' 作为兜底：市场审核员无法覆盖所有语言，英文是
 * 审核基准（spec §9.8）。
 */
export type LocalizedString = Record<Locale, string> & { en: string };

export const localizedStringSchema = z
  .record(z.string(), z.string())
  .refine(
    (value): value is LocalizedString =>
      typeof value.en === 'string' && value.en.length > 0,
    { message: 'LocalizedString 必须包含非空的 en 作为兜底语言' },
  );

/**
 * 按偏好顺序解析出要展示的文本。
 * 回退链：精确匹配 → 语言主码（zh-TW → zh）→ en
 */
export function resolveLocalized(
  value: LocalizedString,
  preferred: readonly Locale[],
): string {
  for (const locale of preferred) {
    const exact = value[locale];
    if (exact !== undefined) return exact;

    const primary = locale.split('-')[0];
    if (primary !== undefined && primary !== locale) {
      const fallback = value[primary];
      if (fallback !== undefined) return fallback;
    }
  }
  return value.en;
}
