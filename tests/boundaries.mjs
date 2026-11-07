/**
 * Fronteras entre capas. No ejecuta nada, solo lee el código:
 *   node tests/boundaries.mjs
 *
 * `src/core` tiene que seguir siendo Node pelado, porque el servidor va a
 * importarlo tal cual y ahí no hay Electron ninguno. Y el renderer no puede
 * tocar la base: habla con el proceso principal y punto.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

let passed = 0
const failures = []

function check(name, condition, detail) {
  if (condition) { passed++; return }
  failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
}

const raiz = decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1')

/** Todos los ficheros de código bajo una carpeta, recursivamente. */
function sources(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) out.push(...sources(path))
    else if (/\.(ts|tsx)$/.test(entry)) out.push(path)
  }
  return out
}

/** Los módulos que importa un fichero. */
const imports = (path) =>
  [...readFileSync(path, 'utf8').matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1])

const relativo = (path) => path.slice(raiz.length).replace(/\\/g, '/')

/* ------------------------------------------------- core no sabe de Electron */
const core = sources(join(raiz, 'src', 'core'))
check('hay ficheros en src/core', core.length > 0, `encontrados ${core.length}`)

for (const path of core) {
  const malos = imports(path).filter((m) => m === 'electron' || m.startsWith('electron/'))
  check(`${relativo(path)} no importa Electron`, malos.length === 0, malos.join(', '))
}

for (const path of core) {
  const fuera = imports(path).filter((m) => m.includes('../main') || m.includes('../renderer') || m.includes('../preload'))
  check(`${relativo(path)} no sube a las capas de la app`, fuera.length === 0, fuera.join(', '))
}

/* ------------------------------------------ el renderer no toca los datos */
for (const path of sources(join(raiz, 'src', 'renderer'))) {
  const fuera = imports(path).filter((m) => m.includes('core/') || m === 'node:sqlite')
  check(`${relativo(path)} no toca la capa de datos`, fuera.length === 0, fuera.join(', '))
}

/* ----------------------------------------- solo db.ts abre la base */
// El resto de `core` importa el tipo `DatabaseSync`, que no deja rastro al
// compilar; lo que no puede estar en dos sitios es la apertura.
const abren = [...core, ...sources(join(raiz, 'src', 'main'))]
  .filter((path) => readFileSync(path, 'utf8').includes('new DatabaseSync('))
  .map(relativo)
check('solo db.ts abre la base', JSON.stringify(abren) === JSON.stringify(['src/core/db.ts']),
  `lo hacen ${abren.join(', ') || 'ninguno'}`)

console.log(`\n  ${passed} comprobaciones correctas`)
if (failures.length) {
  console.log(`  ${failures.length} FALLOS:`)
  for (const f of failures) console.log(`    ✗ ${f}`)
}
process.exit(failures.length ? 1 : 0)
