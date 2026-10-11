import type { App } from 'obsidian'
import type { RwBook } from '../api/readwise'
import type { Snapshot } from './cache'

/** The saved library, or null if the text is not one this version wrote. */
export function parseCache(text: string): Snapshot | null {
	try {
		const f = JSON.parse(text) as { v?: number; fetchedAt?: unknown; books?: unknown }
		if (f.v !== 1 || typeof f.fetchedAt !== 'number' || !Array.isArray(f.books)) return null
		return { fetchedAt: f.fetchedAt, books: f.books as RwBook[] }
	} catch {
		return null
	}
}

export const serializeCache = (snap: Snapshot): string => JSON.stringify({ v: 1, ...snap })

/** The library saved next to the plugin's data.json. A missing or unreadable file just means no cache. */
export function cacheFile(app: App, pluginId: string) {
	const path = `${app.vault.configDir}/plugins/${pluginId}/cache.json`
	return {
		load: async (): Promise<Snapshot | null> => ((await app.vault.adapter.exists(path)) ? parseCache(await app.vault.adapter.read(path)) : null),
		// ponytail: a failed write only costs a full download next session, so it is not reported
		save: (snap: Snapshot) => void app.vault.adapter.write(path, serializeCache(snap)).catch(() => undefined),
		clear: async () => {
			if (await app.vault.adapter.exists(path)) await app.vault.adapter.remove(path)
		},
	}
}
