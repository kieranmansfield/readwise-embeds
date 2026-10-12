import type { HttpPort } from './http'
import { createCaller } from './request'

const BASE = 'https://readwise.io/api/v3'

/** A Reader document as the list endpoint returns it. Every field but `id` may be missing; unknown fields are ignored. */
export interface RdDoc {
	id: string
	/** The document in Reader. */
	url?: string
	/** The original page; `private://…` for uploads. */
	source_url?: string
	title?: string
	author?: string
	source?: string
	category?: string
	location?: string
	site_name?: string
	/** Keyed by tag key; the shape is unverified against live data, so only `name` is read. */
	tags?: Record<string, { name?: string }>
	word_count?: number
	reading_time?: string
	/** 0–1. */
	reading_progress?: number
	notes?: string
	summary?: string
	image_url?: string
	parent_id?: string | null
	saved_at?: string
	updated_at?: string
	last_moved_at?: string
	first_opened_at?: string | null
	last_opened_at?: string | null
	/** An ISO date or epoch milliseconds; both are read. */
	published_date?: string | number | null
}

/** What can be pushed into the request. Anything else is filtered after download. */
export interface DocSlice {
	location?: string
	category?: string
	/** Page cap for this slice; part of the cache key. */
	maxPages: number
}

export interface DocResult {
	docs: RdDoc[]
	/** The page cap stopped the fetch before the last page. */
	truncated: boolean
}

export function createReaderClient(http: HttpPort, getToken: () => string | null, beforeRequest: () => Promise<void>) {
	const call = createCaller(http, getToken, BASE, beforeRequest)

	return {
		/** Pages through `/list/` (100 a page) up to `maxPages`, then reports whether more was left. */
		async list({ location, category, maxPages }: DocSlice, onPage?: (count: number) => void): Promise<DocResult> {
			const docs: RdDoc[] = []
			let cursor: string | null = null
			for (let page = 0; page < maxPages; page++) {
				const params: Record<string, string> = {}
				if (location) params.location = location
				if (category) params.category = category
				if (cursor) params.pageCursor = cursor
				const r = (await call('/list/?' + new URLSearchParams(params).toString())) as { results?: RdDoc[]; nextPageCursor?: string | null }
				docs.push(...(r.results ?? []))
				onPage?.(docs.length)
				cursor = r.nextPageCursor ?? null
				if (!cursor) break
			}
			return { docs, truncated: cursor !== null }
		},
	}
}
