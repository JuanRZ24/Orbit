import { app, shell, BrowserWindow, ipcMain, Menu, dialog, nativeTheme } from 'electron'
import { join } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { openDatabase, closeDatabase, getMeta, setMeta } from './db'
import { api, type ApiMethod } from './api'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const saved = (() => {
    try {
      return JSON.parse(getMeta('windowBounds') ?? '{}') as { width?: number; height?: number; x?: number; y?: number }
    } catch {
      return {}
    }
  })()

  mainWindow = new BrowserWindow({
    width: saved.width ?? 1440,
    height: saved.height ?? 900,
    x: saved.x,
    y: saved.y,
    minWidth: 900,
    minHeight: 620,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0f1115',
    title: 'Orbit',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true
    }
  })

  // En algunos entornos de Linux `ready-to-show` no llega, así que el primer
  // evento que ocurra revela la ventana.
  const reveal = (): void => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) mainWindow.show()
  }
  mainWindow.on('ready-to-show', reveal)
  mainWindow.webContents.once('did-finish-load', () => {
    reveal()
    // Gancho de captura para desarrollo; inerte si la variable no está puesta.
    if (process.env.ORBIT_DEV_CAPTURE && mainWindow) {
      void import('./devtools').then((m) => m.runCapture(mainWindow!))
    }
  })

  const persistBounds = (): void => {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized()) return
    setMeta('windowBounds', JSON.stringify(mainWindow.getNormalBounds()))
  }
  mainWindow.on('resized', persistBounds)
  mainWindow.on('moved', persistBounds)
  mainWindow.on('closed', () => { mainWindow = null })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/** Envía una orden de menú al renderer. */
function emit(channel: string, payload?: unknown): void {
  mainWindow?.webContents.send('menu', { channel, payload })
}

function buildMenu(): void {
  const isMac = process.platform === 'darwin'
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'Archivo',
      submenu: [
        { label: 'Nuevo proyecto…', accelerator: 'CmdOrCtrl+Shift+N', click: () => emit('project.new') },
        { label: 'Nueva historia…', accelerator: 'CmdOrCtrl+N', click: () => emit('story.new') },
        { type: 'separator' },
        { label: 'Exportar datos…', click: () => exportData() },
        { label: 'Importar datos…', click: () => importData() },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit', label: 'Salir' }
      ]
    },
    {
      label: 'Editar',
      submenu: [
        { role: 'undo', label: 'Deshacer' }, { role: 'redo', label: 'Rehacer' }, { type: 'separator' },
        { role: 'cut', label: 'Cortar' }, { role: 'copy', label: 'Copiar' }, { role: 'paste', label: 'Pegar' },
        { role: 'selectAll', label: 'Seleccionar todo' }, { type: 'separator' },
        { label: 'Buscar…', accelerator: 'CmdOrCtrl+K', click: () => emit('search.open') }
      ]
    },
    {
      label: 'Ver',
      submenu: [
        { label: 'Resumen', accelerator: 'CmdOrCtrl+1', click: () => emit('view', 'dashboard') },
        { label: 'Backlog', accelerator: 'CmdOrCtrl+2', click: () => emit('view', 'backlog') },
        { label: 'Sprint', accelerator: 'CmdOrCtrl+3', click: () => emit('view', 'sprint') },
        { label: 'Tablero', accelerator: 'CmdOrCtrl+4', click: () => emit('view', 'kanban') },
        { label: 'Incidencias', accelerator: 'CmdOrCtrl+5', click: () => emit('view', 'issues') },
        { label: 'Épicas', accelerator: 'CmdOrCtrl+6', click: () => emit('view', 'epics') },
        { label: 'Wiki', accelerator: 'CmdOrCtrl+7', click: () => emit('view', 'wiki') },
        { type: 'separator' },
        { role: 'reload', label: 'Recargar' },
        { role: 'toggleDevTools', label: 'Herramientas de desarrollo' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Zoom normal' }, { role: 'zoomIn', label: 'Acercar' }, { role: 'zoomOut', label: 'Alejar' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Pantalla completa' }
      ]
    },
    {
      label: 'Ayuda',
      submenu: [
        { label: 'Atajos de teclado', click: () => emit('help.shortcuts') },
        {
          label: 'Carpeta de datos',
          click: () => shell.openPath(app.getPath('userData'))
        }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

async function exportData(): Promise<void> {
  if (!mainWindow) return
  const stamp = new Date().toISOString().slice(0, 10)
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Exportar datos de Orbit',
    defaultPath: join(app.getPath('documents'), `orbit-${stamp}.json`),
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })
  if (canceled || !filePath) return
  writeFileSync(filePath, api['data.export'](), 'utf8')
  emit('toast', { kind: 'ok', message: `Datos exportados a ${filePath}` })
}

async function importData(): Promise<void> {
  if (!mainWindow) return
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Importar datos de Orbit',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })
  if (canceled || !filePaths[0]) return
  const choice = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons: ['Cancelar', 'Añadir a lo que ya hay', 'Reemplazar todo'],
    defaultId: 1,
    cancelId: 0,
    message: '¿Cómo quieres importar?',
    detail: 'Reemplazar todo borra los proyectos actuales antes de importar.'
  })
  if (choice.response === 0) return
  try {
    const result = api['data.import'](readFileSync(filePaths[0], 'utf8'), choice.response === 2 ? 'replace' : 'merge')
    emit('toast', { kind: 'ok', message: `Importados ${result.projects} proyecto(s)` })
    emit('data.reload')
  } catch (error) {
    emit('toast', { kind: 'error', message: `No se pudo importar: ${(error as Error).message}` })
  }
}

app.whenReady().then(() => {
  nativeTheme.themeSource = 'dark'
  openDatabase(app.getPath('userData'))

  ipcMain.handle('api', (_event, method: ApiMethod, args: unknown[]) => {
    const fn = api[method] as ((...a: unknown[]) => unknown) | undefined
    if (typeof fn !== 'function') throw new Error(`Método desconocido: ${String(method)}`)
    return fn(...args)
  })

  ipcMain.handle('app.info', () => ({
    version: app.getVersion(),
    dataPath: app.getPath('userData'),
    platform: process.platform
  }))

  ipcMain.handle('app.export', () => exportData())
  ipcMain.handle('app.import', () => importData())

  buildMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => closeDatabase())
