import type { RdDoc, DocSlice } from '../api/reader'
import type { ReaderParams } from '../block/readerParams'
import { mergeEntries, type DocStore } from '../cache/docs'
import type { StoreEvent } from '../cache/retry'
import type { Predicate } from '../filter/evaluate'
import { planSlices, wantsHighlights } from '../filter/plan'
import { blockQuery } from '../filter/query'
import { readerSchema } from '../filter/readerFields'
import { EmbedBlock, type BlockCommon } from './block'
import { docGroupKey, emptyDocsText, selectDocs, truncationNotice } from './docs'
import { drawDocs } from './docFormats'

export interface ReaderDeps {
	docs: DocStore
	maxPages: number
	covers: boolean
}

type Held = { docs: RdDoc[]; truncated: boolean }

/** One `reader` block: Reader documents matching a filter. */
export class ReaderBlock extends EmbedBlock {
	private held?: Held
	private test?: Predicate<RdDoc>
	private slices: DocSlice[]
	private keepHighlights: boolean
	protected noun = 'documents'

	constructor(
		el: HTMLElement,
		common: BlockCommon,
		private deps: ReaderDeps,
		private params: ReaderParams,
		warnings: string[]
	) {
		super(el, common, warnings, params.search)
		const { query, test, ast } = blockQuery(params.search, readerSchema)
		this.test = test
		this.slices = planSlices(ast, deps.maxPages)
		this.keepHighlights = wantsHighlights(ast)
		if (query && 'error' in query) this.queryError = query
	}

	protected events(listener: (e: StoreEvent) => void) {
		return this.deps.docs.subscribe(listener)
	}

	protected hasData() {
		return !!this.held
	}

	/** Shows what other blocks already downloaded for these slices while the fetch runs. */
	protected start() {
		const entries = this.slices.map((s) => this.deps.docs.peek(s))
		if (entries.some((e) => !e)) return
		this.held = mergeEntries(entries.filter((e) => !!e))
		this.draw()
	}

	protected async fetchData(force: boolean) {
		const { docs } = this.deps
		const entries = await Promise.all(this.slices.map((s) => (force ? docs.refresh(s) : docs.get(s, this.maxAgeMs))))
		this.held = mergeEntries(entries)
	}

	protected drawContent(el: HTMLElement) {
		if (!this.held) return
		const rows = selectDocs(this.held.docs, this.params, this.test, this.keepHighlights)
		if (this.held.truncated) el.createDiv({ cls: 'rw-warning', text: truncationNotice(this.held.docs.length) })
		drawDocs(el, rows, this.params, this.deps.covers, docGroupKey(this.params.group), emptyDocsText(this.params.search))
	}
}

