import { Plugin } from 'obsidian'
import { DEFAULT_SETTINGS, type ReadwiseEmbedsSettings } from './settings'

export default class ReadwiseEmbedsPlugin extends Plugin {
	settings!: ReadwiseEmbedsSettings

	async onload() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
	}

	async saveSettings() {
		await this.saveData(this.settings)
	}
}
