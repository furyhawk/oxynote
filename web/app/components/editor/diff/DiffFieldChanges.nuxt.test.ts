import { mountSuspended } from "@nuxt/test-utils/runtime"
import { describe, it } from "vitest"
import DiffFieldChanges from "./DiffFieldChanges.vue"
import type { FieldChange } from "./change-count"
import { t } from "~/components/test-helpers"

describe("<DiffFieldChanges>", () => {
	it("shows a changed field's label, old value and new value", async ({
		expect,
	}) => {
		const wrapper = await mountFields([
			{ label: "Title", oldValue: "CPU", newValue: "CPU usage" },
		])

		expect(wrapper.get("dt").text()).toBe("Title")
		expect(wrapper.get(".line-through").text()).toBe("CPU")
		expect(wrapper.get(".bg-diff-text-added").text()).toBe("CPU usage")
		expect(wrapper.find(".iconify").exists()).toBe(true)
	})

	it("shows only the new value of a newly set field", async ({ expect }) => {
		const wrapper = await mountFields([
			{ label: "Unit", oldValue: null, newValue: "percent" },
		])

		expect(wrapper.find(".line-through").exists()).toBe(false)
		expect(wrapper.get(".bg-diff-text-added").text()).toBe("percent")
		expect(wrapper.find(".iconify").exists()).toBe(false)
	})

	it("shows only the old value of a cleared field", async ({ expect }) => {
		const wrapper = await mountFields([
			{ label: "Unit", oldValue: "percent", newValue: null },
		])

		expect(wrapper.get(".line-through").text()).toBe("percent")
		expect(wrapper.find(".bg-diff-text-added").exists()).toBe(false)
	})

	it("names an empty value instead of leaving it blank", async ({ expect }) => {
		const wrapper = await mountFields([
			{ label: "Legend 2", oldValue: null, newValue: "" },
		])

		expect(wrapper.get(".bg-diff-text-added").text()).toBe(
			t("editor.diff-change-marker.empty"),
		)
	})

	it("sets code values in a monospace font", async ({ expect }) => {
		const wrapper = await mountFields([
			{ label: "Query 2", oldValue: null, newValue: "up", code: true },
			{ label: "Title", oldValue: null, newValue: "CPU" },
		])

		expect(wrapper.findAll("dd").map((dd) => dd.classes("font-mono"))).toEqual([
			true,
			false,
		])
	})
})

function mountFields(rows: FieldChange[]) {
	return mountSuspended(DiffFieldChanges, { props: { rows: rows } })
}
