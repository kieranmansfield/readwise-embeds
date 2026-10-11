import { describe, expect, it } from 'vitest'
import type { HttpPort } from './http'
import { createReadwiseClient, RwError } from './readwise'

const fake = (...responses: { status: number; json?: unknown; retryAfter?: number }[]) => {
	const urls: string[] = []
	const http: HttpPort = {
		request: ({ url }) => {
			urls.push(url)
			return Promise.resolve({ json: undefined, ...responses.shift()! })
		},
	}
	return { urls, client: createReadwiseClient(http, () => 'tok') }
}
const kind = (p: Promise<unknown>) => p.then(() => 'ok', (e: RwError) => e.kind)

describe('readwise client', () => {
	it('follows the export cursor and sends deletions flags on incremental calls', async () => {
		const { client, urls } = fake({ status: 200, json: { results: [{ user_book_id: 1 }], nextPageCursor: 'c1' } }, { status: 200, json: { results: [{ user_book_id: 2 }], nextPageCursor: null } })
		expect(await client.exportAll('2026-01-01T00:00:00.000Z')).toHaveLength(2)
		expect(urls[0]).toContain('includeDeleted=true')
		expect(urls[1]).toContain('pageCursor=c1')
	})

	it('maps statuses to typed errors', async () => {
		expect(await kind(fake({ status: 401 }).client.checkAuth())).toBe('auth')
		expect(await kind(fake({ status: 404 }).client.review())).toBe('not-found')
		expect(await kind(fake({ status: 500 }).client.exportAll())).toBe('server')
		const limited = fake({ status: 429, retryAfter: 12 }).client.exportAll()
		await expect(limited).rejects.toMatchObject({ kind: 'rate-limit', retryAfter: 12 })
		expect(await kind(createReadwiseClient({ request: () => Promise.reject(new Error('x')) }, () => null).checkAuth())).toBe('no-token')
	})

	it('maps review highlights to rows', async () => {
		const { client } = fake({ status: 200, json: { highlights: [{ id: 5, text: 'hi', title: 'T', author: 'A', highlight_url: 'u' }] } })
		expect(await client.review()).toMatchObject([{ book: { title: 'T', readwise_url: 'u' }, h: { id: 5, text: 'hi' } }])
	})
})
