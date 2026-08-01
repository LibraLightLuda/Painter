import { decodeImageBlob } from '../src/images/decodeImage'

function bitmap(width = 320, height = 240): ImageBitmap {
  return { width, height, close: vi.fn() } as unknown as ImageBitmap
}

describe('decodeImageBlob', () => {
  it('retries createImageBitmap without options for older WebKit', async () => {
    const fallbackBitmap = bitmap()
    const createBitmap = vi.fn()
      .mockRejectedValueOnce(new TypeError('ImageBitmapOptions are not supported'))
      .mockResolvedValueOnce(fallbackBitmap)

    const decoded = await decodeImageBlob(new Blob(['png'], { type: 'image/png' }), {
      createBitmap,
      createImage: vi.fn(),
      createObjectURL: vi.fn(),
      revokeObjectURL: vi.fn(),
    })

    expect(createBitmap).toHaveBeenCalledTimes(2)
    expect(createBitmap.mock.calls[0][1]).toEqual({ imageOrientation: 'from-image' })
    expect(createBitmap.mock.calls[1][1]).toBeUndefined()
    expect(decoded.source).toBe(fallbackBitmap)
  })

  it('falls back to an image load when createImageBitmap and decode fail', async () => {
    const revokeObjectURL = vi.fn()
    const fakeImage = {
      decoding: 'auto',
      naturalWidth: 1080,
      naturalHeight: 1080,
      onload: null,
      onerror: null,
      decode: vi.fn().mockRejectedValue(new Error('Safari decode race')),
    } as unknown as HTMLImageElement
    Object.defineProperty(fakeImage, 'src', {
      set: () => queueMicrotask(() => fakeImage.onload?.(new Event('load'))),
    })

    const decoded = await decodeImageBlob(new Blob(['png'], { type: 'image/png' }), {
      createBitmap: vi.fn().mockRejectedValue(new Error('WebKit bitmap failure')),
      createImage: () => fakeImage,
      createObjectURL: () => 'blob:test',
      revokeObjectURL,
    })

    expect(decoded.width).toBe(1080)
    expect(decoded.height).toBe(1080)
    expect(revokeObjectURL).not.toHaveBeenCalled()
    decoded.release()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test')
  })
})
