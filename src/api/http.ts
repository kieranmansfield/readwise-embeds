import { requestUrl } from 'obsidian'

/** Seam over the network so the API client can be tested without Obsidian. `json` is undefined for empty or 204 responses. */
export interface HttpPort {
	request(req: { method: string; url: string; headers: Record<string, string>; body?: string }): Promise<{ status: number; json: unknown }>
}

export const obsidianHttp: HttpPort = {
	async request(req) {
		const res = await requestUrl({ ...req, throw: false })
		return { status: res.status, json: res.status === 204 || !res.text ? undefined : res.json }
	},
}
