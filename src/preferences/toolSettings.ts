import type { BrushSettings, BrushTool } from '../drawing/types'

export const LEGACY_TOOL_SETTINGS_KEY = 'fingertip-tool-settings-v1'
export const TOOL_SETTINGS_KEY = 'fingertip-tool-settings-v2'
export const TOOL_SETTINGS_VERSION = 2 as const

const tools = [
  'pen', 'pencil', 'marker', 'brush', 'highlighter', 'spray', 'eraser',
  'eyedropper', 'fill', 'line', 'rectangle', 'ellipse', 'arrow',
] as const satisfies readonly BrushTool[]

const toolSet = new Set<string>(tools)

export type StoredToolDetails = Pick<
  BrushSettings,
  'flow' | 'hardness' | 'spacing' | 'stabilization' | 'pressure' | 'shapeFill' | 'tolerance'
>

export interface StoredToolSettings {
  version?: typeof TOOL_SETTINGS_VERSION
  updatedAt?: number
  brush?: { tool?: BrushTool; color?: string }
  sizes?: Partial<Record<BrushTool, number>>
  opacities?: Partial<Record<BrushTool, number>>
  recentColors?: string[]
  favoriteColors?: string[]
  details?: Partial<Record<BrushTool, Partial<StoredToolDetails>>>
}

interface SettingsStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isBrushTool(value: unknown): value is BrushTool {
  return typeof value === 'string' && toolSet.has(value)
}

function normalizeColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const color = value.trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(color)) return color
  if (/^#[0-9a-f]{3}$/.test(color)) {
    return `#${color.slice(1).split('').map((part) => part.repeat(2)).join('')}`
  }
  return undefined
}

function boundedNumber(value: unknown, minimum: number, maximum: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.min(maximum, Math.max(minimum, value))
}

function sanitizeToolNumbers(
  value: unknown,
  minimum: number,
  maximum: number,
): Partial<Record<BrushTool, number>> | undefined {
  if (!isRecord(value)) return undefined
  const result: Partial<Record<BrushTool, number>> = {}
  for (const tool of tools) {
    const number = boundedNumber(value[tool], minimum, maximum)
    if (number !== undefined) result[tool] = number
  }
  return Object.keys(result).length ? result : undefined
}

function sanitizeColors(value: unknown, maximum: number): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const result: string[] = []
  for (const item of value) {
    const color = normalizeColor(item)
    if (color && !result.includes(color)) result.push(color)
    if (result.length === maximum) break
  }
  return result
}

function sanitizeDetails(value: unknown): StoredToolSettings['details'] {
  if (!isRecord(value)) return undefined
  const result: NonNullable<StoredToolSettings['details']> = {}
  for (const tool of tools) {
    const candidate = value[tool]
    if (!isRecord(candidate)) continue
    const details: Partial<StoredToolDetails> = {}
    const flow = boundedNumber(candidate.flow, 0.05, 1)
    const hardness = boundedNumber(candidate.hardness, 0.02, 1)
    const spacing = boundedNumber(candidate.spacing, 0.04, 1)
    const stabilization = boundedNumber(candidate.stabilization, 0, 1)
    const tolerance = boundedNumber(candidate.tolerance, 0, 255)
    if (flow !== undefined) details.flow = flow
    if (hardness !== undefined) details.hardness = hardness
    if (spacing !== undefined) details.spacing = spacing
    if (stabilization !== undefined) details.stabilization = stabilization
    if (tolerance !== undefined) details.tolerance = tolerance
    if (typeof candidate.pressure === 'boolean') details.pressure = candidate.pressure
    if (typeof candidate.shapeFill === 'boolean') details.shapeFill = candidate.shapeFill
    if (Object.keys(details).length) result[tool] = details
  }
  return Object.keys(result).length ? result : undefined
}

function sanitizeSettings(value: unknown, requireVersion: boolean): StoredToolSettings | null {
  if (!isRecord(value)) return null
  if (requireVersion && value.version !== TOOL_SETTINGS_VERSION) return null

  const brushValue = isRecord(value.brush) ? value.brush : undefined
  const tool = brushValue && isBrushTool(brushValue.tool) ? brushValue.tool : undefined
  const color = brushValue ? normalizeColor(brushValue.color) : undefined
  const updatedAt = boundedNumber(value.updatedAt, 0, Number.MAX_SAFE_INTEGER)
  const sizes = sanitizeToolNumbers(value.sizes, 1, 160)
  const opacities = sanitizeToolNumbers(value.opacities, 0.05, 1)
  const recentColors = sanitizeColors(value.recentColors, 12)
  const favoriteColors = sanitizeColors(value.favoriteColors, 16)
  const details = sanitizeDetails(value.details)

  return {
    ...(requireVersion ? { version: TOOL_SETTINGS_VERSION } : {}),
    ...(updatedAt !== undefined ? { updatedAt } : {}),
    ...(tool || color ? { brush: { ...(tool ? { tool } : {}), ...(color ? { color } : {}) } } : {}),
    ...(sizes ? { sizes } : {}),
    ...(opacities ? { opacities } : {}),
    ...(recentColors ? { recentColors } : {}),
    ...(favoriteColors ? { favoriteColors } : {}),
    ...(details ? { details } : {}),
  }
}

function parseSettings(raw: string | null, requireVersion: boolean): StoredToolSettings | null {
  if (!raw) return null
  try {
    return sanitizeSettings(JSON.parse(raw), requireVersion)
  } catch {
    return null
  }
}

export function readStoredToolSettings(storage: Pick<SettingsStorage, 'getItem'> = localStorage): StoredToolSettings {
  try {
    const current = parseSettings(storage.getItem(TOOL_SETTINGS_KEY), true)
    if (current) return current
    return parseSettings(storage.getItem(LEGACY_TOOL_SETTINGS_KEY), false) ?? {}
  } catch {
    return {}
  }
}

export function writeStoredToolSettings(
  settings: StoredToolSettings,
  storage: Pick<SettingsStorage, 'setItem'> = localStorage,
): void {
  const sanitized = sanitizeSettings(settings, false) ?? {}
  const current: StoredToolSettings = {
    ...sanitized,
    version: TOOL_SETTINGS_VERSION,
    updatedAt: Date.now(),
  }
  storage.setItem(TOOL_SETTINGS_KEY, JSON.stringify(current))

  // Keep the previous key synchronized so a cached or rolled-back app keeps the latest choices.
  const legacy = { ...current }
  delete legacy.version
  delete legacy.updatedAt
  storage.setItem(LEGACY_TOOL_SETTINGS_KEY, JSON.stringify(legacy))
}
