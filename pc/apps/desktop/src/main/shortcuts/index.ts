import { globalShortcut } from 'electron';
import { defaultLauncherShortcut } from '@flow/core';

const FALLBACKS = ['Alt+Shift+Space', 'Ctrl+Alt+Space', 'Ctrl+Shift+Space'];

/**
 * 注册唤起快捷键。首选失败时依次尝试备选——某些键盘布局下默认组合
 * 按不出来，或已被其他应用占用（spec §9.3）。
 *
 * @returns 实际注册成功的快捷键，全部失败返回 null
 */
export function registerLauncherShortcut(onTrigger: () => void): string | null {
  const candidates = [defaultLauncherShortcut(process.platform), ...FALLBACKS];

  for (const accelerator of candidates) {
    if (globalShortcut.isRegistered(accelerator)) continue;

    if (globalShortcut.register(accelerator, onTrigger)) {
      return accelerator;
    }
  }

  return null;
}
