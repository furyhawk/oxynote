import { Schema } from "@tiptap/pm/model"
import { describe, it } from "vitest"
import { asyncRenderBlockUids } from "./async-render"
import { MERMAID_BLOCK_NAME } from "./node-names"
import { docBuilder } from "~/components/editor/test-helpers"

const schema = new Schema({
	nodes: {
		doc: { content: "block+" },
		[MERMAID_BLOCK_NAME]: {
			group: "block",
			content: "text*",
			attrs: { uid: { default: null } },
		},
		paragraph: {
			group: "block",
			content: "inline*",
			attrs: { uid: { default: null } },
		},
		text: { group: "inline" },
	},
})

const docOf = docBuilder(schema)

function mermaid(uid: string | null) {
	return schema.nodes[MERMAID_BLOCK_NAME].create({ uid })
}

function paragraph(uid: string) {
	return schema.nodes.paragraph.create({ uid }, schema.text("text"))
}

describe("asyncRenderBlockUids", () => {
	it("lists the asynchronously rendered blocks in document order", ({
		expect,
	}) => {
		const docNode = docOf(
			paragraph("p1"),
			mermaid("first"),
			paragraph("p2"),
			mermaid("second"),
		)

		expect(asyncRenderBlockUids(docNode)).toEqual(["first", "second"])
	})

	it("skips a block without a uid", ({ expect }) => {
		const docNode = docOf(mermaid(null), paragraph("p1"))

		expect(asyncRenderBlockUids(docNode)).toEqual([])
	})
})
