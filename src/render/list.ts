import type { BookRow, Row } from './rows'
import { bookMeta, noteLine, sourceLine, tagChips, type Show } from './dom'

export function highlightList(el: HTMLElement, rows: Row[], show: Show) {
	const list = el.createEl('ul', 'rw-list')
	for (const { book, h } of rows) {
		const li = list.createEl('li', 'rw-item')
		li.createEl('blockquote', { cls: 'rw-text', text: h.text })
		noteLine(li, h, show.showNotes)
		sourceLine(li, book, 'rw-source', show.showSource)
		tagChips(li, h, show.showTags)
	}
}

export function bookList(el: HTMLElement, rows: BookRow[]) {
	const list = el.createEl('ul', 'rw-list')
	for (const { book, matches } of rows) {
		const li = list.createEl('li', 'rw-item')
		sourceLine(li, book)
		li.createDiv({ cls: 'rw-meta', text: bookMeta(book, matches) })
	}
}
