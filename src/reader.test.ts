import { describe, expect, it, vi } from 'vitest'
import { RwError } from './api/errors'
import type { HttpPort } from './api/http'
import { createLimiter } from './api/limiter'
import { createReaderClient, type DocSlice, type RdDoc } from './api/reader'
import { createDocStore, FULL_EVERY_MS, mergeEntries, type DocStoreDeps, type SavedDocs } from './cache/docs'
import { readerSchema } from './filter/readerFields'
import { planLocations, wantsHighlights } from './filter/plan'
import { effectiveSearch, PRESETS } from './block/presets'
import { parseDocs, serializeDocs } from './cache/persist'
import { compileQuery } from './filter/query'

const NOW = new Date(2026, 5, 15).getTime()
const doc = (o: Partial<RdDoc> = {}): RdDoc => ({ id: 'a', title: 'CSS tricks', author: 'Una Kravets', location: 'later', category: 'article', site_name: 'web.dev', source_url: 'https://web.dev/css', word_count: 2380, reading_progress: 0.25, saved_at: new Date(2026, 5, 1).toISOString(), tags: { css: { name: 'css' } }, ...o })

function compile(src: string) {
	const q = compileQuery(src, readerSchema, () => NOW)
	if ('error' in q) throw new Error(q.error)
	return q
}
const run = (src: string, d: Partial<RdDoc> = {}) => compile(src).test(doc(d))
const err = (src: string) => {
	const q = compileQuery(src, readerSchema, () => NOW)
	return 'error' in q ? q.error : undefined
}

describe('reader filter', () => {
	it('matches the plan example', () => {
		expect(run('in:later tag:css AND saved__after:"2 weeks ago"')).toBe(false)
		expect(run('in:later tag:css AND saved__after:"3 months ago"')).toBe(true)
		expect(run('in:archive')).toBe(false)
	})

	it('treats inbox as new, reads domain, numbers, progress and flags', () => {
		expect(run('in:inbox', { location: 'new' })).toBe(true)
		expect(run('domain:web.dev AND url:css')).toBe(true)
		expect(run('words__gt:2000 AND minutes__lte:10 AND progress__gte:25')).toBe(true)
		expect(run('progress:25')).toBe(true)
		expect(run('words__lt:100')).toBe(false)
		expect(run('unseen:true')).toBe(true)
		expect(run('seen:true', { first_opened_at: '2026-01-01' })).toBe(true)
		expect(run('feed:true')).toBe(false)
		expect(run('has:tags AND has__not:notes')).toBe(true)
	})

	it('reads published dates given as text or milliseconds', () => {
		expect(run('published__before:2026-01-01', { published_date: new Date(2025, 0, 1).getTime() })).toBe(true)
		expect(run('published__before:2026-01-01', { published_date: '2025-06-01' })).toBe(true)
		expect(run('published__before:2026-01-01', { published_date: null })).toBe(false)
	})

	it('derives minutes from reading_time or the word count', () => {
		expect(run('minutes:4', { reading_time: '4 mins' })).toBe(true)
		expect(run('minutes:10', { reading_time: undefined })).toBe(true)
		expect(run('minutes:1', { reading_time: undefined, word_count: undefined })).toBe(false)
	})

	it('names unsupported and invalid terms instead of ignoring them', () => {
		expect(err('shared:true')).toContain('not returned by the Reader API')
		expect(err('has:highlights')).toContain('has must be one of')
		expect(err('highlights:yes')).toContain('highlights')
		expect(err('words:lots')).toContain('must be a number')
		expect(err('words__before:2020-01-01')).toContain('not valid here')
		expect(err('tga:css')).toContain('Did you mean "tag"?')
	})
})

describe('planLocations', () => {
	const plan = (src: string) => planLocations(compile(src).ast)
	const LIBRARY = ['new', 'later', 'shortlist', 'archive']
	it('narrows to a plain positive top-level in: term only', () => {
		expect(plan('in:later AND category:article')).toEqual(['later'])
		expect(plan('in:inbox')).toEqual(['new'])
		expect(plan('feed:true')).toEqual(['feed'])
		expect(plan('type:pdf AND tag:css')).toEqual(LIBRARY)
	})

	it('does not narrow under OR, NOT, other operators or partial values', () => {
		expect(plan('in:later OR in:archive')).toEqual(LIBRARY)
		expect(plan('NOT in:later')).toEqual(LIBRARY)
		expect(plan('in__not:archive')).toEqual(LIBRARY)
	})

	it('includes the feed only when the query mentions it', () => {
		expect(planLocations(undefined)).toEqual(LIBRARY)
		expect(plan('in:feed OR in:later')).toEqual([...LIBRARY, 'feed'])
		expect(plan('in__not:feed')).toEqual([...LIBRARY, 'feed'])
	})

	it('shows highlight and note documents only when asked for by category', () => {
		expect(wantsHighlights(compile('category:highlight').ast)).toBe(true)
		expect(wantsHighlights(compile('tag:css').ast)).toBe(false)
		expect(wantsHighlights(undefined)).toBe(false)
	})
})

describe('reader client', () => {
	const pages = (...ps: unknown[]) => {
		const urls: string[] = []
		const http: HttpPort = { request: ({ url }) => (urls.push(url), Promise.resolve({ status: 200, json: ps.shift() })) }
		return { urls, client: createReaderClient(http, () => 'tok', () => Promise.resolve()) }
	}
	const slice: DocSlice = { location: 'later', category: 'article', maxPages: 2 }

	it('pushes params, follows the cursor and stops at the page cap', async () => {
		const { client, urls } = pages({ results: [doc({ id: '1' })], nextPageCursor: 'c1' }, { results: [doc({ id: '2' })], nextPageCursor: 'c2' })
		const r = await client.list(slice)
		expect(r.docs).toHaveLength(2)
		expect(r.truncated).toBe(true)
		expect(urls[0]).toContain('location=later')
		expect(urls[0]).toContain('category=article')
		expect(urls[1]).toContain('pageCursor=c1')
	})

	it('is complete when the cursor runs out', async () => {
		const { client } = pages({ results: [doc()], nextPageCursor: null })
		expect(await client.list(slice)).toMatchObject({ truncated: false })
	})
})

describe('reader client rate limits', () => {
	it('sends updatedAfter, reports pages, and gives up after repeated 429s', async () => {
		const urls: string[] = []
		const http: HttpPort = { request: ({ url }) => (urls.push(url), Promise.resolve(urls.length === 1 ? { status: 200, json: { results: [doc()], nextPageCursor: 'c' } } : { status: 429, json: undefined, retryAfter: 1 })) }
		const client = createReaderClient(http, () => 'tok', () => Promise.resolve(), () => Promise.resolve())
		const counts: number[] = []
		await expect(client.list({ location: 'later', updatedAfter: '2026-01-01T00:00:00.000Z', maxPages: 3 }, (n) => counts.push(n))).rejects.toThrow('rate limit')
		expect(urls[0]).toContain('updatedAfter=2026-01-01')
		expect(counts).toEqual([1])
		expect(urls).toHaveLength(1 + 6)
	})

	it('waits out a 429 and asks for the same page again instead of restarting', async () => {
		const replies = [
			{ status: 200, json: { results: [doc({ id: '1' })], nextPageCursor: 'c1' } },
			{ status: 429, json: undefined, retryAfter: 2 },
			{ status: 200, json: { results: [doc({ id: '2' })], nextPageCursor: null } },
		]
		const urls: string[] = []
		const http: HttpPort = { request: ({ url }) => (urls.push(url), Promise.resolve(replies.shift()!)) }
		const sleep = vi.fn().mockResolvedValue(undefined)
		const waits: number[] = []
		const client = createReaderClient(http, () => 'tok', () => Promise.resolve(), sleep)
		const r = await client.list({ maxPages: 5 }, undefined, (s) => waits.push(s))
		expect(r.docs.map((d) => d.id)).toEqual(['1', '2'])
		expect(urls).toHaveLength(3)
		expect(urls[1]).toContain('pageCursor=c1')
		expect(urls[2]).toContain('pageCursor=c1')
		expect(waits).toEqual([2])
		expect(sleep).toHaveBeenCalledWith(2000)
	})
})

describe('limiter', () => {
	it('allows a burst then spaces requests, in order', async () => {
		let t = 0
		const waits: number[] = []
		const { acquire } = createLimiter({ capacity: 2, perMinute: 20, now: () => t, sleep: (ms) => ((t += ms), waits.push(ms), Promise.resolve()) })
		await Promise.all([acquire(), acquire(), acquire(), acquire()])
		expect(waits).toEqual([3000, 3000])
	})
})

describe('doc store', () => {
	const result = { docs: [doc()], truncated: false }
	const HOUR = 3_600_000

	it('shares in-flight syncs, serves fresh data, and syncs again when stale', async () => {
		let t = 0
		const fetch = vi.fn<DocStoreDeps['fetch']>().mockResolvedValue(result)
		const store = createDocStore({ fetch, now: () => t })
		await Promise.all([store.refresh('later'), store.refresh('later'), store.get('later', 1000)])
		expect(fetch).toHaveBeenCalledTimes(1)
		await store.get('later', 1000)
		expect(fetch).toHaveBeenCalledTimes(1)
		t = 5000
		await store.get('later', 1000)
		expect(fetch).toHaveBeenCalledTimes(2)
		store.reset()
		expect(store.peek('later')).toBeUndefined()
	})

	it('downloads in full once, then asks only for changes and merges them by id', async () => {
		let t = 10 * HOUR
		const fetch = vi
			.fn<DocStoreDeps['fetch']>()
			.mockResolvedValueOnce({ docs: [doc({ id: '1', title: 'old' }), doc({ id: '2' })], truncated: false })
			.mockResolvedValueOnce({ docs: [doc({ id: '1', title: 'new' }), doc({ id: '3' })], truncated: false })
		const store = createDocStore({ fetch, now: () => t })
		await store.refresh('later')
		t += HOUR
		const e = await store.refresh('later')
		expect(fetch.mock.calls[0][0]).toEqual({ location: 'later', updatedAfter: undefined })
		expect(fetch.mock.calls[1][0].updatedAfter).toBe(new Date(10 * HOUR - 5 * 60_000).toISOString())
		expect(e.docs.map((d) => d.title)).toEqual(['new', 'CSS tricks', 'CSS tricks'])
		expect(e.docs.map((d) => d.id)).toEqual(['1', '2', '3'])
	})

	it('repeats the full download after a week, replacing deleted documents', async () => {
		let t = 0
		const fetch = vi.fn<DocStoreDeps['fetch']>().mockResolvedValueOnce({ docs: [doc({ id: '1' }), doc({ id: '2' })], truncated: false }).mockResolvedValueOnce({ docs: [doc({ id: '1' })], truncated: false })
		const store = createDocStore({ fetch, now: () => t })
		await store.refresh('later')
		t = FULL_EVERY_MS + 1
		const e = await store.refresh('later')
		expect(fetch.mock.calls[1][0].updatedAfter).toBeUndefined()
		expect(e.docs.map((d) => d.id)).toEqual(['1'])
	})

	it('starts over next time if a change sync was cut short', async () => {
		let t = 0
		const fetch = vi.fn<DocStoreDeps['fetch']>().mockResolvedValueOnce(result).mockResolvedValueOnce({ docs: [], truncated: true }).mockResolvedValue(result)
		const store = createDocStore({ fetch, now: () => t })
		await store.refresh('later')
		t = HOUR
		await store.refresh('later')
		t = 2 * HOUR
		await store.refresh('later')
		expect(fetch.mock.calls[2][0].updatedAfter).toBeUndefined()
	})

	it('starts from saved documents, syncs only changes, and saves after each sync', async () => {
		const saved: SavedDocs = { later: { docs: [doc({ id: '9' })], truncated: false, syncedAt: HOUR, fullAt: HOUR } }
		const save = vi.fn<NonNullable<DocStoreDeps['save']>>()
		const fetch = vi.fn<DocStoreDeps['fetch']>().mockResolvedValue({ docs: [], truncated: false })
		const store = createDocStore({ fetch, load: () => Promise.resolve(saved), save, now: () => 2 * HOUR })
		await store.ready()
		expect(store.peek('later')?.docs.map((d) => d.id)).toEqual(['9'])
		await store.refresh('later')
		expect(fetch.mock.calls[0][0].updatedAfter).toBe(new Date(HOUR - 5 * 60_000).toISOString())
		expect(save).toHaveBeenCalledTimes(1)
		expect(save.mock.calls[0][0].later.syncedAt).toBe(2 * HOUR)
	})

	it('announces waits and progress from the fetch, and keeps held data on failure', async () => {
		const fetch = vi
			.fn<DocStoreDeps['fetch']>()
			.mockImplementationOnce((_s: unknown, onPage: (n: number) => void, onWait: (s: number) => void) => {
				onWait(3)
				onPage(1)
				return Promise.resolve(result)
			})
			.mockRejectedValue(new RwError('server', 'boom'))
		const store = createDocStore({ fetch })
		const seen: unknown[] = []
		store.subscribe((e) => seen.push(e))
		await store.refresh('later')
		expect(seen).toEqual([
			{ type: 'wait', seconds: 3 },
			{ type: 'progress', count: 1 },
		])
		await expect(store.refresh('later')).rejects.toThrow('boom')
		expect(store.peek('later')?.docs).toHaveLength(1)
	})

	it('merges slices by id and flags truncation', () => {
		const m = mergeEntries([{ docs: [doc({ id: '1' }), doc({ id: '2' })], truncated: false }, { docs: [doc({ id: '2' })], truncated: true }])
		expect(m.docs.map((d) => d.id)).toEqual(['1', '2'])
		expect(m.truncated).toBe(true)
	})
})

describe('presets and saved documents', () => {
	it('every preset compiles, and search narrows inside it', () => {
		for (const f of Object.values(PRESETS)) compile(f)
		expect(effectiveSearch('', 'tag:css')).toBe('tag:css')
		expect(effectiveSearch('later', '')).toBe('in:later')
		const q = effectiveSearch('later', 'tag:a OR tag:b')
		expect(q).toBe('in:later AND (tag:a OR tag:b)')
		expect(compile(q).test(doc({ location: 'archive', tags: { b: { name: 'b' } } }))).toBe(false)
		expect(planLocations(compile(q).ast)).toEqual(['later'])
	})

	it('round-trips and rejects anything else', () => {
		const saved: SavedDocs = { later: { docs: [doc()], truncated: false, syncedAt: 1, fullAt: 1 } }
		expect(parseDocs(serializeDocs(saved))).toEqual(saved)
		for (const bad of ['', 'nope', '{}', '{"v":2,"locations":{}}', '{"v":1,"locations":[]}']) expect(parseDocs(bad)).toBeNull()
	})
})
