import { MarkdownRenderChild } from 'obsidian'
import type { RwBook } from '../api/readwise'
import type { Store, StoreEvent } from '../cache/cache'
import type { BlockParams } from '../block/params'
import type { Predicate } from '../filter/evaluate'
import { blockQuery, type Query } from '../filter/query'
import { drawBookRows, drawHighlightRows } from './formats'
import { bookGroupKey, describeFailure, emptyText, highlightRows, resolveLayout, rowGroupKey, selectBooks, selectRows, type Row } from './rows'

export interface BlockDeps {
	library: Store
	review: () => Promise<Row[]>
	maxAgeMs: number
	covers: boolean
	/** Every live block, so commands can refresh them. */
	blocks: Set<ReadwiseBlock>
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
	private statusEl?: HTMLElement
	private fetching = false
	private query?: Query
	private test?: Predicate
	private layout = resolveLayout(this.params)

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
		const { library, blocks, maxAgeMs } = this.deps
		blocks.add(this)
		this.register(() => blocks.delete(this))
		this.register(library.subscribe((e) => this.onEvent(e)))
		this.draw()
		void library.ready().then(() => this.showHeld())
		void this.refresh(false)
		this.registerInterval(window.setInterval(() => void this.refresh(), maxAgeMs))
	}

	/** Shows the library already held (saved from an earlier session, or fetched by another block) while a fetch runs. */
	private showHeld() {
		const held = this.deps.library.peek()
		if (this.data || this.params.view === 'review' || !held.fetchedAt) return
		this.data = fromBooks(held.books)
		this.draw()
	}

	private async fetchData(force: boolean): Promise<Data> {
		if (this.params.view === 'review') return { books: [], rows: await this.deps.review() }
		const { library, maxAgeMs } = this.deps
		return fromBooks((await (force ? library.refresh() : library.get(maxAgeMs))).books)
	}

	/** Shows stale data while fetching; on failure keeps it and adds the reason. */
	async refresh(force = true) {
		this.fetching = true
		try {
			this.data = await this.fetchData(force)
			this.status = undefined
		} catch (e) {
			const { status, clear } = describeFailure(e)
			if (clear) this.data = { books: [], rows: [] }
			this.status = status
		}
		this.fetching = false
		this.draw()
	}

	private setStatus(text: string) {
		this.status = text
		this.statusEl?.setText(text)
	}

	private onEvent(e: StoreEvent) {
		if (!this.fetching) return
		if (e.type === 'progress') this.setStatus(`Loading… ${e.books} sources`)
		else this.countdown(e.seconds)
	}

	/** Ticks "retrying in Ns" until the wait ends or this block stops fetching; saved results stay visible meanwhile. */
	private countdown(seconds: number) {
		const end = Date.now() + seconds * 1000
		const id = window.setInterval(() => {
			const left = Math.ceil((end - Date.now()) / 1000)
			if (left <= 0 || !this.fetching) return window.clearInterval(id)
			this.setStatus(`Rate limited. Retrying in ${left}s.`)
		}, 1000)
		this.registerInterval(id)
		this.setStatus(`Rate limited. Retrying in ${seconds}s.`)
	}

	// fallow-ignore-next-line complexity
	private draw() {
		const el = this.containerEl
		el.empty()
		const bar = el.createDiv('rw-bar')
		this.statusEl = bar.createSpan({ cls: 'rw-status', text: this.status ?? '', attr: { role: 'status', 'aria-live': 'polite' } })
		const refresh = bar.createEl('button', { cls: 'rw-refresh clickable-icon', attr: { 'aria-label': 'Refresh', title: 'Refresh' }, text: '↻' })
		refresh.onclick = () => void this.refresh()
		for (const w of [...this.warnings, ...this.layout.notes]) el.createDiv({ cls: 'rw-warning', text: w })

		if (this.query && 'error' in this.query) return this.drawQueryError(this.query)
		if (!this.data) return this.drawSkeleton()
		this.drawBody(this.data)
	}

	private drawSkeleton() {
		const box = this.containerEl.createDiv({ cls: 'rw-skeleton', attr: { 'aria-busy': 'true' } })
		for (let i = 0; i < 3; i++) box.createDiv('rw-skeleton-row')
	}

	private drawQueryError({ error, pos }: { error: string; pos: number }) {
		const box = this.containerEl.createDiv({ cls: 'rw-error', attr: { role: 'alert' } })
		box.createDiv({ text: `Filter error: ${error}` })
		box.createEl('pre', { text: `${this.params.search}\n${' '.repeat(pos)}^` })
	}

	private drawBody(data: Data) {
		const { view, search } = this.params
		const { format, group } = this.layout
		const empty = emptyText(view, view === 'review' ? '' : search)
		if (view === 'books') return drawBookRows(this.containerEl, selectBooks(data.books, this.params, this.test), format, this.deps.covers, bookGroupKey(group), empty)
		drawHighlightRows(this.containerEl, selectRows(data.rows, this.params, this.test), format, this.params, rowGroupKey(group), empty)
	}
}
