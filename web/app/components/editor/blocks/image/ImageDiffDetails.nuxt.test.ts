import { mountSuspended } from "@nuxt/test-utils/runtime"
import { describe, it } from "vitest"
import ImageDiffDetails from "./ImageDiffDetails.vue"
import { makeNode } from "../../test-helpers/node-view"
import { IMAGE_BLOCK_NAME } from "../node-names"
import { DiffStatus } from "~/components/editor/diff/position-map"
import { t } from "~/components/test-helpers"

describe("<ImageDiffDetails>", () => {
	it("shows the old and the new image side by side", async ({ expect }) => {
		const wrapper = await mountDetails({ src: "a.png" }, { src: "b.png" })

		expect(wrapper.findAll("img").map((img) => img.attributes("src"))).toEqual([
			"a.png",
			"b.png",
		])
	})

	it("shows an empty side for a newly uploaded image", async ({ expect }) => {
		const wrapper = await mountDetails({}, { src: "b.png" })

		expect(wrapper.findAll("img").map((img) => img.attributes("src"))).toEqual([
			"b.png",
		])
		expect(wrapper.text()).toContain(t("editor.image.empty"))
	})

	it("lists a resize as a row", async ({ expect }) => {
		const wrapper = await mountDetails(
			{ src: "a.png", width: 300 },
			{ src: "a.png", width: 480 },
		)

		expect(wrapper.get("dt").text()).toBe(t("editor.image.diff.width"))
		expect(wrapper.get(".line-through").text()).toBe(
			t("editor.diff-change-marker.pixels", { value: "300" }),
		)
		expect(wrapper.get(".bg-diff-text-added").text()).toBe(
			t("editor.diff-change-marker.pixels", { value: "480" }),
		)
		expect(wrapper.find("img").exists()).toBe(false)
	})

	it("shows auto for a width that was not set before", async ({ expect }) => {
		const wrapper = await mountDetails({}, { src: "b.png", width: 492 })

		expect(wrapper.get(".line-through").text()).toBe(
			t("editor.diff-change-marker.auto"),
		)
		expect(wrapper.get(".bg-diff-text-added").text()).toBe(
			t("editor.diff-change-marker.pixels", { value: "492" }),
		)
	})

	it("shows nothing for attributes no one can change", async ({ expect }) => {
		const wrapper = await mountDetails(
			{ src: "a.png", alt: "a cat", uploading: true },
			{ src: "a.png", alt: "a dog", uploading: false },
		)

		expect(wrapper.find("dl").exists()).toBe(false)
		expect(wrapper.find("img").exists()).toBe(false)
	})
})

function mountDetails(
	oldAttrs: Record<string, unknown>,
	newAttrs: Record<string, unknown>,
) {
	return mountSuspended(ImageDiffDetails, {
		props: {
			node: makeNode(
				{
					...newAttrs,
					diffStatus: DiffStatus.Modified,
					oldNode: { attrs: oldAttrs },
				},
				{ typeName: IMAGE_BLOCK_NAME },
			),
		},
	})
}
