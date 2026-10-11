import { requestUrl } from 'obsidian'

/** Seam over the network so the API client can be tested without Obsidian. `json` is undefined for empty or 204 responses. */
export interface HttpPort {
	request(req: { method: string; url: string; headers: Record<string, string> }): Promise<{ status: number; json: unknown; retryAfter?: number }>
}

export const obsidianHttp: HttpPort = {
	async request(req) {
		const res = await requestUrl({ ...req, throw: false })
		const retryAfter = Number(res.headers['retry-after'])
		return { status: res.status, json: res.status === 204 || !res.text ? undefined : res.json, retryAfter: retryAfter || undefined }
	},
}
