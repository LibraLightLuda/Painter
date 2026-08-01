import type { ProjectSnapshot } from '../drawing/types'

const PROJECT_FILE_FORMAT = 'fingertip-project'
const PROJECT_FILE_VERSION = 1

interface ProjectEnvelope {
  format: typeof PROJECT_FILE_FORMAT
  fileVersion: typeof PROJECT_FILE_VERSION
  exportedAt: string
  snapshot: ProjectSnapshot
  background?: { type: string; data: string }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk))
  }
  return btoa(binary)
}

function base64ToBlob(data: string, type: string): Blob {
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new Blob([bytes], { type })
}

function readBlob<T extends 'text' | 'arrayBuffer'>(
  blob: Blob,
  mode: T,
): Promise<T extends 'text' ? string : ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(reader.result as never), { once: true })
    reader.addEventListener('error', () => reject(reader.error ?? new Error('파일 읽기 실패')), { once: true })
    if (mode === 'text') reader.readAsText(blob)
    else reader.readAsArrayBuffer(blob)
  })
}

export async function createProjectFile(
  snapshot: ProjectSnapshot,
  background?: Blob,
): Promise<Blob> {
  const envelope: ProjectEnvelope = {
    format: PROJECT_FILE_FORMAT,
    fileVersion: PROJECT_FILE_VERSION,
    exportedAt: new Date().toISOString(),
    snapshot,
  }
  if (background) {
    envelope.background = {
      type: background.type || 'application/octet-stream',
      data: bytesToBase64(new Uint8Array(await readBlob(background, 'arrayBuffer'))),
    }
  }
  return new Blob([JSON.stringify(envelope)], { type: 'application/vnd.fingertip.project+json' })
}

export async function readProjectFile(file: Blob): Promise<{
  snapshot: ProjectSnapshot
  background?: Blob
}> {
  let envelope: ProjectEnvelope
  try {
    envelope = JSON.parse(await readBlob(file, 'text')) as ProjectEnvelope
  } catch {
    throw new Error('원본 파일의 JSON을 읽을 수 없습니다.')
  }
  if (envelope.format !== PROJECT_FILE_FORMAT || envelope.fileVersion !== PROJECT_FILE_VERSION) {
    throw new Error('지원하지 않는 손끝 원본 파일입니다.')
  }
  const snapshot = envelope.snapshot
  if (
    !snapshot ||
    snapshot.schemaVersion !== 1 ||
    !Number.isFinite(snapshot.width) ||
    !Number.isFinite(snapshot.height) ||
    !snapshot.history ||
    !Array.isArray(snapshot.history.done)
  ) {
    throw new Error('원본 파일의 작업 데이터가 올바르지 않습니다.')
  }
  return {
    snapshot: structuredClone(snapshot),
    background: envelope.background
      ? base64ToBlob(envelope.background.data, envelope.background.type)
      : undefined,
  }
}
