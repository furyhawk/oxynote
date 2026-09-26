import { mountSuspended } from "@nuxt/test-utils/runtime"
import { describe, it } from "vitest"
import FigmaDiffDetails from "./FigmaDiffDetails.vue"
import { makeNode } from "../../test-helpers/node-view"
import { DiffStatus } from "~/components/editor/diff/position-map"
import { t } from "~/components/test-helpers"

const OLD_URL = "https://www.figma.com/design/abc123/Checkout-Flow"
const NEW_URL = "https://www.figma.com/design/xyz789/Sign%20up-Screen"

describe("<FigmaDiffDetails>", () => {
	it("names the old and the new file from their URLs", async ({ expect }) => {
		const wrapper = await mountDetails({ src: OLD_URL }, { src: NEW_URL })

		expect(wrapper.findAll(".font-medium").map((name) => name.text())).toEqual([
			"Checkout Flow",
			"Sign up Screen",
		])
		expect(wrapper.text()).toContain(OLD_URL)
	})

	it("keeps the raw text of a URL it cannot parse", async ({ expect }) => {
		const wrapper = await mountDetails({}, { src: "not a url" })

		expect(wrapper.get(".font-medium").text()).toBe("not a url")
		expect(wrapper.text()).toContain(t("editor.figma.empty"))
	})

	it("shows auto for a size that was not set before", async ({ expect }) => {
		const wrapper = await mountDetails(
			{ src: OLD_URL },
			{ src: OLD_URL, height: 300 },
		)

		expect(wrapper.get(".line-through").text()).toBe(
			t("editor.diff-change-marker.auto"),
		)
		expect(wrapper.get(".bg-diff-text-added").text()).toBe(
			t("editor.diff-change-marker.pixels", { value: "300" }),
		)
	})

	it("lists a resize as rows", async ({ expect }) => {
		const wrapper = await mountDetails(
			{ src: OLD_URL, width: 400, height: 300 },
			{ src: OLD_URL, width: 600, height: 300 },
		)

		expect(wrapper.findAll("dt").map((dt) => dt.text())).toEqual([
			t("editor.figma.diff.width"),
		])
		expect(wrapper.find(".font-medium").exists()).toBe(false)
	})
})

function mountDetails(
	oldAttrs: Record<string, unknown>,
	newAttrs: Record<string, unknown>,
) {
	return mountSuspended(FigmaDiffDetails, {
		props: {
			node: makeNode({
				...newAttrs,
				diffStatus: DiffStatus.Modified,
				oldNode: { attrs: oldAttrs },
			}),
		},
	})
}
