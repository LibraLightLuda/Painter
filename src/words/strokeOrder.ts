import type { WordGuide } from '../drawing/types'

export interface WritingStep {
  character: string
  components: string[]
}

export type HangulComponentRole = '초성' | '중성' | '받침'

export interface JamoStroke {
  order: number
  direction: string
  label: string
}

export interface JamoStrokeGuide {
  jamo: string
  parts: string[]
  strokes: JamoStroke[]
}

export interface HangulComponentGuide extends JamoStrokeGuide {
  role: HangulComponentRole
}

export interface HangulSyllableGuide {
  character: string
  components: HangulComponentGuide[]
}

interface StrokeDefinition {
  direction: string
  label: string
}

const initials = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ']
const medials = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ', 'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ']
const finals = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ']

const primitiveStrokes: Record<string, readonly StrokeDefinition[]> = {
  ㄱ: [{ direction: '→', label: '위 가로' }, { direction: '↓', label: '오른쪽 세로' }],
  ㄴ: [{ direction: '↓', label: '왼쪽 세로' }, { direction: '→', label: '아래 가로' }],
  ㄷ: [{ direction: '→', label: '위 가로' }, { direction: '↓', label: '왼쪽 세로' }, { direction: '→', label: '아래 가로' }],
  ㄹ: [{ direction: '→', label: '위 가로' }, { direction: '↓', label: '오른쪽 세로' }, { direction: '←', label: '가운데 가로' }, { direction: '↓', label: '왼쪽 세로' }, { direction: '→', label: '아래 가로' }],
  ㅁ: [{ direction: '→', label: '위 가로' }, { direction: '↓', label: '왼쪽 세로' }, { direction: '↓', label: '오른쪽 세로' }, { direction: '→', label: '아래 가로' }],
  ㅂ: [{ direction: '↓', label: '왼쪽 세로' }, { direction: '↓', label: '오른쪽 세로' }, { direction: '→', label: '가운데 가로' }, { direction: '→', label: '아래 가로' }],
  ㅅ: [{ direction: '↘', label: '왼쪽 사선' }, { direction: '↙', label: '오른쪽 사선' }],
  ㅇ: [{ direction: '○', label: '위에서 둥글게' }],
  ㅈ: [{ direction: '→', label: '위 가로' }, { direction: '↘', label: '왼쪽 사선' }, { direction: '↙', label: '오른쪽 사선' }],
  ㅊ: [{ direction: '→', label: '맨 위 가로' }, { direction: '→', label: '가운데 가로' }, { direction: '↘', label: '왼쪽 사선' }, { direction: '↙', label: '오른쪽 사선' }],
  ㅋ: [{ direction: '→', label: '위 가로' }, { direction: '↓', label: '오른쪽 세로' }, { direction: '→', label: '가운데 가로' }],
  ㅌ: [{ direction: '→', label: '위 가로' }, { direction: '→', label: '가운데 가로' }, { direction: '↓', label: '왼쪽 세로' }, { direction: '→', label: '아래 가로' }],
  ㅍ: [{ direction: '→', label: '위 가로' }, { direction: '→', label: '아래 가로' }, { direction: '↓', label: '왼쪽 세로' }, { direction: '↓', label: '오른쪽 세로' }],
  ㅎ: [{ direction: '→', label: '맨 위 가로' }, { direction: '→', label: '가운데 가로' }, { direction: '○', label: '아래를 둥글게' }],
  ㅏ: [{ direction: '↓', label: '긴 세로' }, { direction: '→', label: '오른쪽 짧은 가로' }],
  ㅑ: [{ direction: '↓', label: '긴 세로' }, { direction: '→', label: '위 짧은 가로' }, { direction: '→', label: '아래 짧은 가로' }],
  ㅓ: [{ direction: '→', label: '왼쪽 짧은 가로' }, { direction: '↓', label: '긴 세로' }],
  ㅕ: [{ direction: '→', label: '위 짧은 가로' }, { direction: '→', label: '아래 짧은 가로' }, { direction: '↓', label: '긴 세로' }],
  ㅗ: [{ direction: '↓', label: '위 짧은 세로' }, { direction: '→', label: '긴 가로' }],
  ㅛ: [{ direction: '↓', label: '왼쪽 짧은 세로' }, { direction: '↓', label: '오른쪽 짧은 세로' }, { direction: '→', label: '긴 가로' }],
  ㅜ: [{ direction: '→', label: '긴 가로' }, { direction: '↓', label: '아래 짧은 세로' }],
  ㅠ: [{ direction: '→', label: '긴 가로' }, { direction: '↓', label: '왼쪽 짧은 세로' }, { direction: '↓', label: '오른쪽 짧은 세로' }],
  ㅡ: [{ direction: '→', label: '가로' }],
  ㅣ: [{ direction: '↓', label: '세로' }],
}

const compoundParts: Record<string, readonly string[]> = {
  ㄲ: ['ㄱ', 'ㄱ'], ㄸ: ['ㄷ', 'ㄷ'], ㅃ: ['ㅂ', 'ㅂ'], ㅆ: ['ㅅ', 'ㅅ'], ㅉ: ['ㅈ', 'ㅈ'],
  ㄳ: ['ㄱ', 'ㅅ'], ㄵ: ['ㄴ', 'ㅈ'], ㄶ: ['ㄴ', 'ㅎ'], ㄺ: ['ㄹ', 'ㄱ'], ㄻ: ['ㄹ', 'ㅁ'],
  ㄼ: ['ㄹ', 'ㅂ'], ㄽ: ['ㄹ', 'ㅅ'], ㄾ: ['ㄹ', 'ㅌ'], ㄿ: ['ㄹ', 'ㅍ'], ㅀ: ['ㄹ', 'ㅎ'], ㅄ: ['ㅂ', 'ㅅ'],
  ㅐ: ['ㅏ', 'ㅣ'], ㅒ: ['ㅑ', 'ㅣ'], ㅔ: ['ㅓ', 'ㅣ'], ㅖ: ['ㅕ', 'ㅣ'],
  ㅘ: ['ㅗ', 'ㅏ'], ㅙ: ['ㅗ', 'ㅏ', 'ㅣ'], ㅚ: ['ㅗ', 'ㅣ'],
  ㅝ: ['ㅜ', 'ㅓ'], ㅞ: ['ㅜ', 'ㅓ', 'ㅣ'], ㅟ: ['ㅜ', 'ㅣ'], ㅢ: ['ㅡ', 'ㅣ'],
}

function hangulIndexes(character: string): { initial: number; medial: number; final: number } | undefined {
  const code = character.codePointAt(0)
  if (code === undefined || code < 0xac00 || code > 0xd7a3) return undefined
  const syllable = code - 0xac00
  return {
    initial: Math.floor(syllable / 588),
    medial: Math.floor((syllable % 588) / 28),
    final: syllable % 28,
  }
}

export function decomposeHangul(character: string): string[] {
  const indexes = hangulIndexes(character)
  if (!indexes) return [character]
  return [
    initials[indexes.initial],
    medials[indexes.medial],
    ...(indexes.final ? [finals[indexes.final]] : []),
  ]
}

export function getJamoStrokeGuide(jamo: string): JamoStrokeGuide {
  const parts = [...(compoundParts[jamo] ?? [jamo])]
  const strokes = parts.flatMap((part) => (primitiveStrokes[part] ?? [{ direction: '·', label: '모양 따라쓰기' }])
    .map((stroke) => ({
      direction: stroke.direction,
      label: parts.length > 1 ? `${part} ${stroke.label}` : stroke.label,
    })))
    .map((stroke, index) => ({ ...stroke, order: index + 1 }))
  return { jamo, parts, strokes }
}

export function createHangulSyllableGuides(text: string): HangulSyllableGuide[] {
  return Array.from(text).flatMap((character) => {
    const indexes = hangulIndexes(character)
    if (!indexes) return []
    const components: Array<[HangulComponentRole, string]> = [
      ['초성', initials[indexes.initial]],
      ['중성', medials[indexes.medial]],
      ...(indexes.final ? [['받침', finals[indexes.final]] as [HangulComponentRole, string]] : []),
    ]
    return [{
      character,
      components: components.map(([role, jamo]) => ({ role, ...getJamoStrokeGuide(jamo) })),
    }]
  })
}

export function createWritingSteps(guide: WordGuide): WritingStep[] {
  return Array.from(guide.text)
    .filter((character) => character.trim().length > 0)
    .map((character) => ({
      character,
      components: guide.language === 'ko' ? decomposeHangul(character) : [character],
    }))
}

export function circledStepNumber(index: number): string {
  const circled = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫']
  return circled[index] ?? String(index + 1)
}
