import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const crcTable = new Uint32Array(256)
for (let n = 0; n < 256; n += 1) {
  let c = n
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  crcTable[n] = c >>> 0
}

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const name = Buffer.from(type)
  const size = Buffer.alloc(4)
  size.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])))
  return Buffer.concat([size, name, data, crc])
}

function createIcon(size, maskable = false) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  const bg = [247, 243, 234, 255]
  const ink = [30, 31, 29, 255]
  const accent = [239, 103, 65, 255]
  const center = size / 2
  const safe = maskable ? size * 0.26 : size * 0.17

  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0
    for (let x = 0; x < size; x += 1) {
      const offset = y * (size * 4 + 1) + 1 + x * 4
      const rounded = Math.hypot(Math.max(Math.abs(x - center) - (center - safe), 0), Math.max(Math.abs(y - center) - (center - safe), 0))
      let color = rounded < size * 0.12 ? bg : [226, 220, 207, 255]

      const t = (x - size * 0.24) / (size * 0.52)
      const curveY = size * (0.66 - 0.28 * Math.sin(Math.max(0, Math.min(1, t)) * Math.PI))
      const distance = Math.abs(y - curveY)
      if (x > size * 0.2 && x < size * 0.82 && distance < size * 0.045) color = ink
      if (Math.hypot(x - size * 0.73, y - size * 0.3) < size * 0.085) color = accent

      raw.set(color, offset)
    }
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr.set([8, 6, 0, 0, 0], 8)
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const publicDir = resolve('public')
writeFileSync(resolve(publicDir, 'icon-192.png'), createIcon(192))
writeFileSync(resolve(publicDir, 'icon-512.png'), createIcon(512))
writeFileSync(resolve(publicDir, 'icon-maskable-512.png'), createIcon(512, true))
