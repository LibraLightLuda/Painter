import { describe, expect, it, vi } from 'vitest'
import {
  LEGACY_TOOL_SETTINGS_KEY,
  TOOL_SETTINGS_KEY,
  readStoredToolSettings,
  writeStoredToolSettings,
} from '../src/preferences/toolSettings'

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  }
}

describe('tool settings persistence', () => {
  it('restores settings written by the previous app version', () => {
    const legacy = {
      brush: { tool: 'marker', color: '#D64B3C' },
      sizes: { marker: 42 },
      opacities: { marker: 0.37 },
      recentColors: ['#D64B3C', '#246bce'],
      favoriteColors: ['#21845b'],
      details: { marker: { flow: 0.64, pressure: false } },
    }
    const storage = memoryStorage({ [LEGACY_TOOL_SETTINGS_KEY]: JSON.stringify(legacy) })

    expect(readStoredToolSettings(storage)).toEqual({
      brush: { tool: 'marker', color: '#d64b3c' },
      sizes: { marker: 42 },
      opacities: { marker: 0.37 },
      recentColors: ['#d64b3c', '#246bce'],
      favoriteColors: ['#21845b'],
      details: { marker: { flow: 0.64, pressure: false } },
    })
  })

  it('prefers valid current settings and falls back to legacy data when current data is corrupt', () => {
    const storage = memoryStorage({
      [TOOL_SETTINGS_KEY]: JSON.stringify({ version: 2, brush: { tool: 'pencil', color: '#246bce' } }),
      [LEGACY_TOOL_SETTINGS_KEY]: JSON.stringify({ brush: { tool: 'marker', color: '#d64b3c' } }),
    })
    expect(readStoredToolSettings(storage).brush).toEqual({ tool: 'pencil', color: '#246bce' })

    storage.setItem(TOOL_SETTINGS_KEY, '{broken')
    expect(readStoredToolSettings(storage).brush).toEqual({ tool: 'marker', color: '#d64b3c' })
  })

  it('drops unsafe values and keeps valid preferences within UI limits', () => {
    const storage = memoryStorage({
      [TOOL_SETTINGS_KEY]: JSON.stringify({
        version: 2,
        brush: { tool: 'unknown', color: 'red' },
        sizes: { pen: 999, marker: 'large' },
        opacities: { pen: -1, marker: 0.48 },
        recentColors: ['#abc', '#aabbcc', 'invalid'],
        details: { pen: { stabilization: -4, flow: 9, pressure: true, shapeFill: 'yes' } },
      }),
    })

    expect(readStoredToolSettings(storage)).toMatchObject({
      version: 2,
      sizes: { pen: 160 },
      opacities: { pen: 0.05, marker: 0.48 },
      recentColors: ['#aabbcc'],
      details: { pen: { stabilization: 0, flow: 1, pressure: true } },
    })
  })

  it('writes the versioned format and a rollback-compatible mirror', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-01T00:00:00Z'))
    const storage = memoryStorage()

    writeStoredToolSettings({
      brush: { tool: 'brush', color: '#21845b' },
      sizes: { brush: 27 },
      opacities: { brush: 0.61 },
      details: { brush: { hardness: 0.58 } },
    }, storage)

    expect(JSON.parse(storage.getItem(TOOL_SETTINGS_KEY) ?? '{}')).toMatchObject({
      version: 2,
      updatedAt: Date.now(),
      brush: { tool: 'brush', color: '#21845b' },
      sizes: { brush: 27 },
      opacities: { brush: 0.61 },
    })
    expect(JSON.parse(storage.getItem(LEGACY_TOOL_SETTINGS_KEY) ?? '{}')).toEqual({
      brush: { tool: 'brush', color: '#21845b' },
      sizes: { brush: 27 },
      opacities: { brush: 0.61 },
      details: { brush: { hardness: 0.58 } },
    })
    vi.useRealTimers()
  })
})
