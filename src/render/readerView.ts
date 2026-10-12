import type { RdDoc } from '../api/reader'
import type { ReaderParams } from '../block/readerParams'
import { mergeEntries, type DocStore } from '../cache/docs'
import type { StoreEvent } from '../cache/retry'
import type { Predicate } from '../filter/evaluate'
import { planLocations, updatedFloor, wantsHighlights } from '../filter/plan'
import { blockQuery } from '../filter/query'
import { readerSchema } from '../filter/readerFields'
import { effectiveSearch } from '../block/presets'
import { EmbedBlock, type BlockCommon } from './block'
import { docGroupKey, emptyDocsText, selectDocs, truncationNotice } from './docs'
import { drawDocs } from './docFormats'

export interface ReaderDeps {
	docs: DocStore
	covers: boolean
}

/** True when a cut-short download still holds every document updated since `floor` (the API lists newest-updated first). */
function coversFloor(docs: RdDoc[], floor: number | undefined): boolean {
	if (floor === undefined) return false
	const times = docs.map((d) => Date.parse(d.updated_at ?? ''))
	return times.length > 0 && times.every(Number.isFinite) && Math.min(...times) <= floor
}

type Held = { docs: RdDoc[]; truncated: boolean }

/** One `reader` block: Reader documents matching a filter. */
export class ReaderBlock extends EmbedBlock {
	private held?: Held
	private test?: Predicate<RdDoc>
	private locations: string[]
	private keepHighlights: boolean
	private floor?: number
	protected noun = 'documents'

	constructor(
		el: HTMLElement,
		common: BlockCommon,
		private deps: ReaderDeps,
		private params: ReaderParams,
		warnings: string[]
	) {
		const search = effectiveSearch(params.preset, params.search, params.date)
		super(el, common, params.warnings ? warnings : [], search)
		const { query, test, ast } = blockQuery(search, readerSchema)
		this.test = test
		this.locations = planLocations(ast)
		this.keepHighlights = wantsHighlights(ast)
		this.floor = updatedFloor(ast, Date.now())
		if (query && 'error' in query) this.queryError = query
	}

	protected events(listener: (e: StoreEvent) => void) {
		return this.deps.docs.subscribe(listener)
	}

	protected hasData() {
		return !!this.held
	}

	/** Shows what is already held for these locations while the fetch runs. */
	protected start() {
		void this.deps.docs.ready().then(() => {
			const entries = this.locations.map((l) => this.deps.docs.peek(l))
			if (this.held || entries.some((e) => !e)) return
			this.held = mergeEntries(entries.filter((e) => !!e))
			this.draw()
		})
	}

	protected async fetchData(force: boolean) {
		const { docs } = this.deps
		const entries = await Promise.all(this.locations.map((l) => (force ? docs.refresh(l) : docs.get(l, this.maxAgeMs))))
		this.held = mergeEntries(entries)
	}

	/** Whether to tell the reader the saved copy was cut short. */
	private cutOff() {
		return this.params.warnings && !!this.held?.truncated && !coversFloor(this.held.docs, this.floor)
	}

	protected drawContent(el: HTMLElement) {
		if (!this.held) return
		const rows = selectDocs(this.held.docs, this.params, this.test, this.keepHighlights)
		if (this.cutOff()) el.createDiv({ cls: 'rw-warning', text: truncationNotice(this.held.docs.length) })
		drawDocs(el, rows, this.params, this.deps.covers, docGroupKey(this.params.group), emptyDocsText(this.params.search))
	}
}

