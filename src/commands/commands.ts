import { MarkdownView } from 'obsidian'
import type ReadwiseEmbedsPlugin from '../main'
import { LIBRARY_VIEW, openView, WEB_VIEW } from '../ui/views'

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

	plugin.addCommand({ id: 'open-library', name: 'Open Readwise library', callback: () => void openView(plugin.app, LIBRARY_VIEW) })
	plugin.addCommand({ id: 'open-reader-web', name: 'Open Readwise website', callback: () => void openView(plugin.app, WEB_VIEW) })

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
