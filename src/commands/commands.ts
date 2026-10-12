import { MarkdownView, Platform } from 'obsidian'
import type ReadwiseEmbedsPlugin from '../main'
import { LIBRARY_VIEW, openSite, openView, CHAT_WEB_VIEW, GHOSTREADER_WEB_VIEW, READER_LIBRARY_VIEW, READWISE_WEB_VIEW, WEB_VIEW } from '../ui/views'

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
	plugin.addCommand({ id: 'open-reader-library', name: 'Open Readwise documents', callback: () => void openView(plugin.app, READER_LIBRARY_VIEW) })
	if (Platform.isDesktopApp) registerWebCommands(plugin)

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

/** Websites need Electron's webview, so these exist on desktop only. */
function registerWebCommands(plugin: ReadwiseEmbedsPlugin) {
	plugin.addCommand({ id: 'open-reader-web', name: 'Open Reader website', callback: () => void openSite(plugin.app, WEB_VIEW) })
	plugin.addCommand({ id: 'open-chat-sidebar', name: 'Open Readwise chat in the sidebar', callback: () => void openSite(plugin.app, CHAT_WEB_VIEW, { sidebar: true }) })
	plugin.addCommand({ id: 'new-chat-sidebar', name: 'Start a new Readwise chat in the sidebar', callback: () => void openSite(plugin.app, CHAT_WEB_VIEW, { sidebar: true, fresh: true }) })
	plugin.addCommand({ id: 'open-ghostreader-sidebar', name: 'Open Ghostreader in the sidebar', callback: () => void openSite(plugin.app, GHOSTREADER_WEB_VIEW, { sidebar: true }) })
	plugin.addCommand({ id: 'new-ghostreader-sidebar', name: 'Start a new Ghostreader chat in the sidebar', callback: () => void openSite(plugin.app, GHOSTREADER_WEB_VIEW, { sidebar: true, fresh: true }) })
	plugin.addCommand({ id: 'open-readwise-web', name: 'Open Readwise website', callback: () => void openSite(plugin.app, READWISE_WEB_VIEW) })
}
