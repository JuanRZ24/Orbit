#!/usr/bin/env python3
"""Genera build/icon.png sin dependencias externas.

Dibuja a 4x y reduce por promedio para obtener bordes suaves.
    python3 build/make-icon.py
"""
import math
import struct
import zlib
from pathlib import Path

SIZE = 512
SS = 4                      # factor de supermuestreo
N = SIZE * SS

BG = (21, 24, 31)           # panel
RING = (99, 102, 241)       # indigo
PLANET = (236, 72, 153)     # rosa
GLOW = (49, 46, 129)


def rounded_square(x, y, r):
    """Distancia con signo a un cuadrado de esquinas redondeadas centrado."""
    half = N * 0.5 - N * 0.03
    dx = abs(x - N / 2) - (half - r)
    dy = abs(y - N / 2) - (half - r)
    outside = math.hypot(max(dx, 0), max(dy, 0))
    return outside + min(max(dx, dy), 0) - r


def blend(dst, src, a):
    return tuple(round(d + (s - d) * a) for d, s in zip(dst, src))


rows = []
cx = cy = N / 2
ring_rx, ring_ry = N * 0.345, N * 0.205
ring_w = N * 0.038
angle = math.radians(-24)
cos_a, sin_a = math.cos(angle), math.sin(angle)
planet_r = N * 0.115

for py in range(N):
    row = bytearray()
    for px in range(N):
        x, y = px + 0.5, py + 0.5
        if rounded_square(x, y, N * 0.16) > 0:
            row += bytes((0, 0, 0, 0))
            continue

        color = BG
        # halo suave hacia el centro
        d_center = math.hypot(x - cx, y - cy) / (N * 0.5)
        color = blend(color, GLOW, max(0.0, 0.22 * (1 - d_center)))

        # anillo elíptico inclinado
        rx = (x - cx) * cos_a + (y - cy) * sin_a
        ry = -(x - cx) * sin_a + (y - cy) * cos_a
        e = math.hypot(rx / ring_rx, ry / ring_ry)
        edge = abs(e - 1.0) * min(ring_rx, ring_ry)
        if edge < ring_w:
            color = blend(color, RING, 1.0)

        # planeta central
        if math.hypot(x - cx, y - cy) < planet_r:
            color = blend(color, PLANET, 1.0)

        row += bytes((*color, 255))
    rows.append(row)

# reducción por promedio de bloques SS x SS
out = []
for y in range(SIZE):
    line = bytearray()
    for x in range(SIZE):
        acc = [0, 0, 0, 0]
        for dy in range(SS):
            src = rows[y * SS + dy]
            base = (x * SS) * 4
            for dx in range(SS):
                off = base + dx * 4
                for c in range(4):
                    acc[c] += src[off + c]
        line += bytes(v // (SS * SS) for v in acc)
    out.append(line)

raw = b''.join(b'\x00' + bytes(line) for line in out)


def chunk(tag, data):
    return (struct.pack('>I', len(data)) + tag + data
            + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF))


png = (b'\x89PNG\r\n\x1a\n'
       + chunk(b'IHDR', struct.pack('>IIBBBBB', SIZE, SIZE, 8, 6, 0, 0, 0))
       + chunk(b'IDAT', zlib.compress(raw, 9))
       + chunk(b'IEND', b''))

Path(__file__).with_name('icon.png').write_bytes(png)
print(f'build/icon.png  {len(png) // 1024} KB')
