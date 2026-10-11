export interface ReadwiseEmbedsSettings {
	/** Name of the SecretStorage entry holding the Readwise token. */
	readwiseTokenSecret: string
	refreshMinutes: number
}

export const DEFAULT_SETTINGS: ReadwiseEmbedsSettings = {
	readwiseTokenSecret: '',
	refreshMinutes: 60,
}

export const MIN_REFRESH_MINUTES = 5

/** A typo must not exhaust the rate limit: anything below the minimum or not a number falls back. */
export function validRefreshMinutes(raw: string): number | null {
	const n = Number(raw)
	return Number.isFinite(n) && n >= MIN_REFRESH_MINUTES ? Math.round(n) : null
}
