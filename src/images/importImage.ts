export interface PreparedImage {
  blob: Blob
  width: number
  height: number
  originalWidth: number
  originalHeight: number
  optimized: boolean
}

interface DecodedImage {
  source: CanvasImageSource
  width: number
  height: number
  release: () => void
}

async function decodeImage(blob: Blob): Promise<DecodedImage> {
  if ('createImageBitmap' in window) {
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' })
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      release: () => bitmap.close(),
    }
  }

  const url = URL.createObjectURL(blob)
  const image = new Image()
  image.decoding = 'async'
  image.src = url
  try {
    await image.decode()
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
  return {
    source: image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    release: () => URL.revokeObjectURL(url),
  }
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('이미지 최적화에 실패했습니다.'))
    }, type, quality)
  })
}

export async function prepareImage(
  blob: Blob,
  maxLongEdge = 4096,
  maxPixels = 16_000_000,
): Promise<PreparedImage> {
  if (blob.size === 0) throw new Error('빈 이미지 파일입니다.')
  if (blob.type && !blob.type.startsWith('image/')) {
    throw new Error('이미지 파일만 불러올 수 있습니다.')
  }

  let decoded: DecodedImage
  try {
    decoded = await decodeImage(blob)
  } catch {
    throw new Error('이 이미지를 열 수 없어요. PNG 또는 JPEG로 바꾼 뒤 다시 시도해 주세요.')
  }

  try {
    const { width, height } = decoded
    if (!width || !height) throw new Error('이미지 크기를 확인할 수 없습니다.')
    const longScale = Math.min(1, maxLongEdge / Math.max(width, height))
    const areaScale = Math.min(1, Math.sqrt(maxPixels / (width * height)))
    const scale = Math.min(longScale, areaScale)
    if (scale >= 1) {
      return {
        blob,
        width,
        height,
        originalWidth: width,
        originalHeight: height,
        optimized: false,
      }
    }

    const outputWidth = Math.max(1, Math.round(width * scale))
    const outputHeight = Math.max(1, Math.round(height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = outputWidth
    canvas.height = outputHeight
    const context = canvas.getContext('2d')
    if (!context) throw new Error('이미지 처리용 Canvas를 만들 수 없습니다.')
    context.drawImage(decoded.source, 0, 0, outputWidth, outputHeight)
    const type = blob.type === 'image/jpeg' ? 'image/jpeg' : 'image/png'
    const optimizedBlob = await canvasBlob(canvas, type, type === 'image/jpeg' ? 0.92 : undefined)
    canvas.width = 1
    canvas.height = 1
    return {
      blob: optimizedBlob,
      width: outputWidth,
      height: outputHeight,
      originalWidth: width,
      originalHeight: height,
      optimized: true,
    }
  } finally {
    decoded.release()
  }
}

export async function fetchImageFromUrl(url: string): Promise<Blob> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('올바른 이미지 주소를 입력해 주세요.')
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('HTTP 또는 HTTPS 이미지 주소만 사용할 수 있습니다.')
  }
  let response: Response
  try {
    response = await fetch(parsed.href, { mode: 'cors', credentials: 'omit' })
  } catch {
    throw new Error('사이트가 이미지 가져오기를 허용하지 않습니다. 이미지를 복사한 뒤 붙여넣어 주세요.')
  }
  if (!response.ok) throw new Error(`이미지를 받지 못했습니다 (${response.status}).`)
  const blob = await response.blob()
  if (blob.type && !blob.type.startsWith('image/')) throw new Error('주소가 이미지 파일을 가리키지 않습니다.')
  return blob
}

export async function readClipboardImage(): Promise<Blob> {
  if (!navigator.clipboard?.read) {
    throw new Error('이 브라우저에서는 버튼 붙여넣기를 지원하지 않습니다. 입력란을 길게 눌러 붙여넣어 주세요.')
  }
  const items = await navigator.clipboard.read()
  for (const item of items) {
    const type = item.types.find((candidate) => candidate.startsWith('image/'))
    if (type) return item.getType(type)
  }
  throw new Error('클립보드에 이미지가 없습니다.')
}
