import { createProjectFile, readProjectFile } from '../src/export/projectFile'
import { createEmptySnapshot } from '../src/drawing/types'

describe('project file round trip', () => {
  it('preserves the snapshot and optional background image', async () => {
    const snapshot = createEmptySnapshot(123)
    snapshot.title = '백업 그림'
    const background = new Blob(['image-bytes'], { type: 'image/png' })
    const file = await createProjectFile(snapshot, background)
    const restored = await readProjectFile(file)
    expect(restored.snapshot).toEqual(snapshot)
    expect(restored.background?.type).toBe('image/png')
    expect(restored.background?.size).toBe(background.size)
  })

  it('rejects unrelated JSON files', async () => {
    await expect(readProjectFile(new Blob(['{"hello":"world"}']))).rejects.toThrow(
      '지원하지 않는 손끝 원본 파일',
    )
  })
})
