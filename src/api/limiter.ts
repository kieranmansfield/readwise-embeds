export interface LimiterDeps {
	capacity: number
	perMinute: number
	now?: () => number
	sleep?: (ms: number) => Promise<void>
}

/**
 * Token bucket: bursts up to `capacity`, then one request per 60/perMinute seconds. Callers queue in order
 * instead of failing. Reader's list endpoint allows 20 a minute, shared by every block.
 */
export function createLimiter({ capacity, perMinute, now = () => Date.now(), sleep = (ms) => new Promise((r) => window.setTimeout(r, ms)) }: LimiterDeps) {
	let tokens = capacity
	let last = now()
	let queue: Promise<void> = Promise.resolve()

	async function take(): Promise<void> {
		for (;;) {
			const t = now()
			tokens = Math.min(capacity, tokens + ((t - last) * perMinute) / 60_000)
			last = t
			if (tokens >= 1) {
				tokens -= 1
				return
			}
			await sleep(Math.ceil(((1 - tokens) * 60_000) / perMinute))
		}
	}

	return { acquire: () => (queue = queue.then(take)) }
}
