import { describe, expect, it } from 'vitest'
import { builtinImages } from '../src/images/builtinImages'

describe('built-in coloring images', () => {
  it('discovers the sampleImg assets with stable labels', () => {
    expect(builtinImages.map((item) => item.id)).toEqual(expect.arrayContaining([
      '01-flower-teapot',
      '10-woodland-fairy-garden',
      '15-balcony-watering',
      '25-rustic-bridge',
      'happy-cat',
      'rocket-space',
      'flower-garden',
    ]))
    expect(builtinImages.length).toBeGreaterThanOrEqual(28)
    expect(new Set(builtinImages.map((item) => item.id)).size).toBe(builtinImages.length)
    expect(builtinImages.every((item) => item.title && item.url && item.thumbnailUrl)).toBe(true)
  })

  it('uses lightweight thumbnails for raster coloring pages', () => {
    const rasterImages = builtinImages.filter((item) => /^\d{2}-/.test(item.id))
    expect(rasterImages.length).toBeGreaterThanOrEqual(25)
    expect(rasterImages.every((item) => item.thumbnailUrl !== item.url)).toBe(true)
  })
})
