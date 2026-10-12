import { describe, expect, it } from 'vitest'
import type { RwBook, RwHighlight } from '../api/readwise'
import { parseDate } from './dates'
import { blockQuery, compileQuery } from './query'
import { readwiseSchema } from './fields'

const NOW = new Date(2026, 5, 15).getTime()
const book: RwBook = { user_book_id: 1, title: 'The Dispossessed', author: 'Ursula K. Le Guin', category: 'books', source: 'kindle', book_tags: [{ name: 'scifi' }], highlights: [] }
const hl = (o: Partial<RwHighlight> = {}): RwHighlight => ({ id: 1, text: 'Anarres had no walls', ...o })

function run(src: string, h: Partial<RwHighlight> = {}) {
	const q = compileQuery(src, readwiseSchema, () => NOW)
	if ('error' in q) throw new Error(q.error)
	return q.test({ book, h: hl(h) })
}
const err = (src: string) => {
	const q = compileQuery(src, readwiseSchema, () => NOW)
	return 'error' in q ? q : undefined
}

describe('filter evaluation', () => {
	it('matches the plan example', () => {
		const src = 'category:books AND author:Le Guin AND has:note AND highlighted__after:"3 months ago"'
		expect(run(src, { note: 'x', highlighted_at: new Date(2026, 4, 1).toISOString() })).toBe(true)
		expect(run(src, { note: 'x', highlighted_at: new Date(2025, 0, 1).toISOString() })).toBe(false)
		expect(run(src, { highlighted_at: new Date(2026, 4, 1).toISOString() })).toBe(false)
	})

	it('supports implicit AND, OR, NOT and parentheses', () => {
		expect(run('title:dispossessed text:walls')).toBe(true)
		expect(run('text:nope OR (author:guin AND NOT tag:fantasy)')).toBe(true)
		expect(run('NOT (tag:scifi)')).toBe(false)
	})

	it('handles string operators and tags from book and highlight', () => {
		expect(run('author__exact:"ursula k. le guin"')).toBe(true)
		expect(run('author__exact:guin')).toBe(false)
		expect(run('title__not:dispossessed')).toBe(false)
		expect(run('tag:philosophy', { tags: [{ name: 'Philosophy' }] })).toBe(true)
		expect(run('tag__exact:sci')).toBe(false)
	})

	it('handles flags and has', () => {
		expect(run('favorite:true', { is_favorite: true })).toBe(true)
		expect(run('favorite__not:true')).toBe(true)
		expect(run('discarded:false')).toBe(true)
		expect(run('has:tags')).toBe(false)
		expect(run('has__not:note')).toBe(true)
	})

	it('compares dates and reads the clock at evaluation', () => {
		const h = { highlighted_at: new Date(2026, 5, 10).toISOString(), updated_at: new Date(2026, 0, 1).toISOString() }
		expect(run('highlighted__after:2026-06-01', h)).toBe(true)
		expect(run('highlighted__before:"8 days ago"', h)).toBe(false)
		expect(run('highlighted__before:"3 days"', h)).toBe(true)
		expect(run('updated__before:2026-02-01', h)).toBe(true)
		expect(run('updated__after:2026-02-01')).toBe(false)
	})
})

describe('filter errors', () => {
	it.each([
		['', 'Unexpected end'],
		['author:', 'Expected a value'],
		['(tag:a', 'Expected ")"'],
		['tag:a)', 'Unexpected ")"'],
		['tag:a AND', 'Unexpected end'],
		['hello', 'Expected field:value'],
		['text:"open', 'Unterminated quote'],
		['highlighted:2026-01-01', 'is not valid here'],
		['highlighted__after:soon', 'is not a date'],
		['favorite:maybe', 'must be true or false'],
		['has:wings', 'has must be one of'],
		['colour:red', 'Unknown field "colour"'],
	])('rejects %j', (src, message) => {
		expect(err(src)?.error).toContain(message)
	})

	it('suggests the nearest field and reports the position', () => {
		expect(err('tag:a AND autor:x')).toEqual({ error: 'Unknown field "autor". Did you mean "author"?', pos: 10 })
		expect(err('zzzz:x')?.error).toBe('Unknown field "zzzz"')
	})
})

describe('parseDate', () => {
	it('rejects impossible and unknown dates, shifts units', () => {
		expect(parseDate('2026-02-30', NOW)).toBeNull()
		expect(parseDate('soon', NOW)).toBeNull()
		expect(parseDate('1 week ago', NOW)).toBe(new Date(2026, 5, 8).getTime())
		expect(parseDate('1 year', NOW)).toBe(new Date(2025, 5, 15).getTime())
		expect(parseDate('2026-03-20', NOW)).toBe(new Date(2026, 2, 20).getTime())
	})
})

describe('blockQuery', () => {
	it('gives nothing for a blank search, and keeps the error when it fails', () => {
		expect(blockQuery('', readwiseSchema)).toEqual({})
		expect(blockQuery('tag:x', readwiseSchema).test).toBeTypeOf('function')
		expect(blockQuery('nope', readwiseSchema).test).toBeUndefined()
		expect(blockQuery('nope', readwiseSchema).query).toHaveProperty('error')
	})
})
