import { MarkdownRenderChild } from 'obsidian'
import { RwError, type RwBook, type RwHighlight } from '../api/readwise'
import { isSupported, selectRows } from './rows'
import type { Snapshot, Store } from '../cache/cache'
import type { BlockParams } from '../block/params'

/** One `readwise` block. A MarkdownRenderChild, so the refresh timer goes away with the block. */
export class ReadwiseBlock extends MarkdownRenderChild {
	constructor(
		el: HTMLElement,
		private store: Store,
		private params: BlockParams,
		private warnings: string[],
		private maxAgeMs: number
	) {
		super(el)
	}

	// fallow-ignore-next-line unused-class-member
	onload() {
		this.containerEl.addClass('rw-block')
		this.draw(this.store.peek(), this.store.peek().fetchedAt ? undefined : 'Loading highlights…')
		void this.fetchAndDraw(() => this.store.get(this.maxAgeMs))
		this.registerInterval(window.setInterval(() => void this.fetchAndDraw(() => this.store.refresh()), this.maxAgeMs))
	}

	/** Shows stale data while fetching; on failure keeps it and adds the reason. */
	private async fetchAndDraw(fetch: () => Promise<Snapshot>) {
		try {
			this.draw(await fetch())
		} catch (e) {
			this.draw(this.store.peek(), e instanceof Error ? e.message : String(e), e instanceof RwError && e.kind === 'rate-limit')
		}
	}

	// fallow-ignore-next-line complexity
	private draw(snap: Snapshot, status?: string, retrying = false) {
		const el = this.containerEl
		el.empty()
		const bar = el.createDiv('rw-bar')
		const refresh = bar.createEl('button', { cls: 'rw-refresh clickable-icon', attr: { 'aria-label': 'Refresh' }, text: '↻' })
		refresh.onclick = () => void this.fetchAndDraw(() => this.store.refresh())
		if (status) bar.createSpan({ cls: 'rw-status', text: retrying ? `${status} Showing saved results.` : status })
		for (const w of this.warnings) el.createDiv({ cls: 'rw-warning', text: w })

		if (!isSupported(this.params)) {
			el.createDiv({ cls: 'rw-warning', text: 'Only the highlights view, list format and no search are supported so far.' })
			return
		}
		if (!snap.fetchedAt) return
		const rows = selectRows(snap.books, this.params)
		if (!rows.length) return void el.createDiv({ cls: 'rw-empty', text: 'No highlights match.' })
		const list = el.createEl('ul', 'rw-list')
		for (const { book, h } of rows) this.drawRow(list.createEl('li', 'rw-item'), book, h)
	}

	// fallow-ignore-next-line complexity
	private drawRow(li: HTMLElement, book: RwBook, h: RwHighlight) {
		li.createEl('blockquote', { cls: 'rw-text', text: h.text })
		if (this.params.showNotes && h.note) li.createDiv({ cls: 'rw-note', text: h.note })
		if (this.params.showSource) {
			const src = li.createDiv('rw-source')
			const title = book.readwise_url ? src.createEl('a', { href: book.readwise_url, text: book.title }) : src.createSpan({ text: book.title })
			title.addClass('rw-title')
			if (book.author) src.createSpan({ text: ` — ${book.author}` })
		}
		if (this.params.showTags && h.tags?.length) {
			const tags = li.createDiv('rw-tags')
			for (const t of h.tags) tags.createSpan({ cls: 'rw-tag', text: t.name })
		}
	}
}
