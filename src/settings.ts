export interface ReadwiseEmbedsSettings {
	/** Name of the SecretStorage entry holding the Readwise token. */
	readwiseTokenSecret: string
}

export const DEFAULT_SETTINGS: ReadwiseEmbedsSettings = {
	readwiseTokenSecret: '',
}
