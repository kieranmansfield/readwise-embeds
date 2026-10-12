import type { RdDoc } from '../api/reader'
import type { Schema } from './schema'

const one = (v: string | undefined | null) => (v ? [v] : [])
const when = (v: string | number | null | undefined): number | undefined => {
	if (typeof v === 'number') return v
	return Date.parse(v ?? '') || undefined
}
const tagNames = (d: RdDoc) => Object.values(d.tags ?? {}).flatMap((t) => one(t.name))

// ponytail: reading speed assumed (words ÷ 238) when `reading_time` is missing; check against Reader
const WORDS_PER_MINUTE = 238

/** Minutes to read, from `reading_time` ("4 mins") or the word count. */
export function minutesOf(d: RdDoc): number | undefined {
	const parsed = /\d+/.exec(d.reading_time ?? '')
	if (parsed) return Number(parsed[0])
	return d.word_count ? Math.ceil(d.word_count / WORDS_PER_MINUTE) : undefined
}

function hostOf(url?: string): string[] {
	try {
		return url ? [new URL(url).hostname] : []
	} catch {
		return []
	}
}

/** `inbox` is Reader's name for the API's `new`, so both match. */
const locations = (d: RdDoc) => (d.location === 'new' ? ['new', 'inbox'] : one(d.location))

const unsupported = (why: string) => ({ kind: 'unsupported' as const, reason: why })
const NOT_RETURNED = 'is not returned by the Reader API, so it cannot be used in a filter.'
const NEEDS_HIGHLIGHTS = 'needs each document\'s highlights, which blocks do not fetch yet.'

/** Fields for `reader` blocks: one Reader document. */
export const readerSchema: Schema<RdDoc> = {
	has: {
		notes: (d) => !!d.notes?.trim(),
		tags: (d) => tagNames(d).length > 0,
	},
	fields: {
		in: { kind: 'string', get: locations },
		location: { kind: 'string', get: locations },
		category: { kind: 'string', get: (d) => one(d.category) },
		type: { kind: 'string', get: (d) => one(d.category) },
		tag: { kind: 'string', get: tagNames },
		title: { kind: 'string', get: (d) => one(d.title) },
		author: { kind: 'string', get: (d) => one(d.author) },
		url: { kind: 'string', get: (d) => one(d.source_url) },
		domain: { kind: 'string', get: (d) => [...hostOf(d.source_url), ...one(d.site_name)] },
		saved_using: { kind: 'string', get: (d) => one(d.source) },
		saved: { kind: 'date', get: (d) => when(d.saved_at) },
		published: { kind: 'date', get: (d) => when(d.published_date) },
		last_opened: { kind: 'date', get: (d) => when(d.last_opened_at) },
		// ponytail: assumed to mean last_moved_at; check against Reader
		last_status: { kind: 'date', get: (d) => when(d.last_moved_at) },
		seen: { kind: 'bool', get: (d) => !!d.first_opened_at },
		unseen: { kind: 'bool', get: (d) => !d.first_opened_at },
		feed: { kind: 'bool', get: (d) => d.location === 'feed' },
		words: { kind: 'number', get: (d) => d.word_count },
		minutes: { kind: 'number', get: minutesOf },
		progress: { kind: 'number', get: (d) => (d.reading_progress === undefined ? undefined : Math.round(d.reading_progress * 100)) },
		has: { kind: 'has' },
		highlights: unsupported(NEEDS_HIGHLIGHTS),
		shared: unsupported(NOT_RETURNED),
		saved_count: unsupported(NOT_RETURNED),
		rss_source: unsupported(NOT_RETURNED),
	},
}
