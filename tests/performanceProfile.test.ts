import { getCanvasPerformanceProfile } from '../src/drawing/performanceProfile'

describe('getCanvasPerformanceProfile', () => {
  it('uses a lighter canvas on iOS 15 iPad Safari', () => {
    expect(getCanvasPerformanceProfile({
      userAgent: 'Mozilla/5.0 (iPad; CPU OS 15_8_8 like Mac OS X) AppleWebKit/605.1.15 Version/15.0 Mobile/15E148 Safari/604.1',
      platform: 'iPad',
      maxTouchPoints: 5,
      hardwareConcurrency: 8,
    })).toEqual({ maxPixelRatio: 1.5, reducedEffects: true })
  })

  it('recognizes iPadOS desktop user agents', () => {
    expect(getCanvasPerformanceProfile({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/15.6 Mobile/15E148 Safari/604.1',
      platform: 'MacIntel',
      maxTouchPoints: 5,
      hardwareConcurrency: 8,
    }).reducedEffects).toBe(true)
  })

  it('keeps the sharper canvas on a current high-core device', () => {
    expect(getCanvasPerformanceProfile({
      userAgent: 'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36',
      platform: 'Linux armv8l',
      maxTouchPoints: 5,
      hardwareConcurrency: 8,
    })).toEqual({ maxPixelRatio: 2, reducedEffects: false })
  })
})
