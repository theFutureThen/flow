/**
 * 各平台的 launcher 唤起默认快捷键。
 *
 * macOS 上 Cmd+Space 被 Spotlight 占用，绝不能作默认值。
 *
 * 这里只解决平台差异。键盘布局差异（AZERTY、JIS 等布局下某些组合
 * 按不出来）需要在注册失败时提供备选，属 spec §9.3 范围，由主进程
 * 的注册逻辑处理。
 */
export function defaultLauncherShortcut(platform: string): string {
  return platform === 'darwin' ? 'Option+Space' : 'Alt+Space';
}
