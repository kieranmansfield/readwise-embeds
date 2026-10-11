import { compile, type Predicate } from './evaluate'
import { parseFilter } from './parse'
import { FilterError } from './tokenize'

export type Query = { test: Predicate } | { error: string; pos: number }

/** Parses and compiles a filter. Errors come back as values so a block can show them inline. */
export function compileQuery(src: string, now: () => number = () => Date.now()): Query {
	try {
		return { test: compile(parseFilter(src), now) }
	} catch (e) {
		if (e instanceof FilterError) return { error: e.message, pos: e.pos }
		throw e
	}
}

/** The block's query and, when it compiled, its predicate; nothing for a blank search. */
export function blockQuery(search: string): { query?: Query; test?: Predicate } {
	if (!search) return {}
	const query = compileQuery(search)
	return { query, test: 'test' in query ? query.test : undefined }
}
