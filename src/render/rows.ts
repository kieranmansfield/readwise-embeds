import type { RwBook, RwHighlight } from '../api/readwise'
import type { BlockParams } from '../block/params'

export interface Row {
	book: RwBook
	h: RwHighlight
}

const time = (h: RwHighlight) => Date.parse(h.highlighted_at ?? '') || 0

/** Flattens, sorts and truncates per the block params. Only highlight sorts exist so far. */
export function selectRows(books: RwBook[], p: Pick<BlockParams, 'sort' | 'limit'>): Row[] {
	const desc = p.sort.startsWith('-')
	const key = p.sort.replace(/^-/, '')
	const val = (r: Row) => (key === 'updated' ? Date.parse(r.h.updated_at ?? '') || 0 : time(r.h))
	const rows = books.flatMap((book) => book.highlights.filter((h) => !h.is_deleted).map((h) => ({ book, h })))
	rows.sort((a, b) => (desc ? val(b) - val(a) : val(a) - val(b)))
	return rows.slice(0, p.limit)
}

/** Milestone 1 renders only the unfiltered highlights list; anything else must say so rather than show a wrong list. */
export function isSupported(p: Pick<BlockParams, 'view' | 'search' | 'format'>): boolean {
	return p.view === 'highlights' && !p.search && p.format === 'list'
}
