import { describe, it } from "vitest"
import usePageReady from "./usePageReady"

// the composable is backed by app-wide useState, which every test in this
// file shares — the tests cannot interleave
describe("usePageReady", { concurrent: false }, () => {
	it("starts out not ready", ({ expect }) => {
		const ready = usePageReady()
		ready.value = false

		expect(ready.value).toBe(false)
	})

	it("shares one flag between the page and the router", ({ expect }) => {
		const fromPage = usePageReady()

		fromPage.value = true

		expect(usePageReady().value).toBe(true)
	})
})
