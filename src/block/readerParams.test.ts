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
