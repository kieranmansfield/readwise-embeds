import { Plugin } from 'obsidian'
import { obsidianHttp } from './api/http'
import { createReadwiseClient } from './api/readwise'
import { parseParams } from './block/params'
import { createStore, shareInFlight } from './cache/cache'
import { ReadwiseBlock } from './render/view'
import { DEFAULT_SETTINGS, type ReadwiseEmbedsSettings } from './settings'
import { ReadwiseEmbedsSettingTab } from './ui/SettingsTab'

export default class ReadwiseEmbedsPlugin extends Plugin {
	settings!: ReadwiseEmbedsSettings
	client = createReadwiseClient(obsidianHttp, () => this.app.secretStorage.getSecret(this.settings.readwiseTokenSecret))
	store = createStore({ fetch: (since) => this.client.exportAll(since) })
	review = shareInFlight(() => this.client.review())

	async onload() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) as Partial<ReadwiseEmbedsSettings> | null)
		this.addSettingTab(new ReadwiseEmbedsSettingTab(this.app, this))
		this.registerMarkdownCodeBlockProcessor('readwise', (source, el, ctx) => {
			const { params, warnings } = parseParams(source)
			ctx.addChild(new ReadwiseBlock(el, { library: this.store, review: this.review, maxAgeMs: this.settings.refreshMinutes * 60_000 }, params, warnings))
		})
	}

	async saveSettings() {
		await this.saveData(this.settings)
	}
}
