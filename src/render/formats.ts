import type { BlockParams } from '../block/params'
import { bookCards, highlightCards } from './card'
import { bookList, highlightList } from './list'
import { highlightQuotes } from './quote'
import { bookTable, highlightTable } from './table'
import { groupBy, type BookRow, type Row } from './rows'
import type { Show } from './dom'

type Format = BlockParams['format']

const HIGHLIGHTS: Record<Format, (el: HTMLElement, rows: Row[], show: Show) => void> = {
	list: highlightList,
	table: highlightTable,
	quote: highlightQuotes,
	card: highlightCards,
}

// Quote has no meaning for books; resolveLayout swaps it for list and says so.
const BOOKS: Record<Format, (el: HTMLElement, rows: BookRow[], covers: boolean) => void> = {
	list: bookList,
	table: bookTable,
	quote: bookList,
	card: bookCards,
}

/** Draws `items` under optional group headings, or `empty` when there are none. */
export function drawGrouped<T>(el: HTMLElement, items: T[], keyOf: ((t: T) => string) | undefined, empty: string, draw: (box: HTMLElement, items: T[]) => void) {
	if (!items.length) return void el.createDiv({ cls: 'rw-empty', text: empty })
	for (const g of groupBy(items, keyOf)) {
		if (g.heading) el.createEl('h4', { cls: 'rw-group', text: g.heading })
		draw(el, g.items)
	}
}

export const drawHighlightRows = (el: HTMLElement, rows: Row[], format: Format, show: Show, keyOf: ((r: Row) => string) | undefined, empty: string) =>
	drawGrouped(el, rows, keyOf, empty, (box, items) => HIGHLIGHTS[format](box, items, show))

export const drawBookRows = (el: HTMLElement, rows: BookRow[], format: Format, covers: boolean, keyOf: ((r: BookRow) => string) | undefined, empty: string) =>
	drawGrouped(el, rows, keyOf, empty, (box, items) => BOOKS[format](box, items, covers))
