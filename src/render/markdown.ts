import { MarkdownRenderer, type App, type Component } from 'obsidian'

/** Images in text load from other sites, so they are dropped unless the user allowed remote images. */
const withoutImages = (md: string) => md.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/<img\b[^>]*>/gi, '')

/** A `#word` is escaped so highlight text is not turned into vault tags (`# ` headings are left alone). */
const withoutTags = (md: string) => md.replace(/(^|\s)#(?=[^\s#])/g, '$1\\#')

/** Renders the markdown in every card element marked `data-md`; its text is the source. */
export function renderMarkdown(el: HTMLElement, app: App, owner: Component, images: boolean) {
	el.querySelectorAll<HTMLElement>('.rw-card [data-md]').forEach((target) => {
		const md = target.textContent ?? ''
		target.empty()
		target.addClass('rw-md')
		void MarkdownRenderer.render(app, withoutTags(images ? md : withoutImages(md)), target, '', owner)
	})
}
