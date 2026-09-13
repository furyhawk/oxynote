import { beforeEach, describe, it, vi, type MockInstance } from "vitest"

// the module keeps the running load's baseline and its throttle window in
// module scope, so every case re-imports it to start from a clean slate
async function loadModule() {
	vi.resetModules()

	return await import("./load-progress")
}

type ConsoleSpy = MockInstance<(...args: unknown[]) => void>

function lines(log: ConsoleSpy): string[] {
	return log.mock.calls.map((call) => String(call[0]))
}

// the cases share the console spy and the module registry, so they cannot
// interleave
describe("load-progress", { concurrent: false }, () => {
	let log: ConsoleSpy

	beforeEach(() => {
		log = vi.spyOn(console, "log").mockImplementation(() => undefined)
	})

	describe("logSectionReady", { concurrent: false }, () => {
		it("names the section and how long it took", async ({ expect }) => {
			const { logSectionReady, startLoadProgress } = await loadModule()
			startLoadProgress()

			logSectionReady("sidebar")

			expect(lines(log)).toEqual([
				expect.stringMatching(/^\[page-load\] sidebar ready in \d+\.\d\ds$/),
			])
		})
	})

	describe("logAsyncBlockProgress", { concurrent: false }, () => {
		it("draws how many blocks rendered and how many are waiting", async ({
			expect,
		}) => {
			const { logAsyncBlockProgress, startLoadProgress } = await loadModule()
			startLoadProgress()

			logAsyncBlockProgress(2, 4)

			expect(lines(log)).toEqual([
				"[page-load] async blocks ████████░░░░░░░░ 2/4 rendered, 2 waiting",
			])
		})

		it("holds back an update that follows another too closely", async ({
			expect,
		}) => {
			const { logAsyncBlockProgress, startLoadProgress } = await loadModule()
			startLoadProgress()

			logAsyncBlockProgress(1, 4)
			logAsyncBlockProgress(2, 4)

			expect(lines(log)).toEqual([
				expect.stringContaining("1/4 rendered, 3 waiting"),
			])
		})

		it("always draws the last block, however fast it arrives", async ({
			expect,
		}) => {
			const { logAsyncBlockProgress, startLoadProgress } = await loadModule()
			startLoadProgress()

			logAsyncBlockProgress(1, 2)
			logAsyncBlockProgress(2, 2)

			expect(lines(log)).toEqual([
				expect.stringContaining("1/2 rendered, 1 waiting"),
				"[page-load] async blocks ████████████████ 2/2 rendered, 0 waiting",
			])
		})
	})

	describe("startLoadProgress", { concurrent: false }, () => {
		it("times the first load from the moment the page opened", async ({
			expect,
		}) => {
			const { logSectionReady, startLoadProgress } = await loadModule()

			startLoadProgress()
			logSectionReady("sidebar")

			const seconds = Number(
				/ready in (\d+\.\d\d)s$/.exec(lines(log)[0] ?? "")?.[1],
			)
			expect(seconds).toBeCloseTo(performance.now() / 1000, 1)
		})

		it("times a later load from its own start", async ({ expect }) => {
			const { logSectionReady, startLoadProgress } = await loadModule()

			startLoadProgress()
			startLoadProgress()
			logSectionReady("document data")

			expect(lines(log)).toEqual(["[doc-switch] document data ready in 0.00s"])
		})

		it("marks a later load as a document switch rather than a page load", async ({
			expect,
		}) => {
			const { logAsyncBlockProgress, startLoadProgress } = await loadModule()

			startLoadProgress()
			startLoadProgress()
			logAsyncBlockProgress(1, 2)

			expect(lines(log)).toEqual([
				expect.stringMatching(/^\[doc-switch\] async blocks /),
			])
		})

		it("reopens the throttle window for the next load", async ({ expect }) => {
			const { logAsyncBlockProgress, startLoadProgress } = await loadModule()
			startLoadProgress()

			logAsyncBlockProgress(1, 4)
			startLoadProgress()
			logAsyncBlockProgress(2, 4)

			expect(lines(log)).toHaveLength(2)
		})
	})
})
