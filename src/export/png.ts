export type ExportResult = 'shared' | 'downloaded' | 'cancelled'

function safeFilename(title: string, date = new Date(), extension = 'png'): string {
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
    '-',
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
  ].join('')
  const printable = Array.from(title.trim(), (character) =>
    character.charCodeAt(0) < 32 ? '-' : character,
  ).join('')
  const base = printable.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ') || '새 그림'
  return `${base}-${stamp}.${extension}`
}

export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  link.style.display = 'none'
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export async function shareOrDownloadImage(
  blob: Blob,
  title: string,
  format: 'png' | 'jpeg',
): Promise<ExportResult> {
  const type = format === 'jpeg' ? 'image/jpeg' : 'image/png'
  const extension = format === 'jpeg' ? 'jpg' : 'png'
  const file = new File([blob], safeFilename(title, new Date(), extension), { type })
  const shareData: ShareData = { files: [file], title }
  if (navigator.share && navigator.canShare?.(shareData)) {
    try {
      await navigator.share(shareData)
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
    }
  }
  downloadFile(file)
  return 'downloaded'
}

export function shareOrDownloadPng(blob: Blob, title: string): Promise<ExportResult> {
  return shareOrDownloadImage(blob, title, 'png')
}

export { safeFilename }
