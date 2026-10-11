import { RwError, type RwBook } from '../api/readwise'

export interface Snapshot {
	books: RwBook[]
	/** Epoch ms of the last successful fetch; 0 if never. */
	fetchedAt: number
}

export interface StoreDeps {
	fetch: (updatedAfter?: string) => Promise<RwBook[]>
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
export function createStore({ fetch, now = () => Date.now(), sleep = (ms) => new Promise((r) => window.setTimeout(r, ms)) }: StoreDeps) {
	let snap: Snapshot = { books: [], fetchedAt: 0 }
	let running: Promise<Snapshot> | undefined

	async function pull(): Promise<Snapshot> {
		const startedAt = now()
		const since = snap.fetchedAt ? new Date(snap.fetchedAt).toISOString() : undefined
		let fresh: RwBook[]
		try {
			fresh = await fetch(since)
		} catch (e) {
			if (!(e instanceof RwError) || e.kind !== 'rate-limit') throw e
			await sleep(e.retryAfter * 1000)
			fresh = await fetch(since)
		}
		return (snap = { books: since ? mergeBooks(snap.books, fresh) : mergeBooks([], fresh), fetchedAt: startedAt })
	}

	const refresh = () => (running ??= pull().finally(() => (running = undefined)))

	return {
		/** The data held right now, possibly empty or stale. */
		peek: () => snap,
		/** Fetches (or joins the fetch in flight). On failure the held data stays. */
		refresh,
		/** Held data if younger than `maxAgeMs`, else a refresh. */
		get: (maxAgeMs: number) => (snap.fetchedAt && now() - snap.fetchedAt < maxAgeMs ? Promise.resolve(snap) : refresh()),
	}
}

export type Store = ReturnType<typeof createStore>
