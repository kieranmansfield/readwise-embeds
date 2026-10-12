import { Notice, PluginSettingTab, SecretComponent, Setting, type App } from 'obsidian'
import type ReadwiseEmbedsPlugin from '../main'
import { DEFAULT_SETTINGS, MIN_REFRESH_MINUTES, validLimit, validMaxPages, validRefreshMinutes, type ReadwiseEmbedsSettings } from '../settings'

export class ReadwiseEmbedsSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: ReadwiseEmbedsPlugin
	) {
		super(app, plugin)
	}

	// fallow-ignore-next-line unused-class-member
	display() {
		const { containerEl, plugin } = this
		containerEl.empty()

		new Setting(containerEl)
			.setName('Readwise access token')
			.setDesc('Find it on the Readwise website, under access token. Kept in Obsidian\'s secret storage and sent only to Readwise.')
			.addComponent((el) =>
				new SecretComponent(this.app, el).setValue(plugin.settings.readwiseTokenSecret).onChange(async (name) => {
					plugin.settings.readwiseTokenSecret = name ?? ''
					await plugin.saveSettings()
				})
			)
			.addButton((b) =>
				b.setButtonText('Test connection').onClick(async () => {
					try {
						await plugin.client.checkAuth()
						new Notice('Readwise: connected.')
					} catch (e) {
						new Notice(`Readwise: ${e instanceof Error ? e.message : String(e)}`)
					}
				})
			)

		new Setting(containerEl)
			.setName('Refresh interval (minutes)')
			.setDesc(`How often open blocks refresh. Minimum ${MIN_REFRESH_MINUTES}. Applies to blocks rendered after the change.`)
			.addText((t) =>
				t.setValue(String(plugin.settings.refreshMinutes)).onChange(async (raw) => {
					const n = validRefreshMinutes(raw)
					if (n === null) return
					plugin.settings.refreshMinutes = n
					await plugin.saveSettings()
				})
			)

		new Setting(containerEl)
			.setName('Maximum pages per query')
			.setDesc('Each page is 100 documents and one request; Reader allows 20 requests a minute. Applies to blocks rendered after the change. From 1 to 50.')
			.addText((t) =>
				t.setValue(String(plugin.settings.maxPages)).onChange(async (raw) => {
					const n = validMaxPages(raw)
					if (n === null) return
					plugin.settings.maxPages = n
					await plugin.saveSettings()
				})
			)

		new Setting(containerEl)
			.setName('Default format')
			.setDesc('Used when a block has no format line. Reader blocks show a list in place of quote.')
			.addDropdown((d) =>
				d
					.addOptions({ list: 'List', table: 'Table', quote: 'Quote', card: 'Card' })
					.setValue(plugin.settings.defaultFormat)
					.onChange(async (v) => {
						plugin.settings.defaultFormat = v as ReadwiseEmbedsSettings['defaultFormat']
						await plugin.saveSettings()
					})
			)

		new Setting(containerEl)
			.setName('Default row limit')
			.setDesc('Used when a block has no limit line. From 1 to 500.')
			.addText((t) =>
				t.setValue(String(plugin.settings.defaultLimit)).onChange(async (raw) => {
					const n = validLimit(raw)
					if (n === null) return
					plugin.settings.defaultLimit = n
					await plugin.saveSettings()
				})
			)

		new Setting(containerEl)
			.setName('Load cover images')
			.setDesc('Show covers on cards. Images load directly from the sites they come from, which tells those sites your address. Off by default.')
			.addToggle((t) =>
				t.setValue(plugin.settings.showCovers).onChange(async (v) => {
					plugin.settings.showCovers = v
					await plugin.saveSettings()
				})
			)

		new Setting(containerEl)
			.setName('Link to Readwise notes')
			.setDesc('Add a link after each source in highlight and reader blocks that opens the note for it in your vault. Applies to blocks rendered after the change.')
			.addToggle((t) =>
				t.setValue(plugin.settings.linkNotes).onChange(async (v) => {
					plugin.settings.linkNotes = v
					await plugin.saveSettings()
				})
			)

		new Setting(containerEl)
			.setName('Note ID property')
			.setDesc('The frontmatter property in your Readwise notes that holds the Readwise book ID. The default matches the official Readwise plugin.')
			.addText((t) =>
				t.setValue(plugin.settings.noteIdProperty).onChange(async (v) => {
					plugin.settings.noteIdProperty = v.trim() || DEFAULT_SETTINGS.noteIdProperty
					await plugin.saveSettings()
				})
			)

		new Setting(containerEl)
			.setName('Keep a copy of your library on disk')
			.setDesc('Makes restarts fast. Stores your highlight text in this plugin\'s folder in the vault, so turn it off if you sync or publish that folder.')
			.addToggle((t) =>
				t.setValue(plugin.settings.persistCache).onChange(async (v) => {
					plugin.settings.persistCache = v
					await plugin.saveSettings()
					if (!v) await Promise.all([plugin.cache.clear(), plugin.docCache.clear()])
				})
			)
	}
}
