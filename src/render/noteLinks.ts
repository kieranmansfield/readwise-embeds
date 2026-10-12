import type { App, TFile } from 'obsidian'

/** Notes by the `property` in their frontmatter (the official Readwise plugin sets `id` to the book's id). */
// fallow-ignore-next-line complexity
function notesById(app: App, property: string): Map<string, TFile> {
	const byId = new Map<string, TFile>()
	for (const file of app.vault.getMarkdownFiles()) {
		const id: unknown = app.metadataCache.getFileCache(file)?.frontmatter?.[property]
		if ((typeof id === 'string' || typeof id === 'number') && !byId.has(String(id))) byId.set(String(id), file)
	}
	return byId
}

/** Adds a link to the matching note after every source line (`data-book-id`) inside `el`. */
export function linkNotes(el: HTMLElement, app: App, property: string) {
	const sources = el.querySelectorAll<HTMLElement>('[data-book-id]')
	if (!sources.length) return
	const notes = notesById(app, property)
	sources.forEach((src) => {
		const file = notes.get(src.dataset.bookId ?? '')
		if (!file) return
		const link = src.createEl('a', { cls: 'internal-link rw-note-link', text: 'note', attr: { 'data-href': file.path, href: file.path, 'aria-label': `Open ${file.basename}` } })
		link.onclick = (e) => {
			e.preventDefault()
			void app.workspace.openLinkText(file.path, '', e.ctrlKey || e.metaKey)
		}
	})
}
