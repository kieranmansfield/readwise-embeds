import { ItemView, Platform, setIcon, type App, type ViewStateResult, type WorkspaceLeaf } from 'obsidian'
import type ReadwiseEmbedsPlugin from '../main'
import type { EmbedBlock } from '../render/block'

export const LIBRARY_VIEW = 'readwise-embeds-library'
export const WEB_VIEW = 'readwise-embeds-reader-web'
const READER_URL = 'https://read.readwise.io/'

/** Focuses an open view of this type, or opens one in a new tab. */
export async function openView(app: App, type: string) {
	const existing = app.workspace.getLeavesOfType(type)[0]
	const leaf = existing ?? app.workspace.getLeaf('tab')
	if (!existing) await leaf.setViewState({ type, active: true })
	await app.workspace.revealLeaf(leaf)
}

interface Section {
	id: string
	label: string
	/** Reader sections are a preset; the rest are a `readwise` view. */
	kind: 'reader' | 'readwise'
}

const SECTIONS: Section[] = [
	{ id: 'inbox', label: 'Inbox', kind: 'reader' },
	{ id: 'later', label: 'Later', kind: 'reader' },
	{ id: 'shortlist', label: 'Shortlist', kind: 'reader' },
	{ id: 'archive', label: 'Archive', kind: 'reader' },
	{ id: 'feed', label: 'Feed', kind: 'reader' },
	{ id: 'highlights', label: 'Highlights', kind: 'readwise' },
	{ id: 'books', label: 'Books', kind: 'readwise' },
	{ id: 'review', label: 'Daily review', kind: 'readwise' },
]

type Format = 'list' | 'card' | 'table'
interface LibraryState {
	section: string
	search: string
	format: Format
	size: number
}

/** The source lines of the block this view shows; the same keys as a code block. */
// fallow-ignore-next-line complexity
function sourceOf(s: LibraryState): string {
	const section = SECTIONS.find((x) => x.id === s.section) ?? SECTIONS[0]
	const lines = section.kind === 'reader' ? [`preset: ${section.id}`] : [`view: ${section.id}`]
	if (s.search.trim() && section.id !== 'review') lines.push(`search: ${s.search.replace(/\s+/g, ' ').trim()}`)
	lines.push(`format: ${s.format}`, 'limit: 200')
	if (s.format === 'card') lines.push(`size: ${s.size}`)
	return lines.join('\n')
}

/** A pane for browsing Reader documents, highlights, books and the daily review with the code-block filters. */
export class LibraryView extends ItemView {
	private state: LibraryState = { section: 'inbox', search: '', format: 'card', size: 260 }
	private block?: EmbedBlock
	private body?: HTMLElement
	private timer?: number

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: ReadwiseEmbedsPlugin
	) {
		super(leaf)
	}

	getViewType() {
		return LIBRARY_VIEW
	}
	getDisplayText() {
		return 'Readwise library'
	}
	getIcon() {
		return 'library'
	}

	// fallow-ignore-next-line unused-class-member
	getState(): Record<string, unknown> {
		return { ...this.state }
	}

	// fallow-ignore-next-line unused-class-member
	async setState(state: unknown, result: ViewStateResult) {
		Object.assign(this.state, state)
		this.build()
		await super.setState(state, result)
	}

	onOpen() {
		this.build()
		return Promise.resolve()
	}

	onClose() {
		window.clearTimeout(this.timer)
		return Promise.resolve()
	}

	private build() {
		const root = this.contentEl
		root.empty()
		root.addClass('rw-library')
		this.toolbar(root.createDiv('rw-lib-bar'))
		this.body = root.createDiv('rw-lib-body')
		this.show()
	}

	private toolbar(bar: HTMLElement) {
		const tabs = bar.createDiv({ cls: 'rw-lib-tabs', attr: { role: 'tablist' } })
		for (const s of SECTIONS) {
			const tab = tabs.createEl('button', { cls: 'rw-lib-tab', text: s.label, attr: { role: 'tab', 'aria-selected': String(s.id === this.state.section) } })
			tab.onclick = () => {
				this.state.section = s.id
				this.build()
				this.app.workspace.requestSaveLayout()
			}
		}
		const tools = bar.createDiv('rw-lib-tools')
		const search = tools.createEl('input', { cls: 'rw-lib-search', type: 'search', attr: { placeholder: 'Filter these results', 'aria-label': 'Filter' } })
		search.value = this.state.search
		search.oninput = () => {
			window.clearTimeout(this.timer)
			this.timer = window.setTimeout(() => {
				this.state.search = search.value
				this.show()
			}, 400)
		}
		const format = tools.createEl('select', { cls: 'dropdown', attr: { 'aria-label': 'Layout' } })
		for (const f of ['list', 'card', 'table'] as const) format.createEl('option', { value: f, text: f[0].toUpperCase() + f.slice(1) })
		format.value = this.state.format
		format.onchange = () => {
			this.state.format = format.value as Format
			this.build()
		}
		if (this.state.format === 'card') {
			const size = tools.createEl('input', { type: 'range', attr: { min: '120', max: '600', step: '20', 'aria-label': 'Card size' } })
			size.value = String(this.state.size)
			size.oninput = () => {
				this.state.size = Number(size.value)
				this.body?.style.setProperty('--rw-card-size', `${this.state.size}px`)
			}
			size.onchange = () => this.show()
		}
		const syncBtn = tools.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Refresh' } })
		setIcon(syncBtn, 'refresh-cw')
		syncBtn.onclick = () => void this.block?.refresh()
	}

	// fallow-ignore-next-line complexity
	private show() {
		if (!this.body) return
		if (this.block) this.removeChild(this.block)
		this.body.empty()
		const section = SECTIONS.find((x) => x.id === this.state.section) ?? SECTIONS[0]
		const host = this.body.createDiv()
		const source = sourceOf(this.state)
		this.block = section.kind === 'reader' ? this.plugin.readerBlock(host, source) : this.plugin.readwiseBlock(host, source)
		this.addChild(this.block)
	}
}

/** Reader's website in a pane. Desktop only: other platforms get a link, since a page cannot be embedded there. */
export class ReaderWebView extends ItemView {
	constructor(leaf: WorkspaceLeaf) {
		super(leaf)
	}

	getViewType() {
		return WEB_VIEW
	}
	getDisplayText() {
		return 'Reader'
	}
	getIcon() {
		return 'book-open'
	}

	onOpen() {
		const root = this.contentEl
		root.empty()
		root.addClass('rw-web')
		if (Platform.isDesktopApp) {
			const web = root.createEl('webview' as 'div', { cls: 'rw-webview', attr: { src: READER_URL, partition: 'persist:readwise-embeds' } })
			web.setAttribute('allowpopups', 'true')
		} else {
			root.createEl('p', { text: 'Reader cannot be shown inside Obsidian on this device.' })
		}
		const open = root.createEl('a', { cls: 'rw-web-open', href: READER_URL, text: 'Open in your browser' })
		open.setAttribute('target', '_blank')
		open.setAttribute('rel', 'noopener')
		return Promise.resolve()
	}
}
