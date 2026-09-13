import type { Node as PMNode } from "@tiptap/pm/model"
import { MERMAID_BLOCK_NAME } from "./node-names"

// block types whose node view draws asynchronously after mounting.
const ASYNC_RENDER_BLOCK_NAMES: readonly string[] = [MERMAID_BLOCK_NAME]

// the uids of every asynchronously rendered block in a document, in
// document order
export function asyncRenderBlockUids(doc: PMNode): string[] {
	const uids: string[] = []

	doc.descendants((node) => {
		const uid: unknown = node.attrs.uid

		if (
			ASYNC_RENDER_BLOCK_NAMES.includes(node.type.name) &&
			typeof uid === "string"
		) {
			uids.push(uid)
		}
	})

	return uids
}
