/** Named filters for `preset:` in a `reader` block. `search:` narrows a preset further. */
export const PRESETS: Record<string, string> = {
	inbox: 'in:inbox',
	later: 'in:later',
	shortlist: 'in:shortlist',
	archive: 'in:archive',
	feed: 'in:feed',
	recent: 'saved__after:"7 days ago"',
	unread: 'unseen:true AND (in:inbox OR in:later OR in:shortlist)',
	'long-reads': 'minutes__gte:20 AND (in:inbox OR in:later OR in:shortlist)',
}

/** The filter a block runs: its preset, then its own `search` inside parentheses so an OR cannot escape the preset. */
export function effectiveSearch(preset: string, search: string): string {
	const base = PRESETS[preset]
	if (!base) return search
	return search ? `${base} AND (${search})` : base
}
