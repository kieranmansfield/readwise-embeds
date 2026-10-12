import type { Node } from './parse'

type Term = Extract<Node, { type: 'term' }>

const LOCATIONS = ['new', 'later', 'shortlist', 'archive', 'feed']
/** Where documents live apart from the feed, which can hold thousands of items nobody asked for. */
const LIBRARY = ['new', 'later', 'shortlist', 'archive']

function walk(n: Node): Term[] {
	if (n.type === 'term') return [n]
	return n.type === 'not' ? walk(n.node) : [...walk(n.left), ...walk(n.right)]
}

/** The terms joined only by AND at the top level; anything under OR or NOT is left out. */
function topLevel(n: Node): Term[] {
	if (n.type === 'term') return [n]
	return n.type === 'and' ? [...topLevel(n.left), ...topLevel(n.right)] : []
}

const plain = (t: Term) => t.op === '' || t.op === 'exact'

/** The API value a plain positive term names exactly (`in:inbox` is `new`), or undefined. */
function pushed(terms: Term[], fields: string[], known: string[], alias: Record<string, string> = {}): string | undefined {
	for (const t of terms) {
		const v = t.value.toLowerCase()
		const api = alias[v] ?? v
		if (fields.includes(t.field) && plain(t) && known.includes(api)) return api
	}
	return undefined
}

/** True when the query could want feed items, so the feed must not be left out of the download. */
function mentionsFeed(ast: Node): boolean {
	return walk(ast).some((t) => t.field === 'feed' || (['in', 'location'].includes(t.field) && t.value.toLowerCase().includes('feed')))
}

/**
 * Which locations answer a query. Only a plain positive top-level `in:` term narrows it, so it can never drop a
 * correct result; the full filter still runs afterwards. With none, the library locations are used and the feed
 * is left out unless the query mentions it.
 */
export function planLocations(ast: Node | undefined): string[] {
	const terms = ast ? topLevel(ast) : []
	const location = pushed(terms, ['in', 'location'], LOCATIONS, { inbox: 'new' }) ?? (terms.some((t) => t.field === 'feed' && plain(t) && t.value.toLowerCase() === 'true') ? 'feed' : undefined)
	if (location) return [location]
	return ast && mentionsFeed(ast) ? LOCATIONS : LIBRARY
}

/** Highlight and note documents hang off a parent and are hidden unless the filter asks for them by category. */
export function wantsHighlights(ast: Node | undefined): boolean {
	return !!ast && walk(ast).some((t) => ['category', 'type'].includes(t.field) && /highlight|note/i.test(t.value))
}
