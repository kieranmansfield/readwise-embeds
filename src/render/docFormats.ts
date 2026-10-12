import type { RdDoc } from '../api/reader'
import type { Column, ReaderParams } from '../block/readerParams'
import { minutesOf } from '../filter/readerFields'
import { day } from './dom'
import { drawGrouped } from './formats'

type Show = Pick<ReaderParams, 'showTags' | 'showSummary'>

const tagNames = (d: RdDoc) => Object.values(d.tags ?? {}).flatMap((t) => (t.name ? [t.name] : []))
const hasOwnPage = (d: RdDoc) => !!d.source_url && !d.source_url.startsWith('private://')

/** "Author · site · 12 min · saved 1/2/2026" */
function docMeta(d: RdDoc): string {
	const m = minutesOf(d)
	return [d.author, d.site_name, m && `${m} min`, d.saved_at && `saved ${day(d.saved_at)}`].filter(Boolean).join(' · ')
}

function title(parent: HTMLElement, d: RdDoc, cls: string) {
	const text = d.title || d.source_url || 'Untitled'
	const el = d.url ? parent.createEl('a', { href: d.url, text }) : parent.createSpan({ text })
	el.addClass(cls)
}

function original(parent: HTMLElement, d: RdDoc) {
	if (hasOwnPage(d)) parent.createEl('a', { cls: 'rw-original', href: d.source_url, text: 'Original', attr: { 'aria-label': `Original page of ${d.title ?? 'document'}` } })
}

function tags(parent: HTMLElement, d: RdDoc, on: boolean) {
	const names = on ? tagNames(d) : []
	if (!names.length) return
	const box = parent.createDiv('rw-tags')
	names.forEach((n) => box.createSpan({ cls: 'rw-tag', text: n }))
}

function progress(parent: HTMLElement, d: RdDoc) {
	const pct = Math.round((d.reading_progress ?? 0) * 100)
	if (pct > 0) parent.createEl('progress', { cls: 'rw-progress', attr: { max: '100', value: String(pct), 'aria-label': `${pct}% read` } })
}

function summary(parent: HTMLElement, d: RdDoc, on: boolean) {
	if (on && d.summary) parent.createDiv({ cls: 'rw-summary', text: d.summary })
}

function docList(el: HTMLElement, docs: RdDoc[], show: Show) {
	const list = el.createEl('ul', 'rw-list')
	for (const d of docs) {
		const li = list.createEl('li', 'rw-item')
		const head = li.createDiv('rw-doc-head')
		title(head, d, 'rw-title')
		original(head, d)
		li.createDiv({ cls: 'rw-meta', text: docMeta(d) })
		summary(li, d, show.showSummary)
		tags(li, d, show.showTags)
		progress(li, d)
	}
}

/** Full-width cards in the style of Reader's library: cover on the side, title, byline, summary. */
function docCards(el: HTMLElement, docs: RdDoc[], show: Show, covers: boolean) {
	for (const d of docs) {
		const card = el.createDiv('rw-card rw-card-book')
		// Cover images come from the original site, so they only load when the user turned that on; no referrer is sent.
		if (covers && d.image_url) card.createEl('img', { cls: 'rw-cover', attr: { src: d.image_url, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' } })
		const body = card.createDiv('rw-card-body')
		const head = body.createDiv('rw-doc-head')
		title(head, d, 'rw-card-title')
		original(head, d)
		body.createDiv({ cls: 'rw-meta', text: docMeta(d) })
		summary(body, d, show.showSummary)
		tags(body, d, show.showTags)
		progress(body, d)
	}
}

const CELLS: Record<Column, { header: string; cell: (td: HTMLElement, d: RdDoc) => void }> = {
	title: { header: 'Title', cell: (td, d) => title(td, d, 'rw-title') },
	author: { header: 'Author', cell: (td, d) => void td.setText(d.author ?? '') },
	site: { header: 'Site', cell: (td, d) => void td.setText(d.site_name ?? '') },
	category: { header: 'Category', cell: (td, d) => void td.setText(d.category ?? '') },
	location: { header: 'Location', cell: (td, d) => void td.setText(d.location ?? '') },
	words: { header: 'Words', cell: (td, d) => void td.setText(d.word_count?.toString() ?? '') },
	time: { header: 'Time', cell: (td, d) => void td.setText(minutesOf(d) ? `${minutesOf(d)} min` : '') },
	progress: { header: 'Progress', cell: (td, d) => progress(td, d) },
	saved: { header: 'Saved', cell: (td, d) => void td.setText(day(d.saved_at)) },
	published: { header: 'Published', cell: (td, d) => void td.setText(typeof d.published_date === 'number' ? new Date(d.published_date).toLocaleDateString() : day(d.published_date)) },
	tags: { header: 'Tags', cell: (td, d) => tags(td, d, true) },
}

function docTable(el: HTMLElement, docs: RdDoc[], columns: Column[]) {
	const t = el.createDiv('rw-table-wrap').createEl('table', 'rw-table')
	const head = t.createEl('thead').createEl('tr')
	for (const c of columns) head.createEl('th', { text: CELLS[c].header, attr: { scope: 'col' } })
	const body = t.createEl('tbody')
	for (const d of docs) {
		const tr = body.createEl('tr')
		for (const c of columns) CELLS[c].cell(tr.createEl('td'), d)
	}
}

export function drawDocs(el: HTMLElement, docs: RdDoc[], p: ReaderParams, covers: boolean, keyOf: ((d: RdDoc) => string) | undefined, empty: string) {
	drawGrouped(el, docs, keyOf, empty, (box, items) => {
		if (p.format === 'table') docTable(box, items, p.columns)
		else if (p.format === 'card') docCards(box, items, p, covers)
		else docList(box, items, p)
	})
}
