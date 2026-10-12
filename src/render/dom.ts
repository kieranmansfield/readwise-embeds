import type { RwBook, RwHighlight } from '../api/readwise'
import type { BlockParams } from '../block/params'

export type Show = Pick<BlockParams, 'showNotes' | 'showTags' | 'showSource'>

export const day = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString() : '')

/** `on` lets callers pass a `showSource` flag instead of branching. */
/** A `<time>` element, so assistive tech and readers get the machine date. Nothing without a date. */
export function dateEl(parent: HTMLElement, iso?: string | null) {
	if (iso) parent.createEl('time', { cls: 'rw-date', text: day(iso), attr: { datetime: iso } })
}

export function sourceLine(parent: HTMLElement, book: RwBook, cls = 'rw-source', on = true) {
	if (!on) return
	const src = parent.createDiv({ cls, attr: { 'data-book-id': String(book.user_book_id) } })
	const title = book.readwise_url ? src.createEl('a', { href: book.readwise_url, text: book.title }) : src.createSpan({ text: book.title })
	title.addClass('rw-title')
	if (book.author) src.createSpan({ text: ` — ${book.author}` })
}

export function tagChips(parent: HTMLElement, h: RwHighlight, on = true) {
	const names = on ? (h.tags ?? []).map((t) => t.name) : []
	if (!names.length) return
	const tags = parent.createDiv('rw-tags')
	names.forEach((name) => tags.createSpan({ cls: 'rw-tag', text: name }))
}

export function noteLine(parent: HTMLElement, h: RwHighlight, on = true) {
	if (on && h.note) parent.createDiv({ cls: 'rw-note', text: h.note, attr: { 'data-md': '' } })
}

/** "Category · 3 highlights · last 1/2/2025" */
export function bookMeta(book: RwBook, matches: RwHighlight[]): string {
	const last = day(matches.map((h) => h.highlighted_at ?? '').sort().pop())
	return [book.category, `${matches.length} highlights`, last && `last ${last}`].filter(Boolean).join(' · ')
}
