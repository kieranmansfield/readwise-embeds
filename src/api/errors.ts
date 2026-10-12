export type RwErrorKind = 'no-token' | 'auth' | 'not-found' | 'rate-limit' | 'server'

export class RwError extends Error {
	constructor(
		readonly kind: RwErrorKind,
		message: string,
		/** Seconds to wait, from `Retry-After`, for `rate-limit`. */
		readonly retryAfter = 60
	) {
		super(message)
	}
}
