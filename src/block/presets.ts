/** Named filters for `preset:` in a `reader` block. `search:` narrows a preset further. */
export const PRESETS: Record<string, string> = {
	inbox: 'in:inbox',
	later: 'in:later',
	shortlist: 'in:shortlist',
	archive: 'in:archive',
	feed: 'in:feed',
	recent: 'saved__after:"7 days ago"',
	unread: 'unseen:true AND (in:inbox OR in:later OR in:shortlist)',
	daily: 'NOT category:rss',
	'long-reads': 'minutes__gte:20 AND (in:inbox OR in:later OR in:shortlist)',
}

/** `field` bounds for one local day, so `date: 2026-10-12` means items saved (or highlighted) that day. */
function dayFilter(date: string, field: string): string {
	const [y, m, d] = date.split('-').map(Number)
	const next = new Date(y, m - 1, d + 1)
	const pad = (n: number) => String(n).padStart(2, '0')
	return `${field}__after:${date} AND ${field}__before:${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`
}

/**
 * The filter a block runs: its preset, then a `date` day, then its own `search`, each inside parentheses where
 * needed so an OR cannot escape the rest.
 */
export function effectiveSearch(preset: string, search: string, date = '', field = 'saved'): string {
	const parts = [PRESETS[preset], date && dayFilter(date, field), search && (PRESETS[preset] || date ? `(${search})` : search)]
	return parts.filter(Boolean).join(' AND ')
}
