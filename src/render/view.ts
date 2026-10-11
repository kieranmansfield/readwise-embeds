import { MarkdownRenderChild } from 'obsidian'
import type { RwBook } from '../api/readwise'
import type { Store } from '../cache/cache'
import type { BlockParams } from '../block/params'
import type { Predicate } from '../filter/evaluate'
import { blockQuery, type Query } from '../filter/query'
import { drawBooks, drawHighlights } from './list'
import { describeFailure, emptyText, highlightRows, isSupported, selectBooks, selectRows, type Row } from './rows'

export interface BlockDeps {
	library: Store
	review: () => Promise<Row[]>
	maxAgeMs: number
}

interface Data {
	books: RwBook[]
	rows: Row[]
}

const fromBooks = (books: RwBook[]): Data => ({ books, rows: highlightRows(books) })

/** One `readwise` block. A MarkdownRenderChild, so the refresh timer goes away with the block. */
export class ReadwiseBlock extends MarkdownRenderChild {
	private data?: Data
	private status?: string
	private query?: Query
	private test?: Predicate

	constructor(
		el: HTMLElement,
		private deps: BlockDeps,
		private params: BlockParams,
		private warnings: string[]
	) {
		super(el)
		Object.assign(this, blockQuery(params.view === 'review' ? '' : params.search))
	}

	// fallow-ignore-next-line unused-class-member
	onload() {
		this.containerEl.addClass('rw-block')
		const held = this.deps.library.peek()
		if (this.params.view !== 'review' && held.fetchedAt) this.data = fromBooks(held.books)
		this.draw()
		void this.fetchAndDraw(false)
		this.registerInterval(window.setInterval(() => void this.fetchAndDraw(true), this.deps.maxAgeMs))
	}

	private async fetchData(force: boolean): Promise<Data> {
		if (this.params.view === 'review') return { books: [], rows: await this.deps.review() }
		const { library, maxAgeMs } = this.deps
		return fromBooks((await (force ? library.refresh() : library.get(maxAgeMs))).books)
	}

	/** Shows stale data while fetching; on failure keeps it and adds the reason. */
	private async fetchAndDraw(force: boolean) {
		try {
			this.data = await this.fetchData(force)
			this.status = undefined
		} catch (e) {
			const { status, clear } = describeFailure(e)
			if (clear) this.data = { books: [], rows: [] }
			this.status = status
		}
		this.draw()
	}

	// fallow-ignore-next-line complexity
	private draw() {
		const el = this.containerEl
		el.empty()
		const bar = el.createDiv('rw-bar')
		if (this.status) bar.createSpan({ cls: 'rw-status', text: this.status })
		const refresh = bar.createEl('button', { cls: 'rw-refresh clickable-icon', attr: { 'aria-label': 'Refresh' }, text: '↻' })
		refresh.onclick = () => void this.fetchAndDraw(true)
		for (const w of this.warnings) el.createDiv({ cls: 'rw-warning', text: w })

		if (!isSupported(this.params)) return void el.createDiv({ cls: 'rw-warning', text: 'The table and quote formats and grouping are not available yet.' })
		if (this.query && 'error' in this.query) return this.drawQueryError(this.query)
		if (!this.data) return void el.createDiv({ cls: 'rw-empty', text: 'Loading highlights…' })
		this.drawBody(this.data)
	}

	private drawQueryError({ error, pos }: { error: string; pos: number }) {
		const box = this.containerEl.createDiv('rw-error')
		box.createDiv({ text: `Filter error: ${error}` })
		box.createEl('pre', { text: `${this.params.search}\n${' '.repeat(pos)}^` })
	}

	private drawBody(data: Data) {
		const { view, search } = this.params
		const empty = emptyText(view, view === 'review' ? '' : search)
		if (view === 'books') return drawBooks(this.containerEl, selectBooks(data.books, this.params, this.test), empty)
		drawHighlights(this.containerEl, selectRows(data.rows, this.params, this.test), this.params, empty)
	}
}
