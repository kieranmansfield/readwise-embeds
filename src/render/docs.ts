import type { RdDoc } from '../api/reader'
import type { ReaderParams } from '../block/readerParams'
import type { Predicate } from '../filter/evaluate'
import { sortLimit } from './rows'

const ms = (v: string | number | null | undefined) => (typeof v === 'number' ? v : Date.parse(v ?? '') || 0)

const DOC_KEYS: Record<string, (d: RdDoc) => string | number> = {
	saved_at: (d) => ms(d.saved_at),
	updated_at: (d) => ms(d.updated_at),
	published_date: (d) => ms(d.published_date),
	title: (d) => (d.title ?? '').toLowerCase(),
	author: (d) => (d.author ?? '').toLowerCase(),
	word_count: (d) => d.word_count ?? 0,
	reading_progress: (d) => d.reading_progress ?? 0,
}

/** Filters, sorts and truncates. Highlight and note documents (those with a parent) are dropped unless asked for. */
export function selectDocs(docs: RdDoc[], p: Pick<ReaderParams, 'sort' | 'limit'>, test?: Predicate<RdDoc>, keepHighlights = false): RdDoc[] {
	const own = keepHighlights ? docs : docs.filter((d) => !d.parent_id)
	return sortLimit(test ? own.filter(test) : own, p, DOC_KEYS)
}

function siteOf(d: RdDoc): string {
	if (d.site_name) return d.site_name
	try {
		return new URL(d.source_url ?? '').hostname
	} catch {
		return 'Other'
	}
}

export const docGroupKey = (group: ReaderParams['group']): ((d: RdDoc) => string) | undefined =>
	group === 'location' ? (d) => d.location ?? 'Other' : group === 'category' ? (d) => d.category ?? 'Other' : group === 'site' ? siteOf : undefined

export const emptyDocsText = (search: string) => `No documents match.${search ? ` Filter: ${search}` : ''}`

export const truncationNotice = (count: number) => `Showing the first ${count} documents. Narrow the filter, or raise the page cap in settings.`
