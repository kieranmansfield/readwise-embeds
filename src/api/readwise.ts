import type { HttpPort } from './http'

const BASE = 'https://readwise.io/api/v2'

export interface RwHighlight {
	id: number
	text: string
	note?: string
	color?: string
	tags?: { name: string }[]
	highlighted_at?: string | null
	updated_at?: string
	is_favorite?: boolean
	is_discard?: boolean
	is_deleted?: boolean
	readwise_url?: string
}

export interface RwBook {
	user_book_id: number
	title: string
	author?: string
	category?: string
	source?: string
	readwise_url?: string
	book_tags?: { name: string }[]
	highlights: RwHighlight[]
}

export type RwErrorKind = 'no-token' | 'auth' | 'rate-limit' | 'server'

export class RwError extends Error {
	constructor(
		readonly kind: RwErrorKind,
		message: string,
		/** Seconds to wait, from `Retry-After`, for `rate-limit`. */
		readonly retryAfter = 60
	) {
		super(message)
	}
}

export function createReadwiseClient(http: HttpPort, getToken: () => string | null) {
	async function call(path: string) {
		const token = getToken()
		if (!token) throw new RwError('no-token', 'Readwise token is not set (Settings → Readwise embeds).')
		const res = await http.request({ method: 'GET', url: BASE + path, headers: { Authorization: `Token ${token}` } })
		if (res.status === 401 || res.status === 403) throw new RwError('auth', 'Readwise rejected the token.')
		if (res.status === 429) throw new RwError('rate-limit', 'Readwise rate limit reached.', res.retryAfter)
		if (res.status < 200 || res.status >= 300) throw new RwError('server', `Readwise GET ${path} failed (${res.status}).`)
		return res.json
	}

	return {
		/** Pages through /export/ (books with highlights nested); `updatedAfter` makes it incremental and also returns deletions. */
		async exportAll(updatedAfter?: string): Promise<RwBook[]> {
			const out: RwBook[] = []
			let cursor: string | null = null
			do {
				const params: Record<string, string> = {}
				if (updatedAfter) Object.assign(params, { updatedAfter, includeDeleted: 'true' })
				if (cursor) params.pageCursor = cursor
				const r = (await call('/export/?' + new URLSearchParams(params).toString())) as { results: RwBook[]; nextPageCursor: string | null }
				out.push(...r.results)
				cursor = r.nextPageCursor
			} while (cursor)
			return out
		},

		/** Resolves if the token is valid. */
		async checkAuth(): Promise<void> {
			await call('/auth/')
		},
	}
}
