import { useCallback, useEffect, useState } from 'react';

export interface SearchHit {
  id: string;
  title: string;
  score: number;
}

declare global {
  interface Window {
    flow: {
      searchCommands: (query: string, locale: string) => Promise<SearchHit[]>;
      executeCommand: (id: string) => Promise<void>;
    };
  }
}

/**
 * 是否应触发检索。
 *
 * 输入法组合期间必须跳过：中日韩用户经 IME 输入，若在 composition
 * 未结束时就拿中间态（如拼音串 shijian）去匹配，结果列表会剧烈
 * 跳动（spec §9.2）。
 */
export function shouldSearch(state: { composing: boolean; value: string }): boolean {
  return !state.composing;
}

export function useCommandSearch(value: string, composing: boolean) {
  const [hits, setHits] = useState<SearchHit[]>([]);

  useEffect(() => {
    if (!shouldSearch({ composing, value })) return;

    let cancelled = false;
    const locale = navigator.language;

    window.flow
      .searchCommands(value, locale)
      .then((results) => {
        if (!cancelled) setHits(results);
      })
      .catch((error: unknown) => {
        // 检索失败不能让 launcher 卡死，降级为空结果（spec §13）
        console.error('[flow] 指令检索失败', error);
        if (!cancelled) setHits([]);
      });

    return () => {
      cancelled = true;
    };
  }, [value, composing]);

  const execute = useCallback(async (id: string) => {
    try {
      await window.flow.executeCommand(id);
    } catch (error: unknown) {
      console.error('[flow] 指令执行失败', error);
    }
  }, []);

  return { hits, execute };
}
