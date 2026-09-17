import { mountSuspended } from "@nuxt/test-utils/runtime"
import { describe, it } from "vitest"
import ToastProgress from "./ToastProgress.vue"

describe("<ToastProgress>", () => {
	it("shows the title", async ({ expect }) => {
		const wrapper = await mountToast({ status: "progress" })

		expect(wrapper.text()).toContain("Downloading notes.zip")
	})

	it.for([
		{ input: 0, expected: "0", offset: "-100.00" },
		{ input: 0.426, expected: "43", offset: "-57.40" },
		{ input: 1, expected: "100", offset: "0.00" },
		{ input: 1.5, expected: "100", offset: "0.00" },
		{ input: -0.2, expected: "0", offset: "-100.00" },
	])(
		"reports $input of the work as $expected percent",
		async ({ input, expected, offset }, { expect }) => {
			const wrapper = await mountToast({ status: "progress", progress: input })

			const bar = wrapper.get("[role='progressbar']")

			expect(bar.attributes("aria-valuenow")).toBe(expected)
			expect(bar.attributes("aria-label")).toBe("Downloading notes.zip")
			// the bar slides by the exact fraction, unrounded
			expect(bar.get("div").attributes("style")).toBe(
				`transform: translateX(${offset}%);`,
			)
		},
	)

	it("pulses a full bar while the total is unknown", async ({ expect }) => {
		const wrapper = await mountToast({ status: "progress", progress: null })

		const bar = wrapper.get("[role='progressbar']")

		expect(bar.attributes("aria-valuenow")).toBeUndefined()
		expect(bar.get("div").classes()).toContain("animate-pulse")
		expect(bar.get("div").attributes("style")).toBeUndefined()
	})

	it.for([
		{
			status: "progress",
			icon: "mingcute:time-fill",
			colour: "text-muted-foreground",
		},
		{
			status: "success",
			icon: "mingcute:check-circle-fill",
			colour: "text-status-success",
		},
		{
			status: "error",
			icon: "mingcute:close-circle-fill",
			colour: "text-status-error",
		},
	] as const)(
		"marks the $status status with its own icon and colour",
		async ({ status, icon, colour }, { expect }) => {
			const wrapper = await mountToast({ status })

			const classes = wrapper.get(".iconify").classes()

			expect(classes).toContain(`i-${icon}`)
			expect(classes).toContain(colour)
		},
	)

	it.for([
		{ status: "success", colour: "bg-status-success" },
		{ status: "error", colour: "bg-status-error" },
	] as const)(
		"fills the bar in its outcome colour once the work ends in $status",
		async ({ status, colour }, { expect }) => {
			const wrapper = await mountToast({ status, progress: 0.3 })

			const track = wrapper.get(".bg-muted")
			const fill = track.get("div")

			expect(wrapper.find("[role='progressbar']").exists()).toBe(false)
			expect(track.attributes("aria-hidden")).toBe("true")
			expect(fill.classes()).toContain(colour)
			expect(fill.classes()).not.toContain("bg-primary")
			expect(fill.attributes("style")).toBe("transform: translateX(0.00%);")
		},
	)

	it("fills the bar once work of unknown size ends", async ({ expect }) => {
		const wrapper = await mountToast({ status: "success", progress: null })

		const fill = wrapper.get(".bg-muted > div")

		expect(fill.classes()).not.toContain("animate-pulse")
		expect(fill.attributes("style")).toBe("transform: translateX(0.00%);")
	})

	it("emits close when the close button is pressed", async ({ expect }) => {
		const wrapper = await mountToast({ status: "progress" })

		await wrapper.get("button").trigger("click")

		expect(wrapper.emitted("close")).toHaveLength(1)
	})

	it("does not emit close before the button is pressed", async ({ expect }) => {
		const wrapper = await mountToast({ status: "progress" })

		expect(wrapper.emitted("close")).toBeUndefined()
	})
})

function mountToast(props: {
	status: "progress" | "success" | "error"
	title?: string
	progress?: number | null
}) {
	return mountSuspended(ToastProgress, {
		props: { title: "Downloading notes.zip", progress: 0, ...props },
	})
}
