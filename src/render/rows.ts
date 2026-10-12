import { RwError } from '../api/errors'
import type { RwBook, RwHighlight } from '../api/readwise'
import type { BlockParams } from '../block/params'
import type { Ctx } from '../filter/fields'
import type { Predicate } from '../filter/evaluate'

export interface Row {
	book: RwBook
	h: RwHighlight
}

/** A book with the highlights that matched the filter (all of them without one). */
export interface BookRow {
	book: RwBook
	matches: RwHighlight[]
}

type Order = Pick<BlockParams, 'sort' | 'limit'>

const ms = (iso?: string | null) => Date.parse(iso ?? '') || 0
const latest = (hs: RwHighlight[], pick: (h: RwHighlight) => string | null | undefined) => Math.max(0, ...hs.map((h) => ms(pick(h))))

const ROW_KEYS: Record<string, (r: Row) => string | number> = {
	highlighted_at: (r) => ms(r.h.highlighted_at),
	updated: (r) => ms(r.h.updated_at),
	title: (r) => r.book.title.toLowerCase(),
	author: (r) => (r.book.author ?? '').toLowerCase(),
}

const BOOK_KEYS: Record<string, (r: BookRow) => string | number> = {
	highlighted_at: (r) => latest(r.matches, (h) => h.highlighted_at),
	updated: (r) => latest(r.matches, (h) => h.updated_at),
	title: (r) => r.book.title.toLowerCase(),
	author: (r) => (r.book.author ?? '').toLowerCase(),
	num_highlights: (r) => r.matches.length,
}

export function sortLimit<T>(items: T[], { sort, limit }: Order, keys: Record<string, (t: T) => string | number>): T[] {
	const key = keys[sort.replace(/^-/, '')] ?? keys.highlighted_at
	const dir = sort.startsWith('-') ? -1 : 1
	return [...items].sort((a, b) => dir * (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0)).slice(0, limit)
}

export const highlightRows = (books: RwBook[]): Row[] => books.flatMap((book) => book.highlights.filter((h) => !h.is_deleted).map((h) => ({ book, h })))

/** Filters, sorts and truncates highlight rows. */
export function selectRows(rows: Row[], p: Order, test?: Predicate<Ctx>): Row[] {
	return sortLimit(test ? rows.filter(test) : rows, p, ROW_KEYS)
}

/** Books for the books view: with a filter, only those with at least one matching highlight. */
export function selectBooks(books: RwBook[], p: Order, test?: Predicate<Ctx>): BookRow[] {
	const all = books.map((book) => ({ book, matches: book.highlights.filter((h) => !h.is_deleted && (!test || test({ book, h }))) }))
	return sortLimit(test ? all.filter((r) => r.matches.length) : all, p, BOOK_KEYS)
}

type Format = BlockParams['format']
type Group = BlockParams['group']

/** The format and grouping that will actually be drawn, plus a note for each request that had to change. */
export function resolveLayout(p: Pick<BlockParams, 'view' | 'format' | 'group'>): { format: Format; group: Group; notes: string[] } {
	const notes: string[] = []
	let { format, group } = p
	if (p.view === 'books' && format === 'quote') {
		notes.push('format: quote is for highlights; showing a list.')
		format = 'list'
	}
	if (p.view === 'books' && group === 'book') {
		notes.push('group: book does not apply to the books view; showing no groups.')
		group = ''
	}
	return { format, group, notes }
}

/** Splits items into headed groups, in order of first appearance. A missing key means one unheaded group. */
export function groupBy<T>(items: T[], keyOf?: (t: T) => string): { heading?: string; items: T[] }[] {
	if (!keyOf) return [{ items }]
	const groups = new Map<string, T[]>()
	for (const item of items) groups.set(keyOf(item), [...(groups.get(keyOf(item)) ?? []), item])
	return [...groups].map(([heading, items]) => ({ heading, items }))
}

export const rowGroupKey = (group: Group): ((r: Row) => string) | undefined =>
	group === 'book' ? (r) => r.book.title : group === 'category' ? (r) => r.book.category ?? 'Other' : undefined

export const bookGroupKey = (group: Group): ((r: BookRow) => string) | undefined => (group === 'category' ? (r) => r.book.category ?? 'Other' : undefined)

/** What an empty result says, echoing the filter so a wrong one is easy to spot. */
export function emptyText(view: BlockParams['view'], search: string): string {
	if (view === 'review') return 'No review available.'
	const filter = search ? ` Filter: ${search}` : ''
	return `${view === 'books' ? 'No books match.' : 'No highlights match.'}${filter}`
}

/** Status line for a failed load; a missing daily review is an empty result, not a failure. */
export function describeFailure(e: unknown): { status: string; clear: boolean } {
	if (e instanceof RwError && e.kind === 'not-found') return { status: 'No review available.', clear: true }
	return { status: e instanceof Error ? e.message : String(e), clear: false }
}
