import { describe, expect, it, vi } from 'vitest';
import { CommandRegistry, type HostCommand } from './registry';

function makeCommand(id: string, overrides: Partial<HostCommand> = {}): HostCommand {
  return {
    id,
    title: { en: id, 'zh-CN': id },
    keywords: { en: [id], 'zh-CN': [id] },
    run: vi.fn(),
    ...overrides,
  };
}

describe('CommandRegistry', () => {
  it('注册后可被检索到', () => {
    const registry = new CommandRegistry();
    registry.register(makeCommand('settings'));
    expect(registry.search('settings', 'en')).toHaveLength(1);
  });

  it('重复 id 注册抛错', () => {
    const registry = new CommandRegistry();
    registry.register(makeCommand('dup'));
    expect(() => registry.register(makeCommand('dup'))).toThrow(/已注册/);
  });

  it('检索结果带按 locale 解析好的显示名', () => {
    const registry = new CommandRegistry();
    registry.register(
      makeCommand('theme', {
        title: { en: 'Toggle Theme', 'zh-CN': '切换主题' },
        keywords: { en: ['theme'], 'zh-CN': ['zhuti'] },
      }),
    );
    expect(registry.search('theme', 'zh-CN')[0]?.title).toBe('切换主题');
    expect(registry.search('theme', 'en')[0]?.title).toBe('Toggle Theme');
  });

  it('中文关键词在中文 locale 下可命中', () => {
    const registry = new CommandRegistry();
    registry.register(
      makeCommand('theme', {
        title: { en: 'Toggle Theme', 'zh-CN': '切换主题' },
        keywords: { en: ['theme'], 'zh-CN': ['主题', 'zhuti'] },
      }),
    );
    expect(registry.search('主题', 'zh-CN')).toHaveLength(1);
  });

  it('英文关键词在中文 locale 下也可命中', () => {
    const registry = new CommandRegistry();
    registry.register(
      makeCommand('theme', {
        title: { en: 'Toggle Theme', 'zh-CN': '切换主题' },
        keywords: { en: ['theme'], 'zh-CN': ['主题'] },
      }),
    );
    expect(registry.search('theme', 'zh-CN')).toHaveLength(1);
  });

  it('空查询返回全部指令', () => {
    const registry = new CommandRegistry();
    registry.register(makeCommand('a'));
    registry.register(makeCommand('b'));
    expect(registry.search('', 'en')).toHaveLength(2);
  });

  it('execute 调用对应指令的 run', async () => {
    const registry = new CommandRegistry();
    const run = vi.fn();
    registry.register(makeCommand('quit', { run }));
    await registry.execute('quit');
    expect(run).toHaveBeenCalledOnce();
  });

  it('execute 未知 id 抛错', async () => {
    const registry = new CommandRegistry();
    await expect(registry.execute('missing')).rejects.toThrow(/未找到/);
  });

  it('单个指令抛错不影响注册表可用性', async () => {
    const registry = new CommandRegistry();
    registry.register(
      makeCommand('boom', {
        run: () => {
          throw new Error('炸了');
        },
      }),
    );
    registry.register(makeCommand('ok'));
    await expect(registry.execute('boom')).rejects.toThrow('炸了');
    expect(registry.search('ok', 'en')).toHaveLength(1);
  });
});
