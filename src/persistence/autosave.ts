import type { SaveStatus } from '../drawing/types'

interface AutosaveOptions {
  save: () => Promise<void>
  onStatus: (status: SaveStatus) => void
  debounceMs?: number
  maxDelayMs?: number
}

export class AutosaveCoordinator {
  private dirty = false
  private activeFlush: Promise<boolean> | null = null
  private debounceTimer: number | null = null
  private maxTimer: number | null = null

  private readonly debounceMs: number
  private readonly maxDelayMs: number

  constructor(private readonly options: AutosaveOptions) {
    this.debounceMs = options.debounceMs ?? 2_000
    this.maxDelayMs = options.maxDelayMs ?? 15_000
  }

  markDirty(): void {
    this.dirty = true
    this.options.onStatus('unsaved')
    if (this.debounceTimer !== null) window.clearTimeout(this.debounceTimer)
    this.debounceTimer = window.setTimeout(() => {
      this.debounceTimer = null
      void this.flush()
    }, this.debounceMs)
    if (this.maxTimer === null) {
      this.maxTimer = window.setTimeout(() => {
        this.maxTimer = null
        void this.flush()
      }, this.maxDelayMs)
    }
  }

  async flush(): Promise<boolean> {
    if (this.activeFlush) {
      await this.activeFlush
      if (!this.dirty) return true
    }
    if (!this.dirty) return true
    const operation = this.performFlush()
    this.activeFlush = operation
    try {
      return await operation
    } finally {
      if (this.activeFlush === operation) this.activeFlush = null
    }
  }

  private async performFlush(): Promise<boolean> {
    this.clearTimers()
    this.dirty = false
    this.options.onStatus('saving')
    try {
      await this.options.save()
      this.options.onStatus(this.dirty ? 'unsaved' : 'saved')
      return !this.dirty
    } catch {
      this.dirty = true
      this.options.onStatus('error')
      return false
    } finally {
      if (this.dirty && this.debounceTimer === null) {
        this.debounceTimer = window.setTimeout(() => {
          this.debounceTimer = null
          void this.flush()
        }, this.debounceMs)
      }
    }
  }

  async retry(): Promise<boolean> {
    this.dirty = true
    return this.flush()
  }

  dispose(): void {
    this.clearTimers()
  }

  private clearTimers(): void {
    if (this.debounceTimer !== null) window.clearTimeout(this.debounceTimer)
    if (this.maxTimer !== null) window.clearTimeout(this.maxTimer)
    this.debounceTimer = null
    this.maxTimer = null
  }
}
