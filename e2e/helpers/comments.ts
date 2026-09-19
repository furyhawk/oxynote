import { expect, type Locator, type Page } from "@playwright/test"
import { contentEditor, openBlockMenu, selectionSettled } from "./editor"
import { t } from "./i18n"

// commentPopover is the floating comment-thread panel. It is rendered
// inside the editor container rather than teleported, and it carries no
// dialog role.
export function commentPopover(page: Page): Locator {
	return page.locator(".content-editor div.z-popover")
}

// paneCommentPopover is the same panel found through the pane it belongs
// to, for a test that drives the draft's diff view, where a second
// renderer owns the popover.
export function paneCommentPopover(pane: Locator): Locator {
	return pane.locator("div.z-popover")
}

// commentComposer is the tiptap instance inside the popover that new
// comment text is typed into. Saved comment bodies are read-only tiptap
// instances in the same popover, so the editable one is the composer.
export function commentComposer(page: Page): Locator {
	return commentPopover(page).locator('.ProseMirror[contenteditable="true"]')
}

// addComment selects the whole page body and files a comment on it
// through the bubble menu, leaving the thread popover open. Asserts the
// comment was saved: the highlight mark only trades its pending id for
// a real one once the server has answered.
export async function addComment(page: Page, text: string): Promise<void> {
	await contentEditor(page).click()
	await page.keyboard.press("ControlOrMeta+A")

	// the bubble menu mounts hidden and only gets data-visible once its
	// positioning has settled, so the attribute gates the click
	await page
		.locator(".content-editor [data-visible]")
		.getByRole("button", { name: t("editor.bubble-menu.comment-label") })
		.click()

	await commentComposer(page).click()
	await page.keyboard.type(text)
	await commentPopover(page)
		.getByRole("button", {
			name: t("editor.comment-thread.comment-button"),
			exact: true,
		})
		.click()

	await expect(
		contentEditor(page).locator(
			'[data-comment-id]:not([data-comment-id^="pending-"])',
		),
	).toBeVisible()
}

// commentOnSelection files a comment on the text already selected in the
// pane's editor and returns the id the server gave it. The popover is
// left open.
export async function commentOnSelection(
	page: Page,
	pane: Locator,
	text: string,
): Promise<string> {
	await pane
		.locator("[data-visible]")
		.getByRole("button", { name: t("editor.bubble-menu.comment-label") })
		.click()
	await submitNewComment(page, pane, text)

	return savedCommentId(pane, "[data-comment-id]")
}

// commentOnBlock files a comment on a whole block through its block
// handle and returns the id the server gave it. The popover is left open.
export async function commentOnBlock(
	page: Page,
	pane: Locator,
	block: Locator,
	text: string,
): Promise<string> {
	await openBlockMenu(page, pane, block)
	await page
		.getByRole("menuitem", {
			name: t("editor.drag-handle.options.add-node-comment"),
		})
		.click()
	await submitNewComment(page, pane, text)

	// the commented node and the highlight drawn over it both carry the
	// id, so the highlight alone is read
	return savedCommentId(pane, ".node-comment-overlay[data-node-comment-id]")
}

// openTextComment clicks a text comment's highlight to open its thread.
// The thread opens on click and reads the editor's selection, which the
// editor takes from the browser's caret only once the selectionchange
// event has fired. A human click is slow enough for that; a synthetic
// one is not, so the button is held down until the editor has caught up.
// A highlight over changed text is several spans, so the one to click
// is named by the text it covers.
export async function openTextComment(
	page: Page,
	pane: Locator,
	id: string,
	text: string,
): Promise<void> {
	const span = pane.locator(`[data-comment-id="${id}"]`, { hasText: text })

	await span.hover()
	await page.mouse.down()
	await selectionSettled(span)
	await page.mouse.up()
}

// commentedText is what a text comment highlights in the pane's editor,
// read across every span the highlight is split into. A highlight over
// changed text is split wherever the diff marks change.
export function commentedText(pane: Locator, id: string): Promise<string> {
	return pane
		.locator(`[data-comment-id="${id}"]`)
		.evaluateAll((spans) => spans.map((span) => span.textContent).join(""))
}

async function submitNewComment(
	page: Page,
	pane: Locator,
	text: string,
): Promise<void> {
	await paneCommentPopover(pane)
		.locator('.ProseMirror[contenteditable="true"]')
		.click()
	await page.keyboard.type(text)
	await paneCommentPopover(pane)
		.getByRole("button", {
			name: t("editor.comment-thread.comment-button"),
			exact: true,
		})
		.click()
}

// savedCommentId waits until the pending highlight has been traded for
// the server's id — the proof the comment was saved — and returns that
// id. A highlight can be several elements; they all carry the one id.
async function savedCommentId(
	pane: Locator,
	selector: string,
): Promise<string> {
	await expect(pane.locator('[data-comment-id^="pending-"]')).toHaveCount(0)
	await expect(pane.locator('[data-node-comment-id^="pending-"]')).toHaveCount(
		0,
	)

	const ids = await pane
		.locator(selector)
		.evaluateAll((elements) => [
			...new Set(
				elements.map(
					(el) =>
						el.getAttribute("data-comment-id") ??
						el.getAttribute("data-node-comment-id"),
				),
			),
		])
	expect(ids).toHaveLength(1)

	return ids[0] ?? ""
}
