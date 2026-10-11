import type { BlockParams } from './block/params'

export interface ReadwiseEmbedsSettings {
	/** Name of the SecretStorage entry holding the Readwise token. */
	readwiseTokenSecret: string
	refreshMinutes: number
	defaultFormat: BlockParams['format']
	defaultLimit: number
	/** Cover images load from the original sites, not readwise.io, so they are opt-in. */
	showCovers: boolean
	/** Keep the downloaded library in the plugin folder so restarts skip the full download. */
	persistCache: boolean
}

export const DEFAULT_SETTINGS: ReadwiseEmbedsSettings = {
	readwiseTokenSecret: '',
	refreshMinutes: 60,
	defaultFormat: 'list',
	defaultLimit: 50,
	showCovers: false,
	persistCache: true,
}

export const MIN_REFRESH_MINUTES = 5

/** A typo must not exhaust the rate limit: anything below the minimum or not a number falls back. */
export function validRefreshMinutes(raw: string): number | null {
	const n = Number(raw)
	return Number.isFinite(n) && n >= MIN_REFRESH_MINUTES ? Math.round(n) : null
}

export function validLimit(raw: string): number | null {
	const n = Number(raw)
	return Number.isInteger(n) && n >= 1 && n <= 500 ? n : null
}

/** The one stored secret whose name mentions Readwise, so an existing token is reused; none if there are zero or several. */
export function findReadwiseSecret(ids: string[]): string | undefined {
	const matches = ids.filter((id) => id.toLowerCase().includes('readwise'))
	return matches.length === 1 ? matches[0] : undefined
}
