import type { HttpPort } from './http'
import { createCaller } from './request'

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
	cover_image_url?: string
	book_tags?: { name: string }[]
	highlights: RwHighlight[]
}

interface RwReviewHighlight {
	id: number
	text: string
	title?: string
	author?: string
	category?: string
	source_type?: string
	note?: string
	highlighted_at?: string
	highlight_url?: string
	book_id?: number
}

export function createReadwiseClient(http: HttpPort, getToken: () => string | null) {
	const call = createCaller(http, getToken, BASE)

	return {
		/** Pages through /export/ (books with highlights nested); `updatedAfter` makes it incremental and also returns deletions. */
		async exportAll(updatedAfter?: string, onPage?: (books: number) => void): Promise<RwBook[]> {
			const out: RwBook[] = []
			let cursor: string | null = null
			do {
				const params: Record<string, string> = {}
				if (updatedAfter) Object.assign(params, { updatedAfter, includeDeleted: 'true' })
				if (cursor) params.pageCursor = cursor
				const r = (await call('/export/?' + new URLSearchParams(params).toString())) as { results: RwBook[]; nextPageCursor: string | null }
				out.push(...r.results)
				onPage?.(out.length)
				cursor = r.nextPageCursor
			} while (cursor)
			return out
		},

		/** The latest daily review as rows. Throws `not-found` when there is none today. Field names are unverified against live data (plan section 13). */
		async review(): Promise<{ book: RwBook; h: RwHighlight }[]> {
			const r = (await call('/review/')) as { highlights?: RwReviewHighlight[] }
			return (r.highlights ?? []).map((x) => ({
				book: { user_book_id: x.book_id ?? 0, title: x.title ?? '', author: x.author, category: x.category, source: x.source_type, readwise_url: x.highlight_url, highlights: [] },
				h: { id: x.id, text: x.text, note: x.note, highlighted_at: x.highlighted_at, readwise_url: x.highlight_url },
			}))
		},

		/** Resolves if the token is valid. */
		async checkAuth(): Promise<void> {
			await call('/auth/')
		},
	}
}
