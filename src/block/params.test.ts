import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, parseParams } from './params'

describe('parseParams', () => {
	it('uses defaults for an empty block', () => {
		expect(parseParams('')).toEqual({ params: DEFAULT_PARAMS, warnings: [] })
	})

	it('parses keys and splits on the first colon only', () => {
		const { params, warnings } = parseParams('search: tag:x AND sort:y\nlimit: 20\nshowNotes: false\nformat: quote')
		expect(params).toMatchObject({ search: 'tag:x AND sort:y', limit: 20, showNotes: false, format: 'quote' })
		expect(warnings).toEqual([])
	})

	it('warns on unknown keys and bad values, keeping defaults', () => {
		const { params, warnings } = parseParams('colour: red\nlimit: 9000\nformat: grid\nshowTags: maybe\nnonsense')
		expect(params).toEqual(DEFAULT_PARAMS)
		expect(warnings).toHaveLength(5)
	})
})
