import { describe, expect, it } from 'vitest'
import { DEFAULT_READER_PARAMS, parseReaderParams } from './readerParams'

describe('parseReaderParams', () => {
	it('defaults, then parses reader keys', () => {
		expect(parseReaderParams('')).toEqual({ params: DEFAULT_READER_PARAMS, warnings: [] })
		const { params, warnings } = parseReaderParams('search: in:later tag:css\nsort: -word_count\nformat: table\ncolumns: Title, words ,tags\nshowSummary: true\ngroup: site')
		expect(params).toMatchObject({ search: 'in:later tag:css', sort: '-word_count', format: 'table', columns: ['title', 'words', 'tags'], showSummary: true, group: 'site' })
		expect(warnings).toEqual([])
	})

	it('warns on readwise-only keys and bad values, keeping defaults', () => {
		const { params, warnings } = parseReaderParams('view: books\nformat: quote\ncolumns: title, wings\ncolumns:\nsort: highlighted_at\ngroup: book')
		expect(params).toEqual(DEFAULT_READER_PARAMS)
		expect(warnings).toHaveLength(6)
	})
})

describe('warnings key', () => {
	it('defaults on and can be turned off', () => {
		expect(parseReaderParams('').params.warnings).toBe(true)
		expect(parseReaderParams('warnings: false').params.warnings).toBe(false)
		expect(parseReaderParams('warnings: no').warnings).toHaveLength(1)
	})
})

describe('size key', () => {
	it('is 0 by default and accepts 0 or 120 to 800', () => {
		expect(parseReaderParams('').params.size).toBe(0)
		expect(parseReaderParams('size: 240').params.size).toBe(240)
		expect(parseReaderParams('size: 50').warnings).toHaveLength(1)
		expect(parseReaderParams('size: wide').params.size).toBe(0)
	})
})

describe('date key', () => {
	it('takes a real day only', () => {
		expect(parseReaderParams('date: 2026-10-12').params.date).toBe('2026-10-12')
		expect(parseReaderParams('date: 2026-02-30').warnings).toHaveLength(1)
		expect(parseReaderParams('date: today').warnings).toHaveLength(1)
	})
})
