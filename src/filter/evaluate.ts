import { parseDate } from './dates'
import type { Node } from './parse'
import type { Def, Schema } from './schema'

export type Predicate<C> = (c: C) => boolean

type TermNode = Extract<Node, { type: 'term' }>

const negate = <C>(hit: Predicate<C>, op: string): Predicate<C> => (op === 'not' ? (c) => !hit(c) : hit)

function stringTest<C>({ op, value }: TermNode, def: Extract<Def<C>, { kind: 'string' }>): Predicate<C> {
	const want = value.toLowerCase()
	const match = op === 'exact' ? (s: string) => s === want : (s: string) => s.includes(want)
	return negate((c) => def.get(c).some((v) => match(v.toLowerCase())), op)
}

const COMPARE: Record<string, (a: number, b: number) => boolean> = {
	'': (a, b) => a === b,
	not: (a, b) => a === b,
	gt: (a, b) => a > b,
	gte: (a, b) => a >= b,
	lt: (a, b) => a < b,
	lte: (a, b) => a <= b,
}

function numberTest<C>({ op, value }: TermNode, def: Extract<Def<C>, { kind: 'number' }>): Predicate<C> {
	const n = Number(value)
	return negate((c) => {
		const v = def.get(c)
		return v !== undefined && COMPARE[op](v, n)
	}, op)
}

function dateTest<C>({ op, value }: TermNode, def: Extract<Def<C>, { kind: 'date' }>, now: () => number): Predicate<C> {
	return (c) => {
		const ts = def.get(c)
		// Relative dates read the clock each evaluation, not when the block was parsed.
		const target = parseDate(value, now())
		return ts !== undefined && target !== null && (op === 'before' ? ts < target : ts > target)
	}
}

function termTest<C>(node: TermNode, schema: Schema<C>, now: () => number): Predicate<C> {
	const def = schema.fields[node.field]
	switch (def.kind) {
		case 'string':
			return stringTest(node, def)
		case 'number':
			return numberTest(node, def)
		case 'date':
			return dateTest(node, def, now)
		case 'bool':
			return negate((c) => def.get(c) === (node.value.toLowerCase() === 'true'), node.op)
		case 'has':
			return negate(schema.has[node.value], node.op)
		case 'unsupported':
			throw new Error(`unsupported field ${node.field} reached evaluation`)
	}
}

/** Turns an AST into a predicate over whatever `schema` describes. */
export function compile<C>(node: Node, schema: Schema<C>, now: () => number): Predicate<C> {
	switch (node.type) {
		case 'term':
			return termTest(node, schema, now)
		case 'not': {
			const inner = compile(node.node, schema, now)
			return (c) => !inner(c)
		}
		default: {
			const l = compile(node.left, schema, now)
			const r = compile(node.right, schema, now)
			return node.type === 'and' ? (c) => l(c) && r(c) : (c) => l(c) || r(c)
		}
	}
}
