import { Plugin } from 'obsidian'
import { obsidianHttp } from './api/http'
import { createLimiter } from './api/limiter'
import { createReaderClient } from './api/reader'
import { createReadwiseClient } from './api/readwise'
import { DEFAULT_PARAMS, parseParams } from './block/params'
import { DEFAULT_READER_PARAMS, parseReaderParams } from './block/readerParams'
import { createStore, shareInFlight } from './cache/cache'
import { cacheFile, parseCache, parseDocs, serializeCache, serializeDocs } from './cache/persist'
import { createDocStore } from './cache/docs'
import { registerCommands } from './commands/commands'
import type { EmbedBlock } from './render/block'
import { ReaderBlock } from './render/readerView'
import { ReadwiseBlock } from './render/view'
import { DEFAULT_SETTINGS, findReadwiseSecret, type ReadwiseEmbedsSettings } from './settings'
import { ReadwiseEmbedsSettingTab } from './ui/SettingsTab'

export default class ReadwiseEmbedsPlugin extends Plugin {
	settings!: ReadwiseEmbedsSettings
	blocks = new Set<EmbedBlock>()
	private token = () => this.app.secretStorage.getSecret(this.settings.readwiseTokenSecret)
	client = createReadwiseClient(obsidianHttp, this.token)
	// Reader's list endpoint allows 20 requests a minute across every block; 18 with a small burst leaves headroom.
	reader = createReaderClient(obsidianHttp, this.token, createLimiter({ capacity: 2, perMinute: 18 }).acquire)
	cache = cacheFile(this.app, this.manifest.id, 'cache.json', parseCache, serializeCache)
	docCache = cacheFile(this.app, this.manifest.id, 'reader-cache.json', parseDocs, serializeDocs)
	store = createStore({
		fetch: (since, onPage) => this.client.exportAll(since, onPage),
		load: () => (this.settings.persistCache ? this.cache.load() : Promise.resolve(null)),
		save: (snap) => (this.settings.persistCache ? this.cache.save(snap) : undefined),
	})
	docs = createDocStore({
		fetch: (slice, onPage, onWait) => this.reader.list({ ...slice, maxPages: this.settings.maxPages }, onPage, onWait),
		load: () => (this.settings.persistCache ? this.docCache.load() : Promise.resolve(null)),
		save: (saved) => (this.settings.persistCache ? this.docCache.save(saved) : undefined),
	})
	review = shareInFlight(() => this.client.review())

	async onload() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) as Partial<ReadwiseEmbedsSettings> | null)
		await this.adoptExistingSecret()
		this.addSettingTab(new ReadwiseEmbedsSettingTab(this.app, this))
		registerCommands(this)
		this.registerMarkdownCodeBlockProcessor('readwise', (source, el, ctx) => {
			const { defaultFormat, defaultLimit, showCovers, linkNotes, noteIdProperty } = this.settings
			const { params, warnings } = parseParams(source, { ...DEFAULT_PARAMS, format: defaultFormat, limit: defaultLimit })
			const deps = { library: this.store, review: this.review, covers: showCovers, app: this.app, noteProperty: linkNotes ? noteIdProperty.trim() : '' }
			ctx.addChild(new ReadwiseBlock(el, this.common(), deps, params, warnings))
		})
		this.registerMarkdownCodeBlockProcessor('reader', (source, el, ctx) => {
			const { defaultFormat, defaultLimit, showCovers, linkNotes, noteIdProperty } = this.settings
			const format = defaultFormat === 'quote' ? 'list' : defaultFormat
			const { params, warnings } = parseReaderParams(source, { ...DEFAULT_READER_PARAMS, format, limit: defaultLimit })
			ctx.addChild(new ReaderBlock(el, this.common(), { docs: this.docs, covers: showCovers, app: this.app, noteProperty: linkNotes ? noteIdProperty.trim() : '' }, params, warnings))
		})
	}

	private common() {
		return { maxAgeMs: this.settings.refreshMinutes * 60_000, blocks: this.blocks }
	}

	/** With no token chosen, reuse a Readwise secret already in Obsidian's storage (names only are read). */
	private async adoptExistingSecret() {
		if (this.settings.readwiseTokenSecret) return
		const id = findReadwiseSecret(this.app.secretStorage.listSecrets())
		if (!id) return
		this.settings.readwiseTokenSecret = id
		await this.saveSettings()
	}

	async saveSettings() {
		await this.saveData(this.settings)
	}
}
