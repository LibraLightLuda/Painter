import { floodFillImageData } from '../src/drawing/renderer'

describe('flood fill', () => {
  it('fills a connected transparent area without crossing an opaque boundary', () => {
    const image = { data: new Uint8ClampedArray(3 * 3 * 4), width: 3, height: 3 } as ImageData
    for (let y = 0; y < 3; y += 1) {
      const offset = (y * 3 + 1) * 4
      image.data.set([0, 0, 0, 255], offset)
    }
    floodFillImageData(image, 0, 1, '#ff0000', 1, 0)
    expect([...image.data.slice((1 * 3 + 0) * 4, (1 * 3 + 0) * 4 + 4)]).toEqual([255, 0, 0, 255])
    expect([...image.data.slice((1 * 3 + 1) * 4, (1 * 3 + 1) * 4 + 4)]).toEqual([0, 0, 0, 255])
    expect([...image.data.slice((1 * 3 + 2) * 4, (1 * 3 + 2) * 4 + 4)]).toEqual([0, 0, 0, 0])
  })

  it('uses tolerance and requested alpha', () => {
    const image = { data: new Uint8ClampedArray([
      20, 20, 20, 255,
      24, 24, 24, 255,
    ]), width: 2, height: 1 } as ImageData
    floodFillImageData(image, 0, 0, '#246bce', 0.5, 5)
    expect([...image.data.slice(4, 8)]).toEqual([36, 107, 206, 128])
  })
})
