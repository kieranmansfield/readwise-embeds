import type { App } from 'obsidian'
import { linkNotes } from './noteLinks'
import { effectiveSearch } from '../block/presets'
import type { RwBook } from '../api/readwise'
import type { Store } from '../cache/cache'
import type { StoreEvent } from '../cache/retry'
import type { BlockParams } from '../block/params'
import type { Predicate } from '../filter/evaluate'
import { readwiseSchema, type Ctx } from '../filter/fields'
import { blockQuery } from '../filter/query'
import { EmbedBlock, type BlockCommon } from './block'
import { drawBookRows, drawHighlightRows } from './formats'
import { bookGroupKey, emptyText, highlightRows, resolveLayout, rowGroupKey, selectBooks, selectRows, type Row } from './rows'

export interface ReadwiseDeps {
	library: Store
	review: () => Promise<Row[]>
	covers: boolean
	app: App
	/** Frontmatter property to match notes on; empty turns note links off. */
	noteProperty: string
}

interface Data {
	books: RwBook[]
	rows: Row[]
}

const fromBooks = (books: RwBook[]): Data => ({ books, rows: highlightRows(books) })

const noticesOf = (params: BlockParams, warnings: string[]) => (params.warnings ? [...warnings, ...resolveLayout(params).notes] : [])

/** One `readwise` block: highlights, books or the daily review. */
export class ReadwiseBlock extends EmbedBlock {
	private data?: Data
	private test?: Predicate<Ctx>
	private layout = resolveLayout(this.params)

	constructor(
		el: HTMLElement,
		common: BlockCommon,
		private deps: ReadwiseDeps,
		private params: BlockParams,
		warnings: string[]
	) {
		const search = params.view === 'review' ? '' : effectiveSearch('', params.search, params.date, 'highlighted')
		const { query, test } = blockQuery(search, readwiseSchema)
		super(el, common, noticesOf(params, warnings), search)
		this.test = test
		if (query && 'error' in query) this.queryError = query
	}

	protected events(listener: (e: StoreEvent) => void) {
		return this.deps.library.subscribe(listener)
	}

	protected hasData() {
		return !!this.data
	}

	/** Shows the library already held (saved from an earlier session, or fetched by another block) while a fetch runs. */
	protected start() {
		void this.deps.library.ready().then(() => {
			const held = this.deps.library.peek()
			if (this.data || this.params.view === 'review' || !held.fetchedAt) return
			this.data = fromBooks(held.books)
			this.draw()
		})
	}

	protected clear() {
		this.data = { books: [], rows: [] }
	}

	protected async fetchData(force: boolean) {
		if (this.params.view === 'review') {
			this.data = { books: [], rows: await this.deps.review() }
			return
		}
		const { library } = this.deps
		this.data = fromBooks((await (force ? library.refresh() : library.get(this.maxAgeMs))).books)
	}

	// fallow-ignore-next-line complexity
	protected drawContent(el: HTMLElement) {
		if (!this.data) return
		const { view, search } = this.params
		const { format, group } = this.layout
		const empty = emptyText(view, view === 'review' ? '' : search)
		if (view === 'books') drawBookRows(el, selectBooks(this.data.books, this.params, this.test), format, this.deps.covers, bookGroupKey(group), empty, this.params.size)
		else drawHighlightRows(el, selectRows(this.data.rows, this.params, this.test), format, this.params, rowGroupKey(group), empty, this.params.size)
		if (this.deps.noteProperty) linkNotes(el, this.deps.app, this.deps.noteProperty)
	}
}
