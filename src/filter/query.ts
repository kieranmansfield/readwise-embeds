import { compile, type Predicate } from './evaluate'
import { parseFilter, type Node } from './parse'
import type { Schema } from './schema'
import { FilterError } from './tokenize'

export type Query<C> = { test: Predicate<C>; ast: Node } | { error: string; pos: number }

/** Parses and compiles a filter. Errors come back as values so a block can show them inline. */
export function compileQuery<C>(src: string, schema: Schema<C>, now: () => number = () => Date.now()): Query<C> {
	try {
		const ast = parseFilter(src, schema)
		return { test: compile(ast, schema, now), ast }
	} catch (e) {
		if (e instanceof FilterError) return { error: e.message, pos: e.pos }
		throw e
	}
}

/** The block's query and, when it compiled, its predicate and AST; nothing for a blank search. */
export function blockQuery<C>(search: string, schema: Schema<C>): { query?: Query<C>; test?: Predicate<C>; ast?: Node } {
	if (!search) return {}
	const query = compileQuery(search, schema)
	return 'test' in query ? { query, test: query.test, ast: query.ast } : { query }
}
