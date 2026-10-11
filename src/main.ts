import { Plugin } from 'obsidian'
import { obsidianHttp } from './api/http'
import { createReadwiseClient } from './api/readwise'
import { DEFAULT_PARAMS, parseParams } from './block/params'
import { createStore, shareInFlight } from './cache/cache'
import { cacheFile } from './cache/persist'
import { registerCommands } from './commands/commands'
import { ReadwiseBlock } from './render/view'
import { DEFAULT_SETTINGS, findReadwiseSecret, type ReadwiseEmbedsSettings } from './settings'
import { ReadwiseEmbedsSettingTab } from './ui/SettingsTab'

export default class ReadwiseEmbedsPlugin extends Plugin {
	settings!: ReadwiseEmbedsSettings
	blocks = new Set<ReadwiseBlock>()
	client = createReadwiseClient(obsidianHttp, () => this.app.secretStorage.getSecret(this.settings.readwiseTokenSecret))
	cache = cacheFile(this.app, this.manifest.id)
	store = createStore({
		fetch: (since, onPage) => this.client.exportAll(since, onPage),
		load: () => (this.settings.persistCache ? this.cache.load() : Promise.resolve(null)),
		save: (snap) => (this.settings.persistCache ? this.cache.save(snap) : undefined),
	})
	review = shareInFlight(() => this.client.review())

	async onload() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) as Partial<ReadwiseEmbedsSettings> | null)
		await this.adoptExistingSecret()
		this.addSettingTab(new ReadwiseEmbedsSettingTab(this.app, this))
		registerCommands(this)
		this.registerMarkdownCodeBlockProcessor('readwise', (source, el, ctx) => {
			const { refreshMinutes, defaultFormat, defaultLimit, showCovers } = this.settings
			const { params, warnings } = parseParams(source, { ...DEFAULT_PARAMS, format: defaultFormat, limit: defaultLimit })
			const deps = { library: this.store, review: this.review, maxAgeMs: refreshMinutes * 60_000, covers: showCovers, blocks: this.blocks }
			ctx.addChild(new ReadwiseBlock(el, deps, params, warnings))
		})
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
