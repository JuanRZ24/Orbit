import { contextBridge, ipcRenderer } from 'electron'

export interface MenuMessage {
  channel: string
  payload?: unknown
}

const orbit = {
  /** Invoca cualquier método del API del proceso principal. */
  call: <T = unknown>(method: string, ...args: unknown[]): Promise<T> =>
    ipcRenderer.invoke('api', method, args) as Promise<T>,
  info: (): Promise<{ version: string; dataPath: string; platform: string }> => ipcRenderer.invoke('app.info'),
  exportData: (): Promise<void> => ipcRenderer.invoke('app.export'),
  importData: (): Promise<void> => ipcRenderer.invoke('app.import'),
  /** Suscribe a las órdenes que llegan del menú nativo. */
  onMenu: (handler: (message: MenuMessage) => void): (() => void) => {
    const listener = (_e: unknown, message: MenuMessage): void => handler(message)
    ipcRenderer.on('menu', listener)
    return () => ipcRenderer.removeListener('menu', listener)
  }
}

contextBridge.exposeInMainWorld('orbit', orbit)

export type OrbitBridge = typeof orbit
