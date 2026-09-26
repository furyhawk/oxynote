import { mountSuspended } from "@nuxt/test-utils/runtime"
import { describe, it } from "vitest"
import { h } from "vue"
import DiffBeforeAfter from "./DiffBeforeAfter.vue"

describe("<DiffBeforeAfter>", () => {
	it("renders each set side through the slot", async ({ expect }) => {
		const wrapper = await mountSides("a.png", "b.png")

		expect(wrapper.findAll(".side").map((side) => side.text())).toEqual([
			"a.png",
			"b.png",
		])
		expect(wrapper.text()).not.toContain("nothing")
	})

	it.for([
		{
			name: "shows the empty label for a side that was not set before",
			input: [undefined, "b.png"],
			expected: ["nothing", "b.png"],
		},
		{
			name: "shows the empty label for a side that is not set after",
			input: ["a.png", undefined],
			expected: ["a.png", "nothing"],
		},
	])("$name", async ({ input, expected }, { expect }) => {
		const wrapper = await mountSides(input[0], input[1])
		const boxes = wrapper.findAll(".border-2").map((box) => box.text())

		expect(boxes).toEqual(expected)
	})

	it("borders the old side red and the new side green", async ({ expect }) => {
		const wrapper = await mountSides("a.png", "b.png")
		const boxes = wrapper.findAll(".border-2")

		expect(boxes[0]?.classes()).toContain("border-diff-removed")
		expect(boxes[1]?.classes()).toContain("border-diff-added")
	})
})

function mountSides(before: string | undefined, after: string | undefined) {
	return mountSuspended(DiffBeforeAfter, {
		props: { before: before, after: after, emptyLabel: "nothing" },
		slots: {
			default: ({ value }: { value: unknown }) =>
				h("span", { class: "side" }, String(value)),
		},
	})
}
