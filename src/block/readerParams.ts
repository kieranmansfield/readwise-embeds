import { bool, limit, oneOf, parseWith, sortOf, type Check } from './params'

const COLUMNS = ['title', 'author', 'site', 'category', 'location', 'words', 'time', 'progress', 'saved', 'published', 'tags'] as const
export type Column = (typeof COLUMNS)[number]

export interface ReaderParams {
	search: string
	sort: string
	format: 'list' | 'table' | 'card'
	columns: Column[]
	limit: number
	showTags: boolean
	showSummary: boolean
	group: '' | 'location' | 'category' | 'site'
}

export const DEFAULT_READER_PARAMS: ReaderParams = {
	search: '',
	sort: '-saved_at',
	format: 'list',
	columns: ['title', 'author', 'site', 'saved'],
	limit: 50,
	showTags: true,
	showSummary: false,
	group: '',
}

const columns: Check = (value) => {
	const names = value.split(',').map((c) => c.trim().toLowerCase()).filter(Boolean)
	const bad = names.find((n) => !(COLUMNS as readonly string[]).includes(n))
	if (bad || !names.length) return { error: `columns must be a list of: ${COLUMNS.join(', ')}.${bad ? ` Unknown: ${bad}.` : ''}` }
	return { value: names }
}

const CHECKS: Record<string, Check> = {
	sort: sortOf(['saved_at', 'updated_at', 'published_date', 'title', 'author', 'word_count', 'reading_progress']),
	format: oneOf('format', ['list', 'table', 'card']),
	columns,
	limit,
	showTags: bool('showTags'),
	showSummary: bool('showSummary'),
	group: oneOf('group', ['location', 'category', 'site']),
}

export const parseReaderParams = (source: string, defaults: ReaderParams = DEFAULT_READER_PARAMS) => parseWith(source, defaults, CHECKS)
