import { hexToHsl, hslToHex, normalizeHex } from '../src/color/color'

describe('color helpers', () => {
  it('normalizes short and full hex colors', () => {
    expect(normalizeHex('#F60')).toBe('#ff6600')
    expect(normalizeHex('#246BCE')).toBe('#246bce')
    expect(normalizeHex('red')).toBeNull()
  })

  it('round trips representative HSL colors', () => {
    for (const color of ['#ff0000', '#21845b', '#246bce', '#ffffff', '#1e1f1d']) {
      const result = hslToHex(hexToHsl(color))
      const channels = [1, 3, 5].map((index) => Math.abs(
        Number.parseInt(result.slice(index, index + 2), 16) - Number.parseInt(color.slice(index, index + 2), 16),
      ))
      expect(Math.max(...channels)).toBeLessThanOrEqual(2)
    }
  })
})
