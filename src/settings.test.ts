import { describe, expect, it } from 'vitest'
import { findReadwiseSecret } from './settings'

describe('findReadwiseSecret', () => {
	it('returns the single Readwise secret, and nothing when absent or ambiguous', () => {
		expect(findReadwiseSecret(['openai-key', 'readwise-token'])).toBe('readwise-token')
		expect(findReadwiseSecret(['openai-key'])).toBeUndefined()
		expect(findReadwiseSecret(['readwise-token', 'my-readwise-key'])).toBeUndefined()
	})
})
