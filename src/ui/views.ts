import { ItemView, Notice, Platform, setIcon, type App, type ViewStateResult, type WorkspaceLeaf } from 'obsidian'
import type ReadwiseEmbedsPlugin from '../main'
import type { EmbedBlock } from '../render/block'

export const LIBRARY_VIEW = 'readwise-embeds-library'
export const READER_LIBRARY_VIEW = 'readwise-embeds-reader-library'
export const WEB_VIEW = 'readwise-embeds-reader-web'
export const READWISE_WEB_VIEW = 'readwise-embeds-readwise-web'

interface Site {
	type: string
	name: string
	url: string
	icon: string
}
const READER: Site = { type: WEB_VIEW, name: 'Reader', url: 'https://read.readwise.io/', icon: 'book-open' }
const READWISE: Site = { type: READWISE_WEB_VIEW, name: 'Readwise', url: 'https://readwise.io/dashboard', icon: 'globe' }
/** The website panes, one view type each. */
export const WEB_SITES: Site[] = [READER, READWISE]

/** Focuses an open view of this type, or opens one in a new tab. */
export async function openView(app: App, type: string) {
	const existing = app.workspace.getLeavesOfType(type)[0]
	const leaf = existing ?? app.workspace.getLeaf('tab')
	if (!existing) await leaf.setViewState({ type, active: true })
	await app.workspace.revealLeaf(leaf)
}

/** The core Web viewer's view type; it is only registered while that core plugin is on. */
const CORE_WEB_VIEWER = 'webviewer'

/**
 * Opens a Readwise website. On desktop with the core Web viewer on, that is the real browser pane, which is the
 * most reliable; otherwise this plugin's own pane. Elsewhere a page cannot be embedded, so the system browser.
 */
// fallow-ignore-next-line complexity
export async function openSite(app: App, type: string) {
	const site = WEB_SITES.find((s) => s.type === type)
	if (!site) return
	if (!Platform.isDesktopApp) return void window.open(site.url)
	// ponytail: internalPlugins is not in the public typings; this only asks whether the core plugin is on.
	const internal = (app as unknown as { internalPlugins?: { getEnabledPluginById?: (id: string) => unknown } }).internalPlugins
	if (internal?.getEnabledPluginById?.(CORE_WEB_VIEWER)) {
		await app.workspace.getLeaf('tab').setViewState({ type: CORE_WEB_VIEWER, active: true, state: { url: site.url, navigate: true } })
		return
	}
	new Notice('Turn on the Web viewer core plugin for a more reliable website pane.')
	await openView(app, type)
}

interface Section {
	id: string
	label: string
	/** Reader sections are a preset; the rest are a `readwise` view. */
	kind: 'reader' | 'readwise'
}

type Kind = Section['kind']

const SECTIONS: Section[] = [
	{ id: 'inbox', label: 'Inbox', kind: 'reader' },
	{ id: 'later', label: 'Later', kind: 'reader' },
	{ id: 'shortlist', label: 'Shortlist', kind: 'reader' },
	{ id: 'archive', label: 'Archive', kind: 'reader' },
	{ id: 'feed', label: 'Feed', kind: 'reader' },
	{ id: 'highlights', label: 'Highlights', kind: 'readwise' },
	{ id: 'books', label: 'Sources', kind: 'readwise' },
	{ id: 'review', label: 'Daily review', kind: 'readwise' },
]

type Format = 'list' | 'card' | 'table'
interface LibraryState {
	section: string
	search: string
	format: Format
	size: number
	/** A Readwise category to show, or empty for all. */
	type: string
}

const TYPES: Record<string, string> = { '': 'All types', books: 'Books', articles: 'Articles', tweets: 'Tweets', podcasts: 'Podcasts', supplementals: 'Supplementals' }

/** The source lines of the block this view shows; the same keys as a code block. */
// fallow-ignore-next-line complexity
function sourceOf(s: LibraryState, section: Section): string {
	const lines = section.kind === 'reader' ? [`preset: ${section.id}`] : [`view: ${section.id}`]
	const typed = section.kind === 'readwise' && section.id !== 'review' && s.type ? `category:${s.type}` : ''
	const text = section.id === 'review' ? '' : s.search.replace(/\s+/g, ' ').trim()
	const search = typed && text ? `${typed} AND (${text})` : typed || text
	if (search) lines.push(`search: ${search}`)
	lines.push(`format: ${s.format}`, 'limit: 200', 'warnings: false')
	if (s.format === 'card') lines.push(`size: ${s.size}`)
	return lines.join('\n')
}

/** A pane for browsing either Reader documents or Readwise highlights, books and the daily review, with the code-block filters. */
export class LibraryView extends ItemView {
	private state: LibraryState
	private block?: EmbedBlock
	private body?: HTMLElement
	private timer?: number

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: ReadwiseEmbedsPlugin,
		private kind: Kind
	) {
		super(leaf)
		this.state = { section: this.sections()[0].id, search: '', format: 'card', size: 260, type: '' }
	}

	private sections() {
		return SECTIONS.filter((s) => s.kind === this.kind)
	}

	private section() {
		return this.sections().find((s) => s.id === this.state.section) ?? this.sections()[0]
	}

	getViewType() {
		return this.kind === 'reader' ? READER_LIBRARY_VIEW : LIBRARY_VIEW
	}
	getDisplayText() {
		return this.kind === 'reader' ? 'Reader library' : 'Readwise library'
	}
	getIcon() {
		return this.kind === 'reader' ? 'inbox' : 'library'
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

	// fallow-ignore-next-line complexity
	private toolbar(bar: HTMLElement) {
		const tabs = bar.createDiv({ cls: 'rw-lib-tabs', attr: { role: 'tablist' } })
		for (const s of this.sections()) {
			const tab = tabs.createEl('button', { cls: 'rw-lib-tab', text: s.label, attr: { role: 'tab', 'aria-selected': String(s.id === this.section().id) } })
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
		if (this.kind === 'readwise' && this.section().id !== 'review') {
			const type = tools.createEl('select', { cls: 'dropdown', attr: { 'aria-label': 'Type' } })
			for (const [value, text] of Object.entries(TYPES)) type.createEl('option', { value, text })
			type.value = this.state.type
			type.onchange = () => {
				this.state.type = type.value
				this.show()
			}
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
		const section = this.section()
		const host = this.body.createDiv()
		const source = sourceOf(this.state, section)
		this.block = section.kind === 'reader' ? this.plugin.readerBlock(host, source) : this.plugin.readwiseBlock(host, source)
		this.addChild(this.block)
	}
}

/** One of Readwise's websites in a pane. Desktop only: other platforms get a link, since a page cannot be embedded there. */
export class WebView extends ItemView {
	constructor(
		leaf: WorkspaceLeaf,
		private site: Site
	) {
		super(leaf)
	}

	getViewType() {
		return this.site.type
	}
	getDisplayText() {
		return this.site.name
	}
	getIcon() {
		return this.site.icon
	}

	onOpen() {
		const root = this.contentEl
		root.empty()
		root.addClass('rw-web')
		const note = root.createEl('p', { cls: 'rw-web-note' })
		if (!Platform.isDesktopApp) {
			// A page cannot be embedded here, so a link is all there is.
			note.setText(`${this.site.name} cannot be shown inside Obsidian on this device.`)
			root.createEl('a', { cls: 'rw-web-open', href: this.site.url, text: 'Open in your browser', attr: { target: '_blank', rel: 'noopener' } })
			return Promise.resolve()
		}
		try {
			note.setText(`Loading ${this.site.name}…`)
			const web = root.createEl('webview' as 'div', { cls: 'rw-webview' })
			web.setAttribute('partition', 'persist:readwise-embeds')
			web.setAttribute('allowpopups', 'true')
			web.addEventListener('dom-ready', () => note.hide())
			web.addEventListener('did-fail-load', (e) => {
				const { errorCode, errorDescription } = e as Event & { errorCode?: number; errorDescription?: string }
				if (errorCode === -3) return // a navigation replaced the load; not a failure
				note.setText(`${this.site.name} did not load: ${errorDescription ?? 'unknown error'}.`)
				note.show()
			})
			// The session is fixed by the first navigation, so src goes last.
			web.setAttribute('src', this.site.url)
		} catch (e) {
			note.setText(`${this.site.name} could not be opened here: ${e instanceof Error ? e.message : String(e)}`)
		}
		return Promise.resolve()
	}
}
