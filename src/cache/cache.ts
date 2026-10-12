import type { RwBook } from '../api/readwise'
import { withRateLimitRetry, type StoreEvent } from './retry'

export interface Snapshot {
	books: RwBook[]
	/** Epoch ms of the last successful fetch; 0 if never. */
	fetchedAt: number
}

export interface StoreDeps {
	fetch: (updatedAfter?: string, onPage?: (count: number) => void) => Promise<RwBook[]>
	/** Previously saved library, to start from; null or a rejection means start empty. */
	load?: () => Promise<Snapshot | null>
	/** Called after every successful fetch, and on reset. Not awaited. */
	save?: (snap: Snapshot) => void
	now?: () => number
	sleep?: (ms: number) => Promise<void>
}

/** Merges an incremental export into `books` by id; highlights flagged deleted are dropped. */
export function mergeBooks(books: RwBook[], fresh: RwBook[]): RwBook[] {
	const byId = new Map(books.map((b) => [b.user_book_id, b]))
	for (const b of fresh) {
		const old = byId.get(b.user_book_id)
		const hl = new Map((old?.highlights ?? []).map((h) => [h.id, h]))
		for (const h of b.highlights) hl.set(h.id, h)
		byId.set(b.user_book_id, { ...old, ...b, highlights: [...hl.values()].filter((h) => !h.is_deleted) })
	}
	return [...byId.values()]
}

/**
 * Library kept in memory: the first call downloads everything, later calls fetch only what changed.
 * All blocks share it, and concurrent refreshes share one fetch. A 429 waits `Retry-After` and retries once.
 */
export function createStore({ fetch, load, save, now = () => Date.now(), sleep = (ms) => new Promise((r) => window.setTimeout(r, ms)) }: StoreDeps) {
	let snap: Snapshot = { books: [], fetchedAt: 0 }
	let running: Promise<Snapshot> | undefined
	const listeners = new Set<(e: StoreEvent) => void>()
	let loaded: Promise<void> | undefined
	/** Resolves once the saved library, if any, has been read. Safe to call repeatedly. */
	const ready = () =>
		(loaded ??= (load?.() ?? Promise.resolve(null)).then(
			(saved) => void (saved && !snap.fetchedAt && (snap = saved)),
			() => undefined
		))
	const emit = (e: StoreEvent) => listeners.forEach((l) => l(e))

	async function pull(): Promise<Snapshot> {
		await ready()
		const startedAt = now()
		const since = snap.fetchedAt ? new Date(snap.fetchedAt).toISOString() : undefined
		const fresh = await withRateLimitRetry((onPage) => fetch(since, onPage), emit, sleep)
		snap = { books: since ? mergeBooks(snap.books, fresh) : mergeBooks([], fresh), fetchedAt: startedAt }
		save?.(snap)
		return snap
	}

	const refresh = () => (running ??= pull().finally(() => (running = undefined)))

	return {
		/** The data held right now, possibly empty or stale. */
		peek: () => snap,
		ready,
		/** Progress and rate-limit waits of the fetch in flight. Returns the unsubscribe function. */
		subscribe(listener: (e: StoreEvent) => void): () => void {
			listeners.add(listener)
			return () => void listeners.delete(listener)
		},
		/** Forgets everything held, so the next refresh downloads the whole library again. */
		reset() {
			snap = { books: [], fetchedAt: 0 }
			save?.(snap)
		},
		/** Fetches (or joins the fetch in flight). On failure the held data stays. */
		refresh,
		/** Held data if younger than `maxAgeMs`, else a refresh. */
		get: async (maxAgeMs: number) => {
			await ready()
			return snap.fetchedAt && now() - snap.fetchedAt < maxAgeMs ? snap : refresh()
		},
	}
}

export type Store = ReturnType<typeof createStore>

/** Wraps `fn` so concurrent calls share one promise. */
export function shareInFlight<T>(fn: () => Promise<T>): () => Promise<T> {
	let running: Promise<T> | undefined
	return () => (running ??= fn().finally(() => (running = undefined)))
}
