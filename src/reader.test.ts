import { describe, expect, it, vi } from 'vitest'
import { RwError } from './api/errors'
import type { HttpPort } from './api/http'
import { createLimiter } from './api/limiter'
import { createReaderClient, type DocSlice, type RdDoc } from './api/reader'
import { createDocStore, mergeEntries } from './cache/docs'
import { readerSchema } from './filter/readerFields'
import { planSlices, wantsHighlights } from './filter/plan'
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

describe('planSlices', () => {
	const plan = (src: string) => planSlices(compile(src).ast, 10).map((s) => [s.location, s.category])
	it('pushes plain positive top-level terms only', () => {
		expect(plan('in:later AND category:article')).toEqual([['later', 'article']])
		expect(plan('in:inbox')).toEqual([['new', undefined]])
		expect(plan('feed:true')).toEqual([['feed', undefined]])
		expect(plan('type:pdf AND tag:css')).toHaveLength(4)
	})

	it('does not push under OR, NOT, other operators or partial values', () => {
		expect(plan('in:later OR in:archive')).toHaveLength(4)
		expect(plan('NOT in:later')).toHaveLength(4)
		expect(plan('in__not:archive')).toHaveLength(4)
		expect(plan('category:art')).toEqual(expect.arrayContaining([['later', undefined]]))
	})

	it('fetches everything when the feed is mentioned, and leaves it out otherwise', () => {
		expect(planSlices(undefined, 10).map((s) => s.location)).toEqual(['new', 'later', 'shortlist', 'archive'])
		expect(plan('in:feed OR in:later')).toEqual([[undefined, undefined]])
		expect(plan('in__not:feed')).toEqual([[undefined, undefined]])
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
	const slice: DocSlice = { location: 'later', maxPages: 10 }
	const result = { docs: [doc()], truncated: false }

	it('shares in-flight fetches, serves fresh data, and refetches when stale', async () => {
		let t = 0
		const fetch = vi.fn().mockResolvedValue(result)
		const store = createDocStore({ fetch, now: () => t })
		await Promise.all([store.refresh(slice), store.refresh(slice), store.get(slice, 1000)])
		expect(fetch).toHaveBeenCalledTimes(1)
		await store.get(slice, 1000)
		expect(fetch).toHaveBeenCalledTimes(1)
		t = 5000
		await store.get(slice, 1000)
		expect(fetch).toHaveBeenCalledTimes(2)
		store.reset()
		expect(store.peek(slice)).toBeUndefined()
	})

	it('retries once after a 429, announcing the wait, and keeps held data on failure', async () => {
		const fetch = vi.fn().mockRejectedValueOnce(new RwError('rate-limit', 'slow', 3)).mockResolvedValueOnce(result).mockRejectedValue(new RwError('server', 'boom'))
		const sleep = vi.fn().mockResolvedValue(undefined)
		const store = createDocStore({ fetch, sleep })
		const seen: unknown[] = []
		store.subscribe((e) => seen.push(e))
		await store.refresh(slice)
		expect(seen).toEqual([{ type: 'wait', seconds: 3 }])
		expect(sleep).toHaveBeenCalledWith(3000)
		await expect(store.refresh(slice)).rejects.toThrow('boom')
		expect(store.peek(slice)?.docs).toHaveLength(1)
	})

	it('merges slices by id and flags truncation', () => {
		const m = mergeEntries([{ docs: [doc({ id: '1' }), doc({ id: '2' })], truncated: false }, { docs: [doc({ id: '2' })], truncated: true }])
		expect(m.docs.map((d) => d.id)).toEqual(['1', '2'])
		expect(m.truncated).toBe(true)
	})
})
