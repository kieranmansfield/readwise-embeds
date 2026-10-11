import { FIELDS, HAS, type Ctx } from './fields'
import { parseDate } from './dates'
import type { Node } from './parse'

export type Predicate = (c: Ctx) => boolean

type TermNode = Extract<Node, { type: 'term' }>

function stringTest({ field, op, value }: TermNode): Predicate {
	const def = FIELDS[field]
	if (def.kind !== 'string') throw new Error('not a string field')
	const want = value.toLowerCase()
	const match = op === 'exact' ? (s: string) => s === want : (s: string) => s.includes(want)
	const hit: Predicate = (c) => def.get(c).some((v) => match(v.toLowerCase()))
	return op === 'not' ? (c) => !hit(c) : hit
}

function dateTest({ field, op, value }: TermNode, now: () => number): Predicate {
	const def = FIELDS[field]
	if (def.kind !== 'date') throw new Error('not a date field')
	return (c) => {
		const ts = def.get(c)
		// Relative dates read the clock each evaluation, not when the block was parsed.
		const target = parseDate(value, now())
		return ts !== undefined && target !== null && (op === 'before' ? ts < target : ts > target)
	}
}

function flagTest({ field, op, value }: TermNode): Predicate {
	const def = FIELDS[field]
	const hit: Predicate = def.kind === 'bool' ? (c) => def.get(c) === (value.toLowerCase() === 'true') : HAS[value]
	return op === 'not' ? (c) => !hit(c) : hit
}

function termTest(node: TermNode, now: () => number): Predicate {
	const { kind } = FIELDS[node.field]
	if (kind === 'string') return stringTest(node)
	return kind === 'date' ? dateTest(node, now) : flagTest(node)
}

/** Turns an AST into a predicate over one highlight and its book. */
export function compile(node: Node, now: () => number): Predicate {
	switch (node.type) {
		case 'term':
			return termTest(node, now)
		case 'not': {
			const inner = compile(node.node, now)
			return (c) => !inner(c)
		}
		default: {
			const l = compile(node.left, now)
			const r = compile(node.right, now)
			return node.type === 'and' ? (c) => l(c) && r(c) : (c) => l(c) || r(c)
		}
	}
}
