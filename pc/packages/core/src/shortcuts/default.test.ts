import { describe, expect, it } from 'vitest';
import { defaultLauncherShortcut } from './default';

describe('defaultLauncherShortcut', () => {
  it('macOS 用 Option+Space', () => {
    expect(defaultLauncherShortcut('darwin')).toBe('Option+Space');
  });

  it('macOS 默认值绝不能占用 Spotlight 的 Cmd+Space', () => {
    const shortcut = defaultLauncherShortcut('darwin');
    expect(shortcut).not.toContain('Command');
    expect(shortcut).not.toContain('Cmd');
  });

  it('Windows 用 Alt+Space', () => {
    expect(defaultLauncherShortcut('win32')).toBe('Alt+Space');
  });

  it('Linux 用 Alt+Space', () => {
    expect(defaultLauncherShortcut('linux')).toBe('Alt+Space');
  });

  it('未知平台回退到 Alt+Space', () => {
    expect(defaultLauncherShortcut('freebsd')).toBe('Alt+Space');
  });
});
