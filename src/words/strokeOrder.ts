import type { WordGuide } from '../drawing/types'

export interface WritingStep {
  character: string
  components: string[]
}

const initials = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ']
const medials = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ', 'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ']
const finals = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ']

export function decomposeHangul(character: string): string[] {
  const code = character.codePointAt(0)
  if (code === undefined || code < 0xac00 || code > 0xd7a3) return [character]
  const syllable = code - 0xac00
  const finalIndex = syllable % 28
  return [
    initials[Math.floor(syllable / 588)],
    medials[Math.floor((syllable % 588) / 28)],
    ...(finalIndex ? [finals[finalIndex]] : []),
  ]
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
