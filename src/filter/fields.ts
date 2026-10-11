import type { RwBook, RwHighlight } from '../api/readwise'
import { parseDate } from './dates'

export interface Ctx {
	book: RwBook
	h: RwHighlight
}

type Def =
	| { kind: 'string'; get: (c: Ctx) => string[] }
	| { kind: 'date'; get: (c: Ctx) => number | undefined }
	| { kind: 'bool'; get: (c: Ctx) => boolean }
	| { kind: 'has' }

const one = (v: string | undefined | null) => (v ? [v] : [])
const names = (tags?: { name: string }[]) => (tags ?? []).map((t) => t.name)
const when = (iso?: string | null) => Date.parse(iso ?? '') || undefined

export const HAS: Record<string, (c: Ctx) => boolean> = {
	note: (c) => !!c.h.note?.trim(),
	tags: (c) => !!c.h.tags?.length,
}

export const FIELDS: Record<string, Def> = {
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
}

const OPS: Record<Def['kind'], string[]> = {
	string: ['', 'exact', 'contains', 'not'],
	date: ['before', 'after'],
	bool: ['', 'not'],
	has: ['', 'not'],
}

function distance(a: string, b: string): number {
	let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
	for (let i = 1; i <= a.length; i++) {
		const row = [i]
		for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
		prev = row
	}
	return prev[b.length]
}

/** The known field closest to `name`, if any is within two edits. */
export function nearestField(name: string): string | undefined {
	const best = Object.keys(FIELDS)
		.map((f) => [f, distance(name, f)] as const)
		.sort((a, b) => a[1] - b[1])[0]
	return best[1] <= 2 ? best[0] : undefined
}

const VALUE_CHECKS: Record<Def['kind'], (field: string, value: string) => string | null> = {
	string: () => null,
	date: (f, v) => (parseDate(v, 0) === null ? `"${v}" is not a date. Use 2026-03-20 or "3 months ago".` : null),
	bool: (f, v) => (/^(true|false)$/i.test(v) ? null : `${f} must be true or false.`),
	has: (f, v) => (v in HAS ? null : `has must be one of: ${Object.keys(HAS).join(', ')}.`),
}

/** Why `field__op:value` is invalid, or null if it is fine. */
export function checkTerm(field: string, op: string, value: string): string | null {
	const def = FIELDS[field]
	if (!OPS[def.kind].includes(op)) {
		const allowed = OPS[def.kind].map((o) => (o ? `${field}__${o}` : field)).join(', ')
		return `"${op ? `${field}__${op}` : field}" is not valid here. Use: ${allowed}.`
	}
	return VALUE_CHECKS[def.kind](field, value)
}
