import { describe, expect, it, vi } from 'vitest'
import { countVisitor, isVisitorCounterHost } from '../src/visitors/counter'

function response(value: number): Response {
  return new Response(JSON.stringify({ value }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('visitor counter', () => {
  it('only enables counting on the production GitHub Pages host', () => {
    expect(isVisitorCounterHost('libralightluda.github.io')).toBe(true)
    expect(isVisitorCounterHost('localhost')).toBe(false)
    expect(isVisitorCounterHost('example.com')).toBe(false)
  })

  it('increments the Korean-date and total counters once per browser per day', async () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
    }
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response(7))
      .mockResolvedValueOnce(response(132))
      .mockResolvedValueOnce(response(7))
      .mockResolvedValueOnce(response(132))

    const now = new Date('2026-08-01T16:30:00.000Z')
    await expect(countVisitor({ fetcher, storage, now })).resolves.toEqual({ today: 7, total: 132 })
    await expect(countVisitor({ fetcher, storage, now })).resolves.toEqual({ today: 7, total: 132 })

    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      'https://countapi.mileshilliard.com/api/v1/hit/libralightluda-painter-visitors-2026-08-02',
      'https://countapi.mileshilliard.com/api/v1/hit/libralightluda-painter-visitors-total',
      'https://countapi.mileshilliard.com/api/v1/get/libralightluda-painter-visitors-2026-08-02',
      'https://countapi.mileshilliard.com/api/v1/get/libralightluda-painter-visitors-total',
    ])
  })

  it('does not mark a failed increment as counted', async () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
    }
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 503 }))

    await expect(countVisitor({ fetcher, storage, now: new Date('2026-08-02T00:00:00Z') })).rejects.toThrow()
    expect(values.size).toBe(0)
  })
})
