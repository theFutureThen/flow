import { BrowserWindow, screen } from 'electron';
import path from 'node:path';

const WIDTH = 680;
const HEIGHT = 420;

/**
 * launcher 窗口：无边框、置顶、不进任务栏，失焦即隐藏。
 *
 * 只创建一次、反复显隐，而非反复创建——重建会丢输入焦点且有可见
 * 延迟，而 launcher 的核心体验就是"按下快捷键立刻能打字"。
 */
export class LauncherWindow {
  #window: BrowserWindow | null = null;

  #create(): BrowserWindow {
    const window = new BrowserWindow({
      width: WIDTH,
      height: HEIGHT,
      frame: false,
      resizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      show: false,
      webPreferences: {
        // 输出文件名由 forge.config.ts 的 preload entry 决定：
        // entry 为 src/preload/host.ts 时产物是 host.js，不是 preload.js
        preload: path.join(__dirname, 'host.js'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    });

    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      void window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    } else {
      void window.loadFile(
        path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
      );
    }

    window.on('blur', () => window.hide());
    window.on('closed', () => {
      this.#window = null;
    });

    return window;
  }

  /** 在鼠标所在显示器居中偏上显示——多显示器下必须跟随当前屏 */
  #positionOnActiveDisplay(window: BrowserWindow): void {
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const { x, y, width, height } = display.workArea;

    window.setPosition(
      Math.round(x + (width - WIDTH) / 2),
      Math.round(y + (height - HEIGHT) / 3),
    );
  }

  toggle(): void {
    this.#window ??= this.#create();

    if (this.#window.isVisible()) {
      this.#window.hide();
      return;
    }

    this.#positionOnActiveDisplay(this.#window);
    this.#window.show();
    this.#window.focus();
  }
}
