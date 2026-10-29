import { app, BrowserWindow } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { api } from './api'

/**
 * Utilidades sólo para desarrollo: se cargan con import() dinámico y únicamente
 * cuando ORBIT_DEV_CAPTURE está definido, así no entran en el arranque normal.
 *
 *   ORBIT_DEV_SEED=1 ORBIT_DEV_CAPTURE=/ruta ORBIT_DEV_VIEWS="Backlog,Tablero" electron .
 */
export async function runCapture(window: BrowserWindow): Promise<void> {
  const outDir = process.env.ORBIT_DEV_CAPTURE
  if (!outDir) return
  mkdirSync(outDir, { recursive: true })

  if (process.env.ORBIT_DEV_SEED && api['project.list']().length === 0) {
    api['project.seedDemo']()
    await window.webContents.executeJavaScript('location.reload()').catch(() => undefined)
  }

  const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
  await wait(2500)

  const views = (process.env.ORBIT_DEV_VIEWS ?? 'Resumen').split(',').map((v) => v.trim()).filter(Boolean)
  for (const label of views) {
    await window.webContents.executeJavaScript(
      `(() => { const b = [...document.querySelectorAll('button')]
         .find((x) => x.textContent.trim().startsWith(${JSON.stringify(label)}));
         if (b) b.click(); return !!b })()`
    ).catch(() => false)
    await wait(900)
    const image = await window.webContents.capturePage()
    writeFileSync(join(outDir, `${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`), image.toPNG())
  }
  app.exit(0)
}
