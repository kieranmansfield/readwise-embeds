import { Notice, PluginSettingTab, SecretComponent, Setting, type App } from 'obsidian'
import type ReadwiseEmbedsPlugin from '../main'
import { MIN_REFRESH_MINUTES, validRefreshMinutes } from '../settings'

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
	}
}
