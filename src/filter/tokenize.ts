export class FilterError extends Error {
	constructor(
		message: string,
		/** Character offset into the filter string. */
		readonly pos: number
	) {
		super(message)
	}
}

export interface Token {
	kind: '(' | ')' | 'word'
	text: string
	pos: number
	/** The word contained a quoted section. */
	quoted: boolean
	/** The word started with a quote, so it is plain text and never a `field:value` term. */
	plain: boolean
}

function readWord(src: string, start: number): { token: Token; end: number } {
	let i = start
	let text = ''
	let quoted = false
	while (i < src.length && !/[\s()]/.test(src[i])) {
		if (src[i] !== '"') {
			text += src[i++]
			continue
		}
		const close = src.indexOf('"', i + 1)
		if (close < 0) throw new FilterError('Unterminated quote', i)
		text += src.slice(i + 1, close)
		quoted = true
		i = close + 1
	}
	return { token: { kind: 'word', text, pos: start, quoted, plain: src[start] === '"' }, end: i }
}

/** Splits a filter into parentheses and words; a quoted section may sit inside a word (`field:"a b"`). */
export function tokenize(src: string): Token[] {
	const out: Token[] = []
	let i = 0
	while (i < src.length) {
		const c = src[i]
		if (/\s/.test(c)) i++
		else if (c === '(' || c === ')') out.push({ kind: c, text: c, pos: i++, quoted: false, plain: false })
		else {
			const { token, end } = readWord(src, i)
			out.push(token)
			i = end
		}
	}
	return out
}
