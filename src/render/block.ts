import { MarkdownRenderChild } from 'obsidian'
import type { StoreEvent } from '../cache/retry'
import { describeFailure } from './rows'

export interface BlockCommon {
	maxAgeMs: number
	/** Every live block, so commands can refresh them. */
	blocks: Set<EmbedBlock>
}

/**
 * What every embedded block does: refresh bar, status line, skeleton, filter-error display, background refresh
 * and a rate-limit countdown. Subclasses say how to load their data and how to draw it.
 */
export abstract class EmbedBlock extends MarkdownRenderChild {
	private status?: string
	private statusEl?: HTMLElement
	private fetching = false
	/** Set by the subclass when its filter does not compile. */
	protected queryError?: { error: string; pos: number }
	/** What a progress count counts, for the status line. */
	protected noun = 'sources'

	constructor(
		el: HTMLElement,
		private common: BlockCommon,
		private notes: string[],
		private search: string
	) {
		super(el)
	}

	/** Progress and rate-limit events of the store this block loads from. Returns the unsubscribe function. */
	protected abstract events(listener: (e: StoreEvent) => void): () => void
	protected abstract hasData(): boolean
	protected abstract fetchData(force: boolean): Promise<void>
	protected abstract drawContent(el: HTMLElement): void
	/** Called once after the first draw; show any data already held while the first fetch runs. */
	protected start(): void {}
	/** Called when a failure means "nothing to show" rather than "keep what was shown". */
	protected clear(): void {}

	// fallow-ignore-next-line unused-class-member
	onload() {
		this.containerEl.addClass('rw-block')
		const { blocks, maxAgeMs } = this.common
		blocks.add(this)
		this.register(() => blocks.delete(this))
		this.register(this.events((e) => this.onEvent(e)))
		this.draw()
		this.start()
		void this.refresh(false)
		this.registerInterval(window.setInterval(() => void this.refresh(), maxAgeMs))
	}

	/** Shows stale data while fetching; on failure keeps it and adds the reason. */
	async refresh(force = true) {
		this.fetching = true
		try {
			await this.fetchData(force)
			this.status = undefined
		} catch (e) {
			const { status, clear } = describeFailure(e)
			if (clear) this.clear()
			this.status = status
		}
		this.fetching = false
		this.draw()
	}

	protected get maxAgeMs() {
		return this.common.maxAgeMs
	}

	/** Redraws the whole block from what is held. */
	protected draw() {
		const el = this.containerEl
		el.empty()
		this.drawBar(el)
		this.notes.forEach((w) => el.createDiv({ cls: 'rw-warning', text: w }))
		if (this.queryError) return this.drawQueryError(this.queryError)
		if (!this.hasData()) return this.drawSkeleton()
		this.drawContent(el)
	}

	private drawBar(el: HTMLElement) {
		const bar = el.createDiv('rw-bar')
		this.statusEl = bar.createSpan({ cls: 'rw-status', text: this.status ?? '', attr: { role: 'status', 'aria-live': 'polite' } })
		const refresh = bar.createEl('button', { cls: 'rw-refresh clickable-icon', attr: { 'aria-label': 'Refresh', title: 'Refresh' }, text: '↻' })
		refresh.onclick = () => void this.refresh()
	}

	private setStatus(text: string) {
		this.status = text
		this.statusEl?.setText(text)
	}

	private onEvent(e: StoreEvent) {
		if (!this.fetching) return
		if (e.type === 'progress') this.setStatus(`Loading… ${e.count} ${this.noun}`)
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

	private drawSkeleton() {
		const box = this.containerEl.createDiv({ cls: 'rw-skeleton', attr: { 'aria-busy': 'true' } })
		for (let i = 0; i < 3; i++) box.createDiv('rw-skeleton-row')
	}

	private drawQueryError({ error, pos }: { error: string; pos: number }) {
		const box = this.containerEl.createDiv({ cls: 'rw-error', attr: { role: 'alert' } })
		box.createDiv({ text: `Filter error: ${error}` })
		box.createEl('pre', { text: `${this.search}\n${' '.repeat(pos)}^` })
	}
}
