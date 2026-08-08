import { foldForSearch } from '@flow/i18n';

export interface MatchCandidate {
  id: string;
  /** 已按当前 locale 解析出的显示名 */
  title: string;
  /** 已按当前 locale 展开并合并 en 的关键词 */
  keywords: string[];
}

export interface MatchResult {
  id: string;
  score: number;
}

const SCORE_EXACT = 1000;
const SCORE_PREFIX = 500;
const SCORE_SUBSTRING = 200;
const SCORE_SUBSEQUENCE = 50;

/**
 * 判断 query 是否为 target 的子序列（字符顺序一致但可不连续）。
 * 用于 'tsp' 命中 'timestamp' 这类输入。
 */
function isSubsequence(query: string, target: string): boolean {
  let queryIndex = 0;
  for (let i = 0; i < target.length && queryIndex < query.length; i += 1) {
    if (target[i] === query[queryIndex]) queryIndex += 1;
  }
  return queryIndex === query.length;
}

/**
 * 对单个词条打分。返回 0 表示不命中。
 * 命中越靠前、越完整得分越高；同级时短词条优先。
 */
function scoreTerm(query: string, term: string): number {
  if (term === query) return SCORE_EXACT;
  if (term.startsWith(query)) return SCORE_PREFIX - term.length;
  if (term.includes(query)) return SCORE_SUBSTRING - term.length;
  if (isSubsequence(query, term)) return SCORE_SUBSEQUENCE - term.length;
  return 0;
}

/**
 * 匹配并排序候选指令。
 *
 * 课题要求主要业务逻辑自研，这里不套用现成模糊搜索库。算法是纯
 * 函数，不依赖 Electron，便于大量单测覆盖边界（spec §6.5）。
 */
export function matchCandidates(
  query: string,
  candidates: readonly MatchCandidate[],
): MatchResult[] {
  const folded = foldForSearch(query);

  if (folded === '') {
    return candidates.map((candidate) => ({ id: candidate.id, score: 0 }));
  }

  const results: MatchResult[] = [];

  for (const candidate of candidates) {
    const terms = [candidate.title, ...candidate.keywords];
    let best = 0;

    for (const term of terms) {
      const score = scoreTerm(folded, foldForSearch(term));
      if (score > best) best = score;
    }

    if (best > 0) results.push({ id: candidate.id, score: best });
  }

  return results.sort((a, b) => b.score - a.score);
}
