const SHIFT: Record<string, (d: Date, n: number) => void> = {
	hour: (d, n) => d.setHours(d.getHours() - n),
	day: (d, n) => d.setDate(d.getDate() - n),
	week: (d, n) => d.setDate(d.getDate() - 7 * n),
	month: (d, n) => d.setMonth(d.getMonth() - n),
	year: (d, n) => d.setFullYear(d.getFullYear() - n),
}

function absolute(y: number, m: number, d: number): number | null {
	const date = new Date(y, m - 1, d)
	return date.getMonth() === m - 1 && date.getDate() === d ? date.getTime() : null
}

/** `2026-03-20` (local midnight) or relative `3 months ago` / `8 days`, as epoch ms; null if neither. */
export function parseDate(value: string, now: number): number | null {
	const abs = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
	if (abs) return absolute(+abs[1], +abs[2], +abs[3])
	const rel = /^(\d+)\s*(hour|day|week|month|year)s?(?:\s+ago)?$/i.exec(value)
	if (!rel) return null
	const d = new Date(now)
	SHIFT[rel[2].toLowerCase()](d, +rel[1])
	return d.getTime()
}
