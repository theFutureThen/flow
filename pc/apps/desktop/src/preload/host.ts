import { contextBridge, ipcRenderer } from 'electron';

export interface SearchHit {
  id: string;
  title: string;
  score: number;
}

/**
 * 宿主渲染层的受控 API。
 *
 * 只暴露显式定义的方法，不透传 ipcRenderer 本身——否则渲染层可以
 * 调用任意 channel，contextIsolation 就形同虚设。
 */
contextBridge.exposeInMainWorld('flow', {
  searchCommands: (query: string, locale: string): Promise<SearchHit[]> =>
    ipcRenderer.invoke('commands:search', query, locale),
  executeCommand: (id: string): Promise<void> =>
    ipcRenderer.invoke('commands:execute', id),
});
