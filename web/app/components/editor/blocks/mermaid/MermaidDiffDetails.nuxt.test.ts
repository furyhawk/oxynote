import { mountSuspended } from "@nuxt/test-utils/runtime"
import { Schema, type Node as PMNode } from "@tiptap/pm/model"
import { describe, it } from "vitest"
import MermaidDiffDetails from "./MermaidDiffDetails.vue"
import {
	DIFF_TEXT_ADDED_MARK_NAME,
	DIFF_TEXT_REMOVED_MARK_NAME,
} from "~/components/editor/mark-names"
import { t } from "~/components/test-helpers"

const ADDED = DIFF_TEXT_ADDED_MARK_NAME
const REMOVED = DIFF_TEXT_REMOVED_MARK_NAME

const schema = new Schema({
	nodes: {
		doc: { content: "code" },
		code: { content: "text*", marks: "_" },
		text: {},
	},
	marks: {
		[ADDED]: {},
		[REMOVED]: {},
	},
})

describe("<MermaidDiffDetails>", () => {
	it("shows only the changed lines, numbered, with their changes marked", async ({
		expect,
	}) => {
		const wrapper = await mountDetails([
			["graph TD\nA-->"],
			["B", REMOVED],
			["C", ADDED],
			["\nC-->D"],
		])

		expect(numbers(wrapper)).toEqual(["2"])
		// the raw text content, since text() would trim a stray space away
		expect(wrapper.get(".break-all").element.textContent).toBe("A-->BC")
		expect(wrapper.get(".line-through").text()).toBe("B")
		expect(wrapper.get(".bg-diff-text-added").text()).toBe("C")
	})

	it("strips the indentation the shown lines share", async ({ expect }) => {
		const wrapper = await mountDetails([
			["flowchart TD\n    A-->"],
			["B", REMOVED],
			["C", ADDED],
		])

		expect(wrapper.get(".break-all").element.textContent).toBe("A-->BC")
	})

	it("separates changed lines that are not neighbours", async ({ expect }) => {
		const wrapper = await mountDetails([
			["one\n"],
			["two", ADDED],
			["\nthree\n"],
			["four", ADDED],
		])

		expect(numbers(wrapper)).toEqual(["2", "4"])
		expect(wrapper.findAll(".border-dashed")).toHaveLength(1)
	})

	it("counts the changed lines it leaves out", async ({ expect }) => {
		const wrapper = await mountDetails(
			Array.from({ length: 12 }, (_, index) => [`\nline ${index}`, ADDED]),
		)

		expect(numbers(wrapper)).toHaveLength(10)
		expect(wrapper.text()).toContain(
			t("editor.mermaid.diff.more-lines", { count: 3 }),
		)
	})
})

function numbers(wrapper: Awaited<ReturnType<typeof mountDetails>>) {
	return wrapper.findAll(".select-none").map((cell) => cell.text())
}

function mountDetails(parts: string[][]) {
	const node: PMNode = schema.nodes.code.create(
		null,
		parts.map(([text, ...marks]) =>
			schema.text(
				text ?? "",
				marks.map((mark) => schema.mark(mark)),
			),
		),
	)

	return mountSuspended(MermaidDiffDetails, { props: { node: node } })
}
