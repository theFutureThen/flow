import { matchCandidates, type MatchCandidate } from '@flow/core';
import {
  keywordsForLocale,
  resolveLocalized,
  type Locale,
  type LocalizedKeywords,
  type LocalizedString,
} from '@flow/plugin-protocol';

export interface HostCommand {
  id: string;
  title: LocalizedString;
  keywords: LocalizedKeywords;
  run: () => void | Promise<void>;
}

export interface SearchHit {
  id: string;
  title: string;
  score: number;
}

/**
 * 全局指令索引。本阶段只承载宿主自身动作；插件贡献的静态指令与
 * 运行时动态指令后续接入同一个注册表，检索时不区分出身（spec §6.1）。
 */
export class CommandRegistry {
  readonly #commands = new Map<string, HostCommand>();

  register(command: HostCommand): void {
    if (this.#commands.has(command.id)) {
      throw new Error(`指令 ${command.id} 已注册`);
    }
    this.#commands.set(command.id, command);
  }

  search(query: string, locale: Locale): SearchHit[] {
    const candidates: MatchCandidate[] = [];
    const titles = new Map<string, string>();

    for (const command of this.#commands.values()) {
      const title = resolveLocalized(command.title, [locale]);
      titles.set(command.id, title);
      candidates.push({
        id: command.id,
        title,
        keywords: keywordsForLocale(command.keywords, locale),
      });
    }

    return matchCandidates(query, candidates).map((result) => ({
      id: result.id,
      title: titles.get(result.id) ?? result.id,
      score: result.score,
    }));
  }

  async execute(id: string): Promise<void> {
    const command = this.#commands.get(id);
    if (command === undefined) {
      throw new Error(`未找到指令 ${id}`);
    }
    await command.run();
  }
}
