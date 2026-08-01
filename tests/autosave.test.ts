import { AutosaveCoordinator } from '../src/persistence/autosave'
import type { SaveStatus } from '../src/drawing/types'

describe('AutosaveCoordinator', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('debounces saves for two seconds', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const statuses: SaveStatus[] = []
    const autosave = new AutosaveCoordinator({ save, onStatus: (status) => statuses.push(status) })
    autosave.markDirty()
    await vi.advanceTimersByTimeAsync(1_999)
    expect(save).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(save).toHaveBeenCalledOnce()
    expect(statuses).toContain('saved')
  })

  it('saves within fifteen seconds during continuous changes', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const autosave = new AutosaveCoordinator({ save, onStatus: () => undefined })
    for (let second = 0; second < 15; second += 1) {
      autosave.markDirty()
      await vi.advanceTimersByTimeAsync(1_000)
    }
    expect(save).toHaveBeenCalledOnce()
  })

  it('keeps edits dirty and reports failure when saving fails', async () => {
    const statuses: SaveStatus[] = []
    const save = vi.fn().mockRejectedValueOnce(new Error('quota')).mockResolvedValue(undefined)
    const autosave = new AutosaveCoordinator({ save, onStatus: (status) => statuses.push(status) })
    autosave.markDirty()
    await expect(autosave.flush()).resolves.toBe(false)
    expect(statuses.at(-1)).toBe('error')
    await expect(autosave.retry()).resolves.toBe(true)
    expect(statuses.at(-1)).toBe('saved')
  })

  it('schedules another save when work changes during an in-flight save', async () => {
    let finishFirst: (() => void) | undefined
    const save = vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => { finishFirst = resolve }))
      .mockResolvedValue(undefined)
    const statuses: SaveStatus[] = []
    const autosave = new AutosaveCoordinator({ save, onStatus: (status) => statuses.push(status) })
    autosave.markDirty()
    const first = autosave.flush()
    autosave.markDirty()
    finishFirst?.()
    await first
    expect(statuses.at(-1)).toBe('unsaved')
    await vi.advanceTimersByTimeAsync(2_000)
    expect(save).toHaveBeenCalledTimes(2)
    expect(statuses.at(-1)).toBe('saved')
  })

  it('flushes the latest edit after an in-flight save before resolving', async () => {
    let finishFirst: (() => void) | undefined
    const save = vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => { finishFirst = resolve }))
      .mockResolvedValue(undefined)
    const autosave = new AutosaveCoordinator({ save, onStatus: () => undefined })
    autosave.markDirty()
    const first = autosave.flush()
    autosave.markDirty()
    const latest = autosave.flush()
    finishFirst?.()
    await expect(first).resolves.toBe(false)
    await expect(latest).resolves.toBe(true)
    expect(save).toHaveBeenCalledTimes(2)
  })
})
