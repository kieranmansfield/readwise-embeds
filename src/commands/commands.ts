import { MarkdownView } from 'obsidian'
import type ReadwiseEmbedsPlugin from '../main'

export function registerCommands(plugin: ReadwiseEmbedsPlugin) {
	plugin.addCommand({
		id: 'refresh-blocks',
		name: 'Refresh blocks in this note',
		checkCallback: (checking) => {
			const view = plugin.app.workspace.getActiveViewOfType(MarkdownView)
			if (view && !checking) [...plugin.blocks].filter((b) => view.containerEl.contains(b.containerEl)).forEach((b) => void b.refresh())
			return !!view
		},
	})

	plugin.addCommand({
		id: 'reload-library',
		name: 'Reload everything from Readwise',
		callback: () => {
			plugin.store.reset()
			plugin.docs.reset()
			for (const b of plugin.blocks) void b.refresh()
		},
	})
}
