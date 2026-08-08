import { describe, expect, it } from 'vitest';
import { matchCandidates, type MatchCandidate } from './fuzzy';

const candidates: MatchCandidate[] = [
  {
    id: 'timestamp',
    title: '时间戳转换',
    keywords: ['时间戳', 'shijianchuo', 'sjc', 'timestamp', 'epoch'],
  },
  {
    id: 'settings',
    title: '设置',
    keywords: ['设置', 'shezhi', 'sz', 'settings', 'preferences'],
  },
  {
    id: 'theme',
    title: '切换主题',
    keywords: ['主题', 'zhuti', 'zt', 'theme', 'dark mode'],
  },
];

describe('matchCandidates', () => {
  it('空查询返回全部候选', () => {
    expect(matchCandidates('', candidates)).toHaveLength(3);
  });

  it('前缀匹配得分高于子串匹配', () => {
    const results = matchCandidates('time', candidates);
    expect(results[0]?.id).toBe('timestamp');
  });

  it('拼音首字母可命中', () => {
    const results = matchCandidates('sjc', candidates);
    expect(results[0]?.id).toBe('timestamp');
  });

  it('中文可命中', () => {
    const results = matchCandidates('时间', candidates);
    expect(results[0]?.id).toBe('timestamp');
  });

  it('日文可命中（验证 NFC 归一化）', () => {
    const japanese: MatchCandidate[] = [
      { id: 'ts', title: 'タイムスタンプ', keywords: ['タイムスタンプ'] },
    ];
    expect(matchCandidates('タイムスタンプ', japanese)).toHaveLength(1);
  });

  it('重音不敏感', () => {
    const accented: MatchCandidate[] = [{ id: 'cafe', title: 'Café', keywords: ['café'] }];
    expect(matchCandidates('cafe', accented)).toHaveLength(1);
  });

  it('大小写不敏感', () => {
    const results = matchCandidates('EPOCH', candidates);
    expect(results[0]?.id).toBe('timestamp');
  });

  it('无命中时返回空数组', () => {
    expect(matchCandidates('zzzz', candidates)).toEqual([]);
  });

  it('非连续子序列可命中但得分低于前缀', () => {
    const subsequence = matchCandidates('tsp', candidates).find((r) => r.id === 'timestamp');
    expect(subsequence).toBeDefined();

    const prefix = matchCandidates('times', candidates);
    expect(prefix[0]!.score).toBeGreaterThan(subsequence!.score);
  });

  it('结果按得分降序排列', () => {
    const results = matchCandidates('s', candidates);
    for (let i = 1; i < results.length; i += 1) {
      expect(results[i - 1]!.score).toBeGreaterThanOrEqual(results[i]!.score);
    }
  });

  it('完全相等得分最高', () => {
    const results = matchCandidates('epoch', candidates);
    const exact = matchCandidates('timestamp', candidates);
    expect(results[0]?.id).toBe('timestamp');
    expect(exact[0]?.id).toBe('timestamp');
  });

  it('查询前后空白不影响匹配', () => {
    expect(matchCandidates('  epoch  ', candidates)[0]?.id).toBe('timestamp');
  });
});
