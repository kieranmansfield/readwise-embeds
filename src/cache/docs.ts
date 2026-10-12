import type { DocResult, DocSlice, RdDoc } from '../api/reader'
import type { StoreEvent } from './retry'

export interface DocEntry extends DocResult {
	/** Epoch ms of the last successful sync of this location. */
	fetchedAt: number
}

/** One location as saved to disk. */
export interface SavedLocation {
	docs: RdDoc[]
	truncated: boolean
	syncedAt: number
	fullAt: number
}
export type SavedDocs = Record<string, SavedLocation>

export interface DocStoreDeps {
	fetch: (slice: Pick<DocSlice, 'location' | 'updatedAfter'>, onPage: (count: number) => void, onWait: (seconds: number) => void) => Promise<DocResult>
	/** Previously saved documents; null or a rejection means start empty. */
	load?: () => Promise<SavedDocs | null>
	/** Called after every successful sync, and on reset. Not awaited. */
	save?: (saved: SavedDocs) => void
	now?: () => number
}

interface Held {
	docs: Map<string, RdDoc>
	truncated: boolean
	syncedAt: number
	fullAt: number
}

/** A full download this old is repeated, since the API never reports deleted documents. */
export const FULL_EVERY_MS = 7 * 24 * 3_600_000
/** A `fullAt` that is always older than {@link FULL_EVERY_MS}, to force the next sync to start over. */
const STALE = Number.MIN_SAFE_INTEGER
/** Delta syncs start this far before the last one, so a document saved mid-sync is not missed. */
const OVERLAP_MS = 5 * 60_000

/** Documents from several locations as one list, each document once, and whether any was cut short. */
export function mergeEntries(entries: DocResult[]): DocResult {
	const byId = new Map<string, RdDoc>()
	for (const e of entries) for (const d of e.docs) byId.set(d.id, d)
	return { docs: [...byId.values()], truncated: entries.some((e) => e.truncated) }
}

/**
 * Reader documents kept per location, in memory and (via `load`/`save`) on disk. The first sync of a location
 * downloads it all; later syncs ask only for what changed since the last one and merge it by id. A full download
 * is repeated weekly because deletions are invisible to the API. Blocks share one sync per location, and a failed
 * sync keeps what was held.
 */
export function createDocStore({ fetch, load, save, now = () => Date.now() }: DocStoreDeps) {
	const held = new Map<string, Held>()
	const running = new Map<string, Promise<DocEntry>>()
	const listeners = new Set<(e: StoreEvent) => void>()
	const emit = (e: StoreEvent) => listeners.forEach((l) => l(e))
	let loaded: Promise<void> | undefined
	/** Resolves once saved documents, if any, have been read. Safe to call repeatedly. */
	const ready = () =>
		(loaded ??= (load?.() ?? Promise.resolve(null)).then(
			(saved) => {
				for (const [loc, s] of Object.entries(saved ?? {})) if (!held.has(loc)) held.set(loc, { ...s, docs: new Map(s.docs.map((d) => [d.id, d])) })
			},
			() => undefined
		))

	const entryOf = (h: Held): DocEntry => ({ docs: [...h.docs.values()], truncated: h.truncated, fetchedAt: h.syncedAt })
	const persist = () => save?.(Object.fromEntries([...held].map(([loc, h]) => [loc, { docs: [...h.docs.values()], truncated: h.truncated, syncedAt: h.syncedAt, fullAt: h.fullAt }])))

	async function pull(location: string): Promise<DocEntry> {
		await ready()
		const cur = held.get(location)
		const startedAt = now()
		const full = !cur || startedAt - cur.fullAt > FULL_EVERY_MS
		const updatedAfter = full ? undefined : new Date(cur.syncedAt - OVERLAP_MS).toISOString()
		const r = await fetch({ location, updatedAfter }, (count) => emit({ type: 'progress', count }), (seconds) => emit({ type: 'wait', seconds }))
		const docs = full ? new Map<string, RdDoc>() : new Map(cur.docs)
		for (const d of r.docs) docs.set(d.id, d)
		// A cut-short delta missed changes, so the next sync starts over.
		const next: Held = full
			? { docs, truncated: r.truncated, syncedAt: startedAt, fullAt: startedAt }
			: { docs, truncated: cur.truncated, syncedAt: startedAt, fullAt: r.truncated ? STALE : cur.fullAt }
		held.set(location, next)
		persist()
		return entryOf(next)
	}

	const refresh = (location: string): Promise<DocEntry> => {
		const existing = running.get(location)
		if (existing) return existing
		const p = pull(location).finally(() => running.delete(location))
		running.set(location, p)
		return p
	}

	return {
		ready,
		/** What is held for this location right now, possibly stale. */
		peek: (location: string) => {
			const h = held.get(location)
			return h && entryOf(h)
		},
		/** Syncs the location: everything the first time, only changes after. */
		refresh,
		/** Held data if synced less than `maxAgeMs` ago, else a sync. */
		async get(location: string, maxAgeMs: number): Promise<DocEntry> {
			await ready()
			const h = held.get(location)
			return h && now() - h.syncedAt < maxAgeMs ? entryOf(h) : refresh(location)
		},
		subscribe(listener: (e: StoreEvent) => void): () => void {
			listeners.add(listener)
			return () => void listeners.delete(listener)
		},
		/** Forgets everything, so the next sync downloads in full. */
		reset() {
			held.clear()
			save?.({})
		},
	}
}

export type DocStore = ReturnType<typeof createDocStore>
