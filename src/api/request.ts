import { RwError } from './errors'
import type { HttpPort } from './http'

/** Authenticated GET against `base`; maps statuses to typed errors. `beforeRequest` is where a rate limiter plugs in. */
export function createCaller(http: HttpPort, getToken: () => string | null, base: string, beforeRequest: () => Promise<void> = () => Promise.resolve()) {
	return async (path: string): Promise<unknown> => {
		const token = getToken()
		if (!token) throw new RwError('no-token', 'Readwise token is not set (Settings → Readwise embeds).')
		await beforeRequest()
		const res = await http.request({ method: 'GET', url: base + path, headers: { Authorization: `Token ${token}` } })
		if (res.status === 401 || res.status === 403) throw new RwError('auth', 'Readwise rejected the token.')
		if (res.status === 404) throw new RwError('not-found', 'Not found.')
		if (res.status === 429) throw new RwError('rate-limit', 'Readwise rate limit reached.', res.retryAfter)
		if (res.status < 200 || res.status >= 300) throw new RwError('server', `Readwise GET ${path} failed (${res.status}).`)
		return res.json
	}
}
