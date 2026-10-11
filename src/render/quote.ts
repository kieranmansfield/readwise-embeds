import type { Row } from './rows'
import { dateEl, noteLine, sourceLine, tagChips, type Show } from './dom'

/** Each highlight as a blockquote, its note beneath, and the source in a footer. */
export function highlightQuotes(el: HTMLElement, rows: Row[], show: Show) {
	for (const { book, h } of rows) {
		const fig = el.createEl('figure', 'rw-quote')
		fig.createEl('blockquote', { text: h.text })
		noteLine(fig, h, show.showNotes)
		const foot = fig.createEl('figcaption', 'rw-quote-foot')
		sourceLine(foot, book, 'rw-source-inline', show.showSource)
		dateEl(foot, h.highlighted_at)
		tagChips(foot, h, show.showTags)
	}
}
