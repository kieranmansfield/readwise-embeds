import { parseDate } from './dates'

/** One filterable field. `C` is whatever a predicate is evaluated against (a highlight with its book, a document). */
export type Def<C> =
	| { kind: 'string'; get: (c: C) => string[] }
	| { kind: 'number'; get: (c: C) => number | undefined }
	| { kind: 'date'; get: (c: C) => number | undefined }
	| { kind: 'bool'; get: (c: C) => boolean }
	| { kind: 'has' }
	/** Understood but not available; using it is an error rather than a silently ignored term. */
	| { kind: 'unsupported'; reason: string }

export interface Schema<C> {
	fields: Record<string, Def<C>>
	/** Values for `has:`. */
	has: Record<string, (c: C) => boolean>
}

type Kind = Exclude<Def<never>['kind'], 'unsupported'>

const OPS: Record<Kind, string[]> = {
	string: ['', 'exact', 'contains', 'not'],
	number: ['', 'gt', 'gte', 'lt', 'lte', 'not'],
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
export function nearestField<C>(schema: Schema<C>, name: string): string | undefined {
	const best = Object.keys(schema.fields)
		.map((f) => [f, distance(name, f)] as const)
		.sort((a, b) => a[1] - b[1])[0]
	return best[1] <= 2 ? best[0] : undefined
}

const VALUE_CHECKS: Record<Kind, (field: string, value: string, has: string[]) => string | null> = {
	string: () => null,
	number: (f, v) => (v.trim() !== '' && Number.isFinite(Number(v)) ? null : `${f} must be a number.`),
	date: (f, v) => (parseDate(v, 0) === null ? `"${v}" is not a date. Use 2026-03-20 or "3 months ago".` : null),
	bool: (f, v) => (/^(true|false)$/i.test(v) ? null : `${f} must be true or false.`),
	has: (f, v, has) => (has.includes(v) ? null : `has must be one of: ${has.join(', ')}.`),
}

/** Why `field__op:value` is invalid, or null if it is fine. */
export function checkTerm<C>(schema: Schema<C>, field: string, op: string, value: string): string | null {
	const def = schema.fields[field]
	if (def.kind === 'unsupported') return `"${field}" ${def.reason}`
	if (!OPS[def.kind].includes(op)) {
		const allowed = OPS[def.kind].map((o) => (o ? `${field}__${o}` : field)).join(', ')
		return `"${op ? `${field}__${op}` : field}" is not valid here. Use: ${allowed}.`
	}
	return VALUE_CHECKS[def.kind](field, value, Object.keys(schema.has))
}
