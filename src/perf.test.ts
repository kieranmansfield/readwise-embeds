import { describe, expect, it } from 'vitest'
import type { RwBook } from './api/readwise'
import { mergeBooks } from './cache/cache'
import { readwiseSchema } from './filter/fields'
import { compileQuery } from './filter/query'
import { highlightRows, selectBooks, selectRows } from './render/rows'

// 2,000 books x 25 highlights = 50,000 highlights, far more than a typical library.
const big: RwBook[] = Array.from({ length: 2000 }, (_, b) => ({
	user_book_id: b,
	title: `Book ${b}`,
	author: `Author ${b % 50}`,
	category: b % 3 ? 'books' : 'articles',
	highlights: Array.from({ length: 25 }, (_, h) => ({
		id: b * 100 + h,
		text: `Highlight ${h} of book ${b}`,
		note: h % 5 ? undefined : 'a note',
		tags: h % 7 ? [] : [{ name: 'tagged' }],
		highlighted_at: new Date(2020, 0, 1 + ((b + h) % 2000)).toISOString(),
	})),
}))

describe('large library', () => {
	it('filters, sorts and merges 50,000 highlights well inside a frame budget for a refresh', () => {
		const q = compileQuery('category:books AND (has:note OR tag:tagged) AND author__not:"Author 3"', readwiseSchema)
		if (!('test' in q)) throw new Error('query failed')
		const t0 = performance.now()
		const rows = highlightRows(big)
		expect(selectRows(rows, { sort: '-highlighted_at', limit: 50 }, q.test)).toHaveLength(50)
		expect(selectBooks(big, { sort: '-num_highlights', limit: 50 }, q.test).length).toBeGreaterThan(0)
		const merged = mergeBooks(big, [big[10]])
		expect(merged).toHaveLength(2000)
		expect(performance.now() - t0).toBeLessThan(2000)
	})
})
