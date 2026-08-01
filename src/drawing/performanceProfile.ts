export interface CanvasPerformanceProfile {
  maxPixelRatio: number
  reducedEffects: boolean
}

interface NavigatorLike {
  userAgent: string
  platform?: string
  maxTouchPoints?: number
  hardwareConcurrency?: number
}

function iosMajorVersion(userAgent: string): number | null {
  const osVersion = userAgent.match(/(?:CPU (?:iPhone )?OS|iPhone OS) (\d+)[._]/i)
  if (osVersion) return Number.parseInt(osVersion[1], 10)

  // iPadOS can request a desktop site and identify itself as macOS. In that
  // mode Safari's Version token is the useful WebKit generation indicator.
  const safariVersion = userAgent.match(/Version\/(\d+)(?:\.|\s)/i)
  return safariVersion ? Number.parseInt(safariVersion[1], 10) : null
}

export function getCanvasPerformanceProfile(
  navigatorLike: NavigatorLike = navigator,
): CanvasPerformanceProfile {
  const userAgent = navigatorLike.userAgent
  const isIOS = /iPad|iPhone|iPod/i.test(userAgent)
    || (navigatorLike.platform === 'MacIntel' && (navigatorLike.maxTouchPoints ?? 0) > 1)
  const majorVersion = isIOS ? iosMajorVersion(userAgent) : null
  const legacyIOS = isIOS && (majorVersion === null || majorVersion <= 15)
  const lowCoreDevice = (navigatorLike.hardwareConcurrency ?? 8) <= 4
  const reducedEffects = legacyIOS || lowCoreDevice

  return {
    // A 2x full-screen canvas has four times as many pixels as a 1x canvas.
    // 1.5x retains useful sharpness while removing 44% of that fill work.
    maxPixelRatio: reducedEffects ? 1.5 : 2,
    reducedEffects,
  }
}
