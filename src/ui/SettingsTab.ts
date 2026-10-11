import { Notice, PluginSettingTab, SecretComponent, Setting, type App } from 'obsidian'
import type ReadwiseEmbedsPlugin from '../main'
import { MIN_REFRESH_MINUTES, validLimit, validRefreshMinutes, type ReadwiseEmbedsSettings } from '../settings'

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
			.setName('Default format')
			.setDesc('Used when a block has no format line.')
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
			.setName('Keep a copy of your library on disk')
			.setDesc('Makes restarts fast. Stores your highlight text in this plugin\'s folder in the vault, so turn it off if you sync or publish that folder.')
			.addToggle((t) =>
				t.setValue(plugin.settings.persistCache).onChange(async (v) => {
					plugin.settings.persistCache = v
					await plugin.saveSettings()
					if (!v) await plugin.cache.clear()
				})
			)
	}
}
