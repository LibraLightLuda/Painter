export interface HslColor {
  h: number
  s: number
  l: number
}

export function normalizeHex(color: string): string | null {
  const value = color.trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(value)) return value
  if (/^#[0-9a-f]{3}$/.test(value)) {
    return `#${value.slice(1).split('').map((part) => part + part).join('')}`
  }
  return null
}

export function hexToHsl(color: string): HslColor {
  const normalized = normalizeHex(color) ?? '#000000'
  const red = Number.parseInt(normalized.slice(1, 3), 16) / 255
  const green = Number.parseInt(normalized.slice(3, 5), 16) / 255
  const blue = Number.parseInt(normalized.slice(5, 7), 16) / 255
  const maximum = Math.max(red, green, blue)
  const minimum = Math.min(red, green, blue)
  const lightness = (maximum + minimum) / 2
  const delta = maximum - minimum
  if (delta === 0) return { h: 0, s: 0, l: Math.round(lightness * 100) }
  const saturation = delta / (1 - Math.abs(2 * lightness - 1))
  let hue = 0
  if (maximum === red) hue = 60 * (((green - blue) / delta) % 6)
  else if (maximum === green) hue = 60 * ((blue - red) / delta + 2)
  else hue = 60 * ((red - green) / delta + 4)
  return {
    h: Math.round((hue + 360) % 360),
    s: Math.round(saturation * 100),
    l: Math.round(lightness * 100),
  }
}

export function hslToHex({ h, s, l }: HslColor): string {
  const hue = ((h % 360) + 360) % 360
  const saturation = Math.min(100, Math.max(0, s)) / 100
  const lightness = Math.min(100, Math.max(0, l)) / 100
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const section = hue / 60
  const secondary = chroma * (1 - Math.abs((section % 2) - 1))
  let [red, green, blue] = [0, 0, 0]
  if (section < 1) [red, green] = [chroma, secondary]
  else if (section < 2) [red, green] = [secondary, chroma]
  else if (section < 3) [green, blue] = [chroma, secondary]
  else if (section < 4) [green, blue] = [secondary, chroma]
  else if (section < 5) [red, blue] = [secondary, chroma]
  else [red, blue] = [chroma, secondary]
  const match = lightness - chroma / 2
  return `#${[red, green, blue]
    .map((channel) => Math.round((channel + match) * 255).toString(16).padStart(2, '0'))
    .join('')}`
}
