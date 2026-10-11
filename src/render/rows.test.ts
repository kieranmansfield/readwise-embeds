import { describe, expect, it } from 'vitest'
import { RwError, type RwBook } from '../api/readwise'
import { compileQuery } from '../filter/query'
import { describeFailure, emptyText, highlightRows, isSupported, selectBooks, selectRows } from './rows'

const books: RwBook[] = [
	{ user_book_id: 1, title: 'Alpha', author: 'Zed', highlights: [{ id: 1, text: 'old', highlighted_at: '2024-01-01T00:00:00Z' }, { id: 2, text: 'gone', is_deleted: true }] },
	{ user_book_id: 2, title: 'Beta', author: 'Amy', highlights: [{ id: 3, text: 'new', note: 'n', highlighted_at: '2025-01-01T00:00:00Z' }, { id: 4, text: 'newer', note: 'n', highlighted_at: '2025-06-01T00:00:00Z' }] },
	{ user_book_id: 3, title: 'Gamma', highlights: [] },
]
const rows = highlightRows(books)
const text = (r: { h: { text: string } }[]) => r.map((x) => x.h.text)
const test = (src: string) => {
	const q = compileQuery(src)
	if ('error' in q) throw new Error(q.error)
	return q.test
}

describe('selectRows', () => {
	it('sorts, drops deleted, applies limit', () => {
		expect(text(selectRows(rows, { sort: '-highlighted_at', limit: 9 }))).toEqual(['newer', 'new', 'old'])
		expect(text(selectRows(rows, { sort: 'highlighted_at', limit: 1 }))).toEqual(['old'])
		expect(text(selectRows(rows, { sort: 'author', limit: 9 }))[0]).toBe('new')
		expect(text(selectRows(rows, { sort: 'bogus', limit: 9 }))[0]).toBe('old')
	})

	it('filters with a compiled query', () => {
		expect(text(selectRows(rows, { sort: '-highlighted_at', limit: 9 }, test('has:note')))).toEqual(['newer', 'new'])
	})
})

describe('selectBooks', () => {
	it('lists every book without a filter, including empty ones', () => {
		expect(selectBooks(books, { sort: 'title', limit: 9 }).map((b) => b.book.title)).toEqual(['Alpha', 'Beta', 'Gamma'])
		expect(selectBooks(books, { sort: '-num_highlights', limit: 9 }).map((b) => b.book.title)[0]).toBe('Beta')
	})

	it('keeps only books with a matching highlight, counting just the matches', () => {
		const out = selectBooks(books, { sort: '-updated', limit: 9 }, test('text:newer'))
		expect(out.map((b) => [b.book.title, b.matches.length])).toEqual([['Beta', 1]])
	})
})

describe('isSupported', () => {
	it('allows only the list format without grouping', () => {
		expect(isSupported({ format: 'list', group: '' })).toBe(true)
		expect(isSupported({ format: 'table', group: '' })).toBe(false)
		expect(isSupported({ format: 'list', group: 'book' })).toBe(false)
	})
})

describe('messages', () => {
	it('echoes the filter in empty results and treats no review as empty', () => {
		expect(emptyText('highlights', 'tag:x')).toBe('No highlights match. Filter: tag:x')
		expect(emptyText('books', '')).toBe('No books match.')
		expect(emptyText('review', 'tag:x')).toBe('No review available.')
		expect(describeFailure(new RwError('not-found', 'Not found.'))).toEqual({ status: 'No review available.', clear: true })
		expect(describeFailure(new Error('boom'))).toEqual({ status: 'boom', clear: false })
	})
})
