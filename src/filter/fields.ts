import type { RwBook, RwHighlight } from '../api/readwise'
import type { Schema } from './schema'

export interface Ctx {
	book: RwBook
	h: RwHighlight
}

const one = (v: string | undefined | null) => (v ? [v] : [])
const names = (tags?: { name: string }[]) => (tags ?? []).map((t) => t.name)
const when = (iso?: string | null) => Date.parse(iso ?? '') || undefined

/** Fields for `readwise` blocks: a highlight together with its book. */
export const readwiseSchema: Schema<Ctx> = {
	has: {
		note: (c) => !!c.h.note?.trim(),
		tags: (c) => !!c.h.tags?.length,
	},
	fields: {
		category: { kind: 'string', get: (c) => one(c.book.category) },
		source: { kind: 'string', get: (c) => one(c.book.source) },
		title: { kind: 'string', get: (c) => one(c.book.title) },
		author: { kind: 'string', get: (c) => one(c.book.author) },
		text: { kind: 'string', get: (c) => one(c.h.text) },
		note: { kind: 'string', get: (c) => one(c.h.note) },
		tag: { kind: 'string', get: (c) => [...names(c.h.tags), ...names(c.book.book_tags)] },
		color: { kind: 'string', get: (c) => one(c.h.color) },
		highlighted: { kind: 'date', get: (c) => when(c.h.highlighted_at) },
		updated: { kind: 'date', get: (c) => when(c.h.updated_at) },
		favorite: { kind: 'bool', get: (c) => !!c.h.is_favorite },
		discarded: { kind: 'bool', get: (c) => !!c.h.is_discard },
		has: { kind: 'has' },
	},
}
