export interface DecodedImage {
  source: CanvasImageSource
  width: number
  height: number
  release: () => void
}

interface ImageDecodeEnvironment {
  createBitmap?: (blob: Blob, options?: ImageBitmapOptions) => Promise<ImageBitmap>
  createImage: () => HTMLImageElement
  createObjectURL: (blob: Blob) => string
  revokeObjectURL: (url: string) => void
}

function browserEnvironment(): ImageDecodeEnvironment {
  return {
    createBitmap: typeof window.createImageBitmap === 'function'
      ? (blob, options) => options
        ? window.createImageBitmap(blob, options)
        : window.createImageBitmap(blob)
      : undefined,
    createImage: () => new Image(),
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
  }
}

async function tryImageBitmap(
  blob: Blob,
  createBitmap?: ImageDecodeEnvironment['createBitmap'],
): Promise<DecodedImage | null> {
  if (!createBitmap) return null

  // WebKit 15 exposes createImageBitmap but rejects some otherwise valid
  // PNG/JPEG blobs when ImageBitmapOptions are supplied. Retry without the
  // options before falling back to the broadly supported HTMLImageElement.
  for (const options of [{ imageOrientation: 'from-image' } as ImageBitmapOptions, undefined]) {
    try {
      const bitmap = await createBitmap(blob, options)
      if (!bitmap.width || !bitmap.height) {
        bitmap.close()
        continue
      }
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      }
    } catch {
      // Continue to the optionless call or the HTML image fallback.
    }
  }
  return null
}

async function decodeHtmlImage(blob: Blob, environment: ImageDecodeEnvironment): Promise<DecodedImage> {
  const url = environment.createObjectURL(blob)
  const image = environment.createImage()
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('Image element could not decode the blob.'))
  })
  image.decoding = 'async'
  image.src = url

  try {
    if (typeof image.decode === 'function') {
      try {
        await image.decode()
      } catch {
        // Safari 15 can reject decode() while the normal load event succeeds.
        await loaded
      }
    } else {
      await loaded
    }
    if (!image.naturalWidth || !image.naturalHeight) {
      throw new Error('Image element reported an empty image.')
    }
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => environment.revokeObjectURL(url),
    }
  } catch (error) {
    environment.revokeObjectURL(url)
    throw error
  }
}

export async function decodeImageBlob(
  blob: Blob,
  environment: ImageDecodeEnvironment = browserEnvironment(),
): Promise<DecodedImage> {
  const bitmap = await tryImageBitmap(blob, environment.createBitmap)
  return bitmap ?? decodeHtmlImage(blob, environment)
}
