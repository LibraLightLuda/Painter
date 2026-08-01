import { safeFilename } from '../src/export/png'

describe('PNG export naming', () => {
  it('replaces unsafe filename characters', () => {
    const name = safeFilename('아이디어: 첫/선?', new Date(2026, 7, 1, 9, 7))
    expect(name).toBe('아이디어- 첫-선--20260801-0907.png')
  })
})
