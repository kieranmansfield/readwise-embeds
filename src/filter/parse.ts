import { checkTerm, nearestField, type Schema } from './schema'
import { FilterError, tokenize, type Token } from './tokenize'

export type Node =
	| { type: 'and' | 'or'; left: Node; right: Node }
	| { type: 'not'; node: Node }
	| { type: 'term'; field: string; op: string; value: string }

const TERM = /^([a-z]+)(?:__([a-z]+))?:(.*)$/i
const KEYWORDS = ['AND', 'OR', 'NOT']

const isKeyword = (t: Token | undefined, word?: string) => !!t && t.kind === 'word' && !t.quoted && (word ? t.text === word : KEYWORDS.includes(t.text))
const isTerm = (t: Token) => t.kind === 'word' && !t.plain && TERM.test(t.text)

/** Parses a filter string into an AST. Throws FilterError with the offending position. */
export function parseFilter<C>(src: string, schema: Schema<C>): Node {
	const tokens = tokenize(src)
	let i = 0
	const peek = () => tokens[i] as Token | undefined
	const next = () => tokens[i++]

	/** The field named by a term word, or a FilterError naming the nearest known field. */
	function fieldOf(t: Token, name: string): string {
		const field = name.toLowerCase()
		if (field in schema.fields) return field
		const near = nearestField(schema, field)
		throw new FilterError(`Unknown field "${field}"${near ? `. Did you mean "${near}"?` : ''}`, t.pos)
	}

	// Unquoted values may span words (`author:Le Guin`) up to a keyword, ")" or the next term.
	function value(t: Token, first: string): string {
		let v = first
		for (let n = peek(); !t.quoted && n && n.kind === 'word' && !isKeyword(n) && !isTerm(n); n = peek()) v += ` ${next().text}`
		return v.trim()
	}

	function term(t: Token): Node {
		const m = TERM.exec(t.text)
		if (!isTerm(t) || !m || isKeyword(t)) throw new FilterError(`Expected field:value, found "${t.text}"`, t.pos)
		const field = fieldOf(t, m[1])
		const v = value(t, m[3])
		if (!v) throw new FilterError(`Expected a value after "${t.text}"`, t.pos)
		const op = (m[2] ?? '').toLowerCase()
		const problem = checkTerm(schema, field, op, v)
		if (problem) throw new FilterError(problem, t.pos)
		return { type: 'term', field, op, value: v }
	}

	function unary(): Node {
		const t = next() as Token | undefined
		if (!t) throw new FilterError('Unexpected end of filter', src.length)
		if (t.kind === ')') throw new FilterError('Unexpected ")"', t.pos)
		if (isKeyword(t, 'NOT')) return { type: 'not', node: unary() }
		if (t.kind === '(') {
			const inner = or()
			if (next()?.kind !== ')') throw new FilterError('Expected ")"', src.length)
			return inner
		}
		return term(t)
	}

	function and(): Node {
		let left = unary()
		for (let n = peek(); n && n.kind !== ')' && !isKeyword(n, 'OR'); n = peek()) {
			if (isKeyword(n, 'AND')) next()
			left = { type: 'and', left, right: unary() }
		}
		return left
	}

	function or(): Node {
		let left = and()
		while (isKeyword(peek(), 'OR')) {
			next()
			left = { type: 'or', left, right: and() }
		}
		return left
	}

	const root = or()
	const rest = peek()
	if (rest) throw new FilterError(`Unexpected "${rest.text}"`, rest.pos)
	return root
}
