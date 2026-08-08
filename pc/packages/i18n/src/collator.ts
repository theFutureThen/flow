const cache = new Map<string, Intl.Collator>();

/**
 * 取得 locale 感知的比较器。结果排序必须用它而非字符串 `<`——
 * 德语 ä、瑞典语 å、土耳其语 i/İ 的排序规则各不相同（spec §9.4）。
 *
 * 实例有构造开销，按 locale 缓存复用。
 */
export function createCollator(locale: string): Intl.Collator {
  const cached = cache.get(locale);
  if (cached !== undefined) return cached;

  const collator = new Intl.Collator(locale, {
    sensitivity: 'base',
    numeric: true,
  });
  cache.set(locale, collator);
  return collator;
}
