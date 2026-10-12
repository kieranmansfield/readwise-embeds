export interface BlockParams {
	view: 'highlights' | 'books' | 'review'
	search: string
	sort: string
	format: 'list' | 'table' | 'quote' | 'card'
	limit: number
	showNotes: boolean
	showTags: boolean
	showSource: boolean
	group: '' | 'book' | 'category'
	warnings: boolean
	size: number
	date: string
}

export const DEFAULT_PARAMS: BlockParams = {
	view: 'highlights',
	search: '',
	sort: '-highlighted_at',
	format: 'list',
	limit: 50,
	showNotes: true,
	showTags: true,
	showSource: true,
	group: '',
	warnings: true,
	size: 0,
	date: '',
}

export type Check = (value: string) => { value: unknown } | { error: string }

export const oneOf =
	(key: string, options: string[]): Check =>
	(value) =>
		options.includes(value) ? { value } : { error: `${key} must be one of: ${options.join(', ')}.` }

export const bool =
	(key: string): Check =>
	(value) =>
		value === 'true' || value === 'false' ? { value: value === 'true' } : { error: `${key} must be true or false.` }

/** Card grid column width in px; 0 (the default) keeps full-width cards. */
export const size: Check = (value) => {
	const n = Number(value)
	return Number.isInteger(n) && (n === 0 || (n >= 120 && n <= 800)) ? { value: n } : { error: 'size must be 0 (full-width cards) or a whole number from 120 to 800.' }
}

/** A real calendar day, `YYYY-MM-DD`, as a daily-note template can fill in. */
export const date: Check = (value) => {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
	const d = m && new Date(+m[1], +m[2] - 1, +m[3])
	return d && d.getMonth() === +m![2] - 1 && d.getDate() === +m![3] ? { value } : { error: 'date must be a real day like 2026-10-12.' }
}

export const limit: Check = (value) => {
	const n = Number(value)
	return Number.isInteger(n) && n >= 1 && n <= 500 ? { value: n } : { error: 'limit must be a whole number from 1 to 500.' }
}

/** `sort` accepts one of `keys`, optionally prefixed with `-` for descending. */
export const sortOf =
	(keys: string[]): Check =>
	(value) =>
		keys.includes(value.replace(/^-/, '')) ? { value } : { error: `sort must be ${keys.join(', ')}, optionally prefixed with -.` }

/**
 * Parses `key: value` lines against `defaults` (whose keys are the only valid ones). Splits on the first `:` so a
 * value like `search: tag:x` stays whole. Problems become warnings; a bad value keeps the default. Keys with no
 * entry in `checks` accept any text.
 */
export function parseWith<T extends object>(source: string, defaults: T, checks: Record<string, Check>): { params: T; warnings: string[] } {
	const params: Record<string, unknown> = { ...(defaults as Record<string, unknown>) }
	const warnings: string[] = []
	for (const line of source.split('\n')) {
		if (!line.trim()) continue
		const i = line.indexOf(':')
		const key = line.slice(0, i).trim()
		if (i < 0 || !(key in defaults)) {
			warnings.push(`Unknown key "${i < 0 ? line.trim() : key}".`)
			continue
		}
		const text = line.slice(i + 1).trim()
		const r = checks[key]?.(text) ?? { value: text }
		if ('error' in r) warnings.push(r.error)
		else params[key] = r.value
	}
	return { params: params as T, warnings }
}

const CHECKS: Record<string, Check> = {
	view: oneOf('view', ['highlights', 'books', 'review']),
	format: oneOf('format', ['list', 'table', 'quote', 'card']),
	group: oneOf('group', ['book', 'category']),
	showNotes: bool('showNotes'),
	showTags: bool('showTags'),
	showSource: bool('showSource'),
	warnings: bool('warnings'),
	size,
	date,
	limit,
	sort: sortOf(['highlighted_at', 'updated', 'title', 'author', 'num_highlights']),
}

export const parseParams = (source: string, defaults: BlockParams = DEFAULT_PARAMS) => parseWith(source, defaults, CHECKS)
