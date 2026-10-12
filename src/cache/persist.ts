import type { App } from 'obsidian'
import type { RwBook } from '../api/readwise'
import type { Snapshot } from './cache'
import type { SavedDocs } from './docs'

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

/** The saved Reader documents, or null if the text is not one this version wrote. */
export function parseDocs(text: string): SavedDocs | null {
	try {
		const f = JSON.parse(text) as { v?: number; locations?: unknown }
		return f.v === 1 && f.locations && typeof f.locations === 'object' && !Array.isArray(f.locations) ? (f.locations as SavedDocs) : null
	} catch {
		return null
	}
}

export const serializeDocs = (locations: SavedDocs): string => JSON.stringify({ v: 1, locations })

/** A cache saved next to the plugin's data.json. A missing or unreadable file just means no cache. */
export function cacheFile<T>(app: App, pluginId: string, name: string, parse: (text: string) => T | null, serialize: (value: T) => string) {
	const path = `${app.vault.configDir}/plugins/${pluginId}/${name}`
	return {
		load: async (): Promise<T | null> => ((await app.vault.adapter.exists(path)) ? parse(await app.vault.adapter.read(path)) : null),
		// ponytail: a failed write only costs a full download next session, so it is not reported
		save: (value: T) => void app.vault.adapter.write(path, serialize(value)).catch(() => undefined),
		clear: async () => {
			if (await app.vault.adapter.exists(path)) await app.vault.adapter.remove(path)
		},
	}
}
