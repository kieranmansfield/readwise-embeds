import type { HttpPort } from './http'

const BASE = 'https://readwise.io/api/v2'

export interface RwExport {
	user_book_id: number
	title: string
	author: string
	category: string
	source_url?: string
	book_tags?: { name: string }[]
	highlights: { id: number; text: string; note?: string; tags?: { name: string }[] }[]
}

export function createReadwiseClient(http: HttpPort, getToken: () => string | null) {
	async function call<T>(path: string): Promise<T> {
		const token = getToken()
		if (!token) throw new Error('Readwise token is not set (Settings → Readwise embeds).')
		const res = await http.request({ method: 'GET', url: BASE + path, headers: { Authorization: `Token ${token}` } })
		if (res.status < 200 || res.status >= 300) throw new Error(`Readwise GET ${path} failed (${res.status})`)
		return res.json as T
	}

	return {
		/** Pages through /export/ (books with highlights nested); `updatedAfter` makes it incremental. */
		async exportAll(updatedAfter?: string): Promise<RwExport[]> {
			const out: RwExport[] = []
			let cursor: string | null = null
			do {
				const q: string = '/export/?' + new URLSearchParams({ ...(updatedAfter && { updatedAfter }), ...(cursor && { pageCursor: cursor }) })
				const r: { results: RwExport[]; nextPageCursor: string | null } = await call(q)
				out.push(...r.results)
				cursor = r.nextPageCursor
			} while (cursor)
			return out
		},
	}
}
