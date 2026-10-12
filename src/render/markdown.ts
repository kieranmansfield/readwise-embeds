import { MarkdownRenderer, type App, type Component } from 'obsidian'

/** Images in text load from other sites, so they are dropped unless the user allowed remote images. */
const withoutImages = (md: string) => md.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/<img\b[^>]*>/gi, '')

/** Renders the markdown in every card element marked `data-md`; its text is the source. */
export function renderMarkdown(el: HTMLElement, app: App, owner: Component, images: boolean) {
	el.querySelectorAll<HTMLElement>('.rw-card [data-md]').forEach((target) => {
		const md = target.textContent ?? ''
		target.empty()
		target.addClass('rw-md')
		void MarkdownRenderer.render(app, images ? md : withoutImages(md), target, '', owner)
	})
}
