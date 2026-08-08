import { app, globalShortcut, ipcMain } from 'electron';
import started from 'electron-squirrel-startup';
import { CommandRegistry } from './commands/registry';
import { registerLauncherShortcut } from './shortcuts';
import { LauncherWindow } from './windows/launcher-window';

if (started) app.quit();

const registry = new CommandRegistry();
const launcher = new LauncherWindow();

function registerHostCommands(): void {
  registry.register({
    id: 'host.quit',
    title: { en: 'Quit flow', 'zh-CN': '退出 flow' },
    keywords: { en: ['quit', 'exit'], 'zh-CN': ['退出', 'tuichu', 'tc'] },
    run: () => app.quit(),
  });

  registry.register({
    id: 'host.reload',
    title: { en: 'Reload flow', 'zh-CN': '重新加载' },
    keywords: { en: ['reload', 'restart'], 'zh-CN': ['重新加载', 'chongxin', 'cx'] },
    run: () => {
      app.relaunch();
      app.quit();
    },
  });
}

function registerIpc(): void {
  ipcMain.handle('commands:search', (_event, query: unknown, locale: unknown) => {
    if (typeof query !== 'string' || typeof locale !== 'string') {
      throw new Error('commands:search 参数非法');
    }
    return registry.search(query, locale);
  });

  ipcMain.handle('commands:execute', async (_event, id: unknown) => {
    if (typeof id !== 'string') throw new Error('commands:execute 参数非法');
    await registry.execute(id);
  });
}

void app.whenReady().then(() => {
  registerHostCommands();
  registerIpc();

  const accelerator = registerLauncherShortcut(() => launcher.toggle());
  if (accelerator === null) {
    console.error('[flow] 所有候选快捷键均注册失败，launcher 无法通过快捷键唤起');
  } else {
    console.log(`[flow] launcher 快捷键已注册：${accelerator}`);
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// launcher 型应用关掉窗口不退出，常驻后台等待快捷键唤起
app.on('window-all-closed', () => {
  // 有意为空：与普通应用不同，这里不调用 app.quit()
});
