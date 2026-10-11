export interface BlockParams {
	view: 'highlights' | 'books' | 'review'
	search: string
	sort: string
	format: 'list' | 'table' | 'quote'
	limit: number
	showNotes: boolean
	showTags: boolean
	showSource: boolean
	group: '' | 'book' | 'category'
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
}

type Check = (value: string) => { value: unknown } | { error: string }

const oneOf =
	(key: string, options: string[]): Check =>
	(value) =>
		options.includes(value) ? { value } : { error: `${key} must be one of: ${options.join(', ')}.` }

const bool =
	(key: string): Check =>
	(value) =>
		value === 'true' || value === 'false' ? { value: value === 'true' } : { error: `${key} must be true or false.` }

const limit: Check = (value) => {
	const n = Number(value)
	return Number.isInteger(n) && n >= 1 && n <= 500 ? { value: n } : { error: 'limit must be a whole number from 1 to 500.' }
}

/** Per-key validators; keys without one (search, sort) accept any text. */
const CHECKS: Record<string, Check> = {
	view: oneOf('view', ['highlights', 'books', 'review']),
	format: oneOf('format', ['list', 'table', 'quote']),
	group: oneOf('group', ['book', 'category']),
	showNotes: bool('showNotes'),
	showTags: bool('showTags'),
	showSource: bool('showSource'),
	limit,
}

/** Parses `key: value` lines. Splits on the first `:` so a value like `search: tag:x` stays whole. Problems become warnings; a bad value keeps the default. */
export function parseParams(source: string, defaults: BlockParams = DEFAULT_PARAMS): { params: BlockParams; warnings: string[] } {
	const params: Record<string, unknown> = { ...defaults }
	const warnings: string[] = []
	for (const line of source.split('\n')) {
		if (!line.trim()) continue
		const i = line.indexOf(':')
		const key = line.slice(0, i).trim()
		if (i < 0 || !(key in DEFAULT_PARAMS)) {
			warnings.push(`Unknown key "${i < 0 ? line.trim() : key}".`)
			continue
		}
		const text = line.slice(i + 1).trim()
		const r = CHECKS[key]?.(text) ?? { value: text }
		if ('error' in r) warnings.push(r.error)
		else params[key] = r.value
	}
	return { params: params as unknown as BlockParams, warnings }
}
