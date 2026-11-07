/**
 * Genera build/icon.png sin dependencias: solo zlib, que viene con Node.
 *   node build/make-icon.mjs
 *
 * Un planeta con su anillo, y el anillo pasa por delante abajo y por detrás
 * arriba. Esa oclusión es lo que hace que se lea como una órbita y no como un
 * ojo. Se dibuja a 4x y se promedia para que los bordes salgan suaves.
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// `node build/make-icon.mjs [tamaño] [destino]`. Los tamaños chicos sirven
// para comprobar que el icono se sigue leyendo en la barra de tareas.
const SIZE = Number(process.argv[2]) || 512
const SALIDA = process.argv[3] ?? 'icon.png'
const SS = 4

/* ------------------------------------------------------------- la escena */

const BG = [20, 23, 31]
const RING = [99, 102, 241]
const RING_FRONT = [129, 132, 248]
const PLANET = [236, 72, 153]
const GLOW = [49, 46, 129]
const MOON = [199, 210, 254]

const ANGLE = (-22 * Math.PI) / 180
const COS = Math.cos(ANGLE)
const SIN = Math.sin(ANGLE)

const RX = 0.380
const RY = 0.145
const RING_W = 0.030
const PLANET_R = 0.190
const GLOW_R = 0.330
const MOON_T = (212 * Math.PI) / 180
const MOON_R = 0.044

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

/** Cobertura de un borde situado a distancia `d`, con un píxel de difuminado. */
const cover = (d, suave) => clamp01(0.5 - d / suave)

const mix = (dst, src, a) => [
  dst[0] + (src[0] - dst[0]) * a,
  dst[1] + (src[1] - dst[1]) * a,
  dst[2] + (src[2] - dst[2]) * a
]

/** Distancia con signo a un cuadrado de esquinas redondeadas, centrado en 0. */
function sdfRoundedSquare(x, y, half, r) {
  const dx = Math.abs(x) - (half - r)
  const dy = Math.abs(y) - (half - r)
  const fuera = Math.hypot(Math.max(dx, 0), Math.max(dy, 0))
  return fuera + Math.min(Math.max(dx, dy), 0) - r
}

/**
 * Distancia aproximada al borde de una elipse. Dividir por el gradiente es lo
 * que mantiene el grosor del anillo parejo en todo su recorrido.
 */
function sdfEllipse(x, y, rx, ry) {
  const f = (x * x) / (rx * rx) + (y * y) / (ry * ry) - 1
  const gx = (2 * x) / (rx * rx)
  const gy = (2 * y) / (ry * ry)
  const g = Math.hypot(gx, gy)
  return g === 0 ? -Math.min(rx, ry) : f / g
}

/** Color y opacidad de un punto, en coordenadas [-0.5, 0.5]. */
function muestra(x, y) {
  const suave = 1 / SIZE

  const dentro = cover(sdfRoundedSquare(x, y, 0.47, 0.105), suave)
  if (dentro <= 0) return null

  let color = BG

  // Un resplandor suave detrás del planeta, para que no quede plano.
  const dist = Math.hypot(x, y)
  if (dist < GLOW_R) {
    const t = 1 - dist / GLOW_R
    color = mix(color, GLOW, t * t * 0.55)
  }

  // Coordenadas del anillo: la elipse vive sin inclinar y se gira el punto.
  const lx = x * COS + y * SIN
  const ly = -x * SIN + y * COS
  const anillo = cover(Math.abs(sdfEllipse(lx, ly, RX, RY)) - RING_W / 2, suave)
  const delante = ly > 0

  // Detrás del planeta primero: así el planeta lo tapa.
  if (anillo > 0 && !delante) color = mix(color, RING, anillo)

  const planeta = cover(dist - PLANET_R, suave)
  if (planeta > 0) color = mix(color, PLANET, planeta)

  // Y lo que pasa por delante se pinta encima del planeta, un punto más claro
  // porque está más cerca.
  if (anillo > 0 && delante) color = mix(color, RING_FRONT, anillo)

  // La luna, sobre el anillo, en la parte de delante.
  const mx = RX * Math.cos(MOON_T)
  const my = RY * Math.sin(MOON_T)
  const luna = cover(Math.hypot(lx - mx, ly - my) - MOON_R, suave)
  if (luna > 0) color = mix(color, MOON, luna)

  return [color[0], color[1], color[2], dentro * 255]
}

/* ---------------------------------------------------------------- pintar */

const pixeles = Buffer.alloc(SIZE * SIZE * 4)
const paso = 1 / (SIZE * SS)

for (let py = 0; py < SIZE; py++) {
  for (let px = 0; px < SIZE; px++) {
    let r = 0
    let g = 0
    let b = 0
    let a = 0
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const x = (px + (sx + 0.5) / SS) / SIZE - 0.5
        const y = (py + (sy + 0.5) / SS) / SIZE - 0.5
        const m = muestra(x, y, paso)
        if (!m) continue
        // Premultiplicado, si no los bordes se ensucian al promediar.
        const k = m[3] / 255
        r += m[0] * k
        g += m[1] * k
        b += m[2] * k
        a += m[3]
      }
    }
    const n = SS * SS
    const alfa = a / n
    const i = (py * SIZE + px) * 4
    if (alfa > 0) {
      const k = alfa / 255
      pixeles[i] = Math.round(r / n / k)
      pixeles[i + 1] = Math.round(g / n / k)
      pixeles[i + 2] = Math.round(b / n / k)
    }
    pixeles[i + 3] = Math.round(alfa)
  }
}

/* ------------------------------------------------------------------- png */

const TABLA = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = TABLA[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(tipo, datos) {
  const largo = Buffer.alloc(4)
  largo.writeUInt32BE(datos.length)
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(cuerpo))
  return Buffer.concat([largo, cuerpo, crc])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8 // bits por canal
ihdr[9] = 6 // RGBA
// 10, 11, 12 quedan en 0: deflate, filtro adaptativo, sin entrelazar.

// Cada línea va precedida de su byte de filtro; 0 es "sin filtrar".
const crudo = Buffer.alloc(SIZE * (SIZE * 4 + 1))
for (let y = 0; y < SIZE; y++) {
  crudo[y * (SIZE * 4 + 1)] = 0
  pixeles.copy(crudo, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4)
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(crudo, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
])

// Relativo a este fichero, o absoluto si se pasa uno.
const destino = resolve(fileURLToPath(new URL('.', import.meta.url)), SALIDA)
writeFileSync(destino, png)
console.log(`${SALIDA} ${SIZE}x${SIZE}, ${(png.length / 1024).toFixed(1)} kB`)
