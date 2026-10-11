import type { BookRow, Row } from './rows'
import { day, sourceLine, tagChips, type Show } from './dom'

interface Column<T> {
	header: string
	cell: (td: HTMLElement, item: T) => void
}

function table<T>(el: HTMLElement, columns: Column<T>[], items: T[]) {
	const t = el.createEl('table', 'rw-table')
	const head = t.createEl('thead').createEl('tr')
	for (const c of columns) head.createEl('th', { text: c.header })
	const body = t.createEl('tbody')
	for (const item of items) {
		const tr = body.createEl('tr')
		for (const c of columns) c.cell(tr.createEl('td'), item)
	}
}

export function highlightTable(el: HTMLElement, rows: Row[], show: Show) {
	const columns: (Column<Row> | false)[] = [
		{ header: 'Highlight', cell: (td, r) => void td.setText(r.h.text) },
		show.showSource && { header: 'Source', cell: (td, r) => sourceLine(td, r.book, 'rw-source-inline') },
		show.showNotes && { header: 'Note', cell: (td, r) => void td.setText(r.h.note ?? '') },
		show.showTags && { header: 'Tags', cell: (td, r) => tagChips(td, r.h) },
		{ header: 'Date', cell: (td, r) => void td.setText(day(r.h.highlighted_at)) },
	]
	table(el, columns.filter((c) => c !== false), rows)
}

export function bookTable(el: HTMLElement, rows: BookRow[]) {
	table<BookRow>(
		el,
		[
			{ header: 'Title', cell: (td, r) => sourceLine(td, { ...r.book, author: undefined }, 'rw-source-inline') },
			{ header: 'Author', cell: (td, r) => void td.setText(r.book.author ?? '') },
			{ header: 'Category', cell: (td, r) => void td.setText(r.book.category ?? '') },
			{ header: 'Highlights', cell: (td, r) => void td.setText(String(r.matches.length)) },
			{ header: 'Last', cell: (td, r) => void td.setText(day(r.matches.map((h) => h.highlighted_at ?? '').sort().pop())) },
		],
		rows
	)
}
