import type { BookRow, Row } from './rows'
import { bookMeta, day, noteLine, sourceLine, tagChips, type Show } from './dom'

/** Full-width highlight cards: the text up front, a stripe in the highlight's colour, the source beneath. */
export function highlightCards(el: HTMLElement, rows: Row[], show: Show) {
	for (const { book, h } of rows) {
		const card = el.createDiv({ cls: 'rw-card rw-card-highlight', attr: { 'data-color': h.color ?? '' } })
		card.createDiv({ cls: 'rw-card-text', text: h.text })
		noteLine(card, h, show.showNotes)
		const foot = card.createDiv('rw-card-foot')
		sourceLine(foot, book, 'rw-source-inline', show.showSource)
		foot.createSpan({ cls: 'rw-date', text: day(h.highlighted_at) })
		tagChips(card, h, show.showTags)
	}
}

/** Full-width document cards in the style of Reader's library: cover on the side, title, byline, counts. */
export function bookCards(el: HTMLElement, rows: BookRow[], covers: boolean) {
	for (const { book, matches } of rows) {
		const card = el.createDiv('rw-card rw-card-book')
		// Cover images come from the original site, so they only load when the user turned that on; no referrer is sent.
		if (covers && book.cover_image_url) card.createEl('img', { cls: 'rw-cover', attr: { src: book.cover_image_url, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' } })
		const body = card.createDiv('rw-card-body')
		sourceLine(body, book, 'rw-card-title')
		body.createDiv({ cls: 'rw-meta', text: bookMeta(book, matches) })
	}
}
