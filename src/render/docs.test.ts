import { describe, expect, it } from 'vitest'
import type { RdDoc } from '../api/reader'
import { readerSchema } from '../filter/readerFields'
import { compileQuery } from '../filter/query'
import { docGroupKey, emptyDocsText, selectDocs, truncationNotice } from './docs'

const docs: RdDoc[] = [
	{ id: '1', title: 'B', saved_at: '2026-01-01T00:00:00Z', word_count: 100, site_name: 'x.com', location: 'later', category: 'article' },
	{ id: '2', title: 'A', saved_at: '2026-03-01T00:00:00Z', word_count: 900, source_url: 'https://y.org/p', location: 'archive', category: 'pdf' },
	{ id: '3', title: 'hl', saved_at: '2026-05-01T00:00:00Z', parent_id: '1', category: 'highlight' },
]
const ids = (d: RdDoc[]) => d.map((x) => x.id)

describe('selectDocs', () => {
	it('hides highlight documents, sorts both ways, limits', () => {
		expect(ids(selectDocs(docs, { sort: '-saved_at', limit: 9 }))).toEqual(['2', '1'])
		expect(ids(selectDocs(docs, { sort: 'title', limit: 9 }))).toEqual(['2', '1'])
		expect(ids(selectDocs(docs, { sort: '-word_count', limit: 1 }))).toEqual(['2'])
		expect(ids(selectDocs(docs, { sort: '-saved_at', limit: 9 }, undefined, true))).toEqual(['3', '2', '1'])
	})

	it('applies the compiled filter', () => {
		const q = compileQuery('in:later', readerSchema)
		if (!('test' in q)) throw new Error('bad query')
		expect(ids(selectDocs(docs, { sort: '-saved_at', limit: 9 }, q.test))).toEqual(['1'])
	})
})

describe('grouping and messages', () => {
	it('groups by location, category or site (site name, else host)', () => {
		expect(docGroupKey('location')?.(docs[0])).toBe('later')
		expect(docGroupKey('category')?.(docs[1])).toBe('pdf')
		expect(docGroupKey('site')?.(docs[0])).toBe('x.com')
		expect(docGroupKey('site')?.(docs[1])).toBe('y.org')
		expect(docGroupKey('site')?.({ id: '9' })).toBe('Other')
		expect(docGroupKey('')).toBeUndefined()
	})

	it('echoes the filter and explains truncation', () => {
		expect(emptyDocsText('tag:x')).toBe('No documents match. Filter: tag:x')
		expect(emptyDocsText('')).toBe('No documents match.')
		expect(truncationNotice(1000)).toContain('1000')
	})
})
