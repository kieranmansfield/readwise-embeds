import { describe, expect, it, vi } from 'vitest'
import { RwError, type RwBook } from '../api/readwise'
import { createStore, mergeBooks } from './cache'

const book = (id: number, ...hl: [number, boolean?][]): RwBook => ({
	user_book_id: id,
	title: `b${id}`,
	highlights: hl.map(([hid, is_deleted]) => ({ id: hid, text: `h${hid}`, is_deleted })),
})

describe('mergeBooks', () => {
	it('adds, updates and drops deleted highlights', () => {
		const merged = mergeBooks([book(1, [1], [2])], [book(1, [2, true], [3]), book(2, [4])])
		expect(merged.map((b) => b.highlights.map((h) => h.id))).toEqual([[1, 3], [4]])
	})
})

describe('createStore', () => {
	it('shares one in-flight fetch and fetches incrementally afterwards', async () => {
		const fetch = vi.fn().mockResolvedValue([book(1, [1])])
		const store = createStore({ fetch, now: () => 1000 })
		await Promise.all([store.refresh(), store.refresh(), store.get(0)])
		expect(fetch).toHaveBeenCalledTimes(1)
		await store.refresh()
		expect(fetch).toHaveBeenLastCalledWith(new Date(1000).toISOString(), expect.any(Function))
	})

	it('waits Retry-After on a 429 and retries once', async () => {
		const fetch = vi.fn().mockRejectedValueOnce(new RwError('rate-limit', 'slow', 7)).mockResolvedValue([book(1, [1])])
		const sleep = vi.fn().mockResolvedValue(undefined)
		const store = createStore({ fetch, sleep })
		expect((await store.refresh()).books).toHaveLength(1)
		expect(sleep).toHaveBeenCalledWith(7000)
	})

	it('keeps held data when a refresh fails', async () => {
		const fetch = vi.fn().mockResolvedValueOnce([book(1, [1])]).mockRejectedValue(new RwError('server', 'boom'))
		const store = createStore({ fetch })
		await store.refresh()
		await expect(store.refresh()).rejects.toThrow('boom')
		expect(store.peek().books).toHaveLength(1)
	})

	it('reports progress and rate-limit waits, and reset forgets everything', async () => {
		const fetch = vi.fn().mockImplementationOnce((_since, onPage: (n: number) => void) => (onPage(3), Promise.reject(new RwError('rate-limit', 'slow', 4)))).mockResolvedValue([book(1, [1])])
		const store = createStore({ fetch, sleep: () => Promise.resolve() })
		const seen: unknown[] = []
		const off = store.subscribe((e) => seen.push(e))
		await store.refresh()
		off()
		expect(seen).toEqual([{ type: 'progress', books: 3 }, { type: 'wait', seconds: 4 }])
		store.reset()
		expect(store.peek()).toEqual({ books: [], fetchedAt: 0 })
	})
})
