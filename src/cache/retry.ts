import { RwError } from '../api/errors'

export type StoreEvent = { type: 'wait'; seconds: number } | { type: 'progress'; count: number }

/** Runs `fn`; on a 429 announces the wait, sleeps `Retry-After`, and tries once more. Other errors pass through. */
export async function withRateLimitRetry<T>(
	fn: (onPage: (count: number) => void) => Promise<T>,
	emit: (e: StoreEvent) => void,
	sleep: (ms: number) => Promise<void>
): Promise<T> {
	const onPage = (count: number) => emit({ type: 'progress', count })
	try {
		return await fn(onPage)
	} catch (e) {
		if (!(e instanceof RwError) || e.kind !== 'rate-limit') throw e
		emit({ type: 'wait', seconds: e.retryAfter })
		await sleep(e.retryAfter * 1000)
		return fn(onPage)
	}
}
