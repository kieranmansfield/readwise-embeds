import type { DocResult, DocSlice, RdDoc } from '../api/reader'
import type { StoreEvent } from './retry'

export interface DocEntry extends DocResult {
	/** Epoch ms of the fetch. */
	fetchedAt: number
}

export interface DocStoreDeps {
	fetch: (slice: DocSlice, onPage: (count: number) => void, onWait: (seconds: number) => void) => Promise<DocResult>
	now?: () => number
}

const keyOf = (s: DocSlice) => JSON.stringify([s.location, s.category, s.maxPages])

/** Documents from several slices as one list, each document once, and whether any slice was cut short. */
export function mergeEntries(entries: DocResult[]): DocResult {
	const byId = new Map<string, RdDoc>()
	for (const e of entries) for (const d of e.docs) byId.set(d.id, d)
	return { docs: [...byId.values()], truncated: entries.some((e) => e.truncated) }
}

/**
 * Reader documents kept per request slice, in memory. Blocks that ask for the same slice share one download
 * (the client waits out a 429 page by page), and a failed refresh keeps what was held.
 */
// ponytail: memory only, no incremental refresh; Reader queries are narrow, so a hit is one to ten requests
export function createDocStore({ fetch, now = () => Date.now() }: DocStoreDeps) {
	const held = new Map<string, DocEntry>()
	const running = new Map<string, Promise<DocEntry>>()
	const listeners = new Set<(e: StoreEvent) => void>()
	const emit = (e: StoreEvent) => listeners.forEach((l) => l(e))

	async function pull(slice: DocSlice, key: string): Promise<DocEntry> {
		const result = await fetch(slice, (count) => emit({ type: 'progress', count }), (seconds) => emit({ type: 'wait', seconds }))
		const entry = { ...result, fetchedAt: now() }
		held.set(key, entry)
		return entry
	}

	const refresh = (slice: DocSlice): Promise<DocEntry> => {
		const key = keyOf(slice)
		const existing = running.get(key)
		if (existing) return existing
		const p = pull(slice, key).finally(() => running.delete(key))
		running.set(key, p)
		return p
	}

	return {
		/** What is held for this slice right now, possibly stale. */
		peek: (slice: DocSlice) => held.get(keyOf(slice)),
		refresh,
		/** Held data if younger than `maxAgeMs`, else a refresh. */
		get(slice: DocSlice, maxAgeMs: number): Promise<DocEntry> {
			const e = held.get(keyOf(slice))
			return e && now() - e.fetchedAt < maxAgeMs ? Promise.resolve(e) : refresh(slice)
		},
		subscribe(listener: (e: StoreEvent) => void): () => void {
			listeners.add(listener)
			return () => void listeners.delete(listener)
		},
		reset: () => held.clear(),
	}
}

export type DocStore = ReturnType<typeof createDocStore>
