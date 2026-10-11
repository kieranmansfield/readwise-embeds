import { describe, expect, it } from 'vitest'
import type { RwBook } from '../api/readwise'
import { isSupported, selectRows } from './rows'

const books: RwBook[] = [
	{ user_book_id: 1, title: 'a', highlights: [{ id: 1, text: 'old', highlighted_at: '2024-01-01T00:00:00Z' }, { id: 2, text: 'gone', is_deleted: true }] },
	{ user_book_id: 2, title: 'b', highlights: [{ id: 3, text: 'new', highlighted_at: '2025-01-01T00:00:00Z' }] },
]

describe('selectRows', () => {
	it('sorts descending by default order, drops deleted, applies limit', () => {
		expect(selectRows(books, { sort: '-highlighted_at', limit: 5 }).map((r) => r.h.text)).toEqual(['new', 'old'])
		expect(selectRows(books, { sort: 'highlighted_at', limit: 1 }).map((r) => r.h.text)).toEqual(['old'])
	})
})

describe('isSupported', () => {
	it('rejects anything beyond the plain highlights list', () => {
		expect(isSupported({ view: 'highlights', search: '', format: 'list' })).toBe(true)
		expect(isSupported({ view: 'highlights', search: 'tag:x', format: 'list' })).toBe(false)
	})
})
