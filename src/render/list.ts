import type { BlockParams } from '../block/params'
import type { BookRow, Row } from './rows'

type Show = Pick<BlockParams, 'showNotes' | 'showTags' | 'showSource'>

const day = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString() : '')

function source(li: HTMLElement, { title, author, url }: { title: string; author?: string; url?: string }) {
	const src = li.createDiv('rw-source')
	const t = url ? src.createEl('a', { href: url, text: title }) : src.createSpan({ text: title })
	t.addClass('rw-title')
	if (author) src.createSpan({ text: ` — ${author}` })
}

// fallow-ignore-next-line complexity
function highlight(li: HTMLElement, { book, h }: Row, show: Show) {
	li.createEl('blockquote', { cls: 'rw-text', text: h.text })
	if (show.showNotes && h.note) li.createDiv({ cls: 'rw-note', text: h.note })
	if (show.showSource) source(li, { title: book.title, author: book.author, url: book.readwise_url })
	if (show.showTags && h.tags?.length) {
		const tags = li.createDiv('rw-tags')
		for (const t of h.tags) tags.createSpan({ cls: 'rw-tag', text: t.name })
	}
}

export function drawHighlights(el: HTMLElement, rows: Row[], show: Show, empty: string) {
	if (!rows.length) return void el.createDiv({ cls: 'rw-empty', text: empty })
	const list = el.createEl('ul', 'rw-list')
	for (const row of rows) highlight(list.createEl('li', 'rw-item'), row, show)
}

export function drawBooks(el: HTMLElement, rows: BookRow[], empty: string) {
	if (!rows.length) return void el.createDiv({ cls: 'rw-empty', text: empty })
	const list = el.createEl('ul', 'rw-list')
	for (const { book, matches } of rows) {
		const li = list.createEl('li', 'rw-item')
		source(li, { title: book.title, author: book.author, url: book.readwise_url })
		const last = day(matches.map((h) => h.highlighted_at ?? '').sort().pop())
		const parts = [book.category, `${matches.length} highlights`, last && `last ${last}`]
		li.createDiv({ cls: 'rw-meta', text: parts.filter(Boolean).join(' · ') })
	}
}
