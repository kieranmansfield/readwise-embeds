import { describe, expect, it } from 'vitest'
import { parseCache, serializeCache } from './persist'

describe('cache file', () => {
	it('round-trips and rejects anything else', () => {
		const snap = { fetchedAt: 7, books: [] }
		expect(parseCache(serializeCache(snap))).toEqual(snap)
		for (const bad of ['', 'nope', '{}', '{"v":2,"fetchedAt":1,"books":[]}', '{"v":1,"fetchedAt":"x","books":[]}', '{"v":1,"fetchedAt":1,"books":{}}']) expect(parseCache(bad)).toBeNull()
	})
})
