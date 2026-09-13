import type { MermaidConfig } from "mermaid"
import { beforeEach, describe, it, vi, type Mock } from "vitest"
import { ref } from "vue"

const themeColors = {
	background: "#000001",
	foreground: "#000002",
	card: "#000003",
	muted: "#000004",
	mutedForeground: "#000005",
	accent: "#000006",
	border: "#000007",
	primary: "#000008",
	primaryForeground: "#000009",
	destructive: "#00000a",
	destructiveForeground: "#00000b",
	// a fixed tuple, so an index in an assertion is a string, not undefined
	selectable: [
		"#c00001",
		"#c00002",
		"#c00003",
		"#c00004",
		"#c00005",
		"#c00006",
		"#c00007",
		"#c00008",
		"#c00009",
		"#c0000a",
		"#c0000b",
		"#c0000c",
		"#c0000d",
		"#c0000e",
		"#c0000f",
		"#c00010",
	] as const,
	fontFamily: "Test Sans",
}

interface ThemeVariables {
	[key: string]: unknown
	xyChart?: { plotColorPalette?: string }
	radar?: { graticuleColor?: string }
	railroad?: { ruleNameColor?: string }
	treeView?: { highlightStroke?: string }
}

interface MermaidStub {
	initialize: Mock
	render: Mock
}

const c4 = vi.hoisted(() => ({
	themeC4Labels: vi.fn((svg: string) => `${svg}<!-- themed -->`),
}))

// the C4 label rewrite needs a DOM; the composable only has to hand it the
// rendered svg and the theme's text colours
vi.mock("./c4-labels", () => ({ themeC4Labels: c4.themeC4Labels }))

// the composable keeps the loaded module, the in-flight load promise and
// the last applied theme in module scope, so every case re-imports it
// against a freshly mocked "mermaid" to start from a clean slate
async function loadComposable(
	options: { failLoad?: boolean; stub?: Partial<MermaidStub> } = {},
) {
	const stub: MermaidStub = {
		initialize: vi.fn(),
		render: vi.fn().mockResolvedValue({ svg: "<svg />" }),
		...options.stub,
	}

	vi.resetModules()
	vi.doMock("~/assets/css", () => ({ mermaidThemeColors: () => themeColors }))
	vi.doMock("mermaid", () => {
		if (options.failLoad) {
			throw new Error("chunk unavailable")
		}

		return { default: stub }
	})

	const mod = await import("./useMermaid")

	return { useMermaid: mod.useMermaid, stub }
}

function initializedConfig(stub: MermaidStub, call = 0): MermaidConfig {
	return stub.initialize.mock.calls[call]?.[0] as MermaidConfig
}

// suites share the composable's module-scoped load state, and each case
// rebuilds it through vi.resetModules — interleaving would cross-wire
// the mocks
describe("useMermaid", { concurrent: false }, () => {
	beforeEach(() => {
		vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }))
		c4.themeC4Labels.mockClear()
	})

	it("renders the source through the loaded mermaid module", async ({
		expect,
	}) => {
		const { useMermaid, stub } = await loadComposable()

		const { render } = useMermaid(ref(false))
		const result = await render("id-1", "graph LR")

		expect(result).toEqual({ svg: "<svg /><!-- themed -->" })
		expect(stub.render).toHaveBeenCalledTimes(1)
		expect(stub.render).toHaveBeenCalledWith("id-1", "graph LR")
		expect(stub.initialize).toHaveBeenCalledTimes(1)
	})

	it("recolours C4 labels on the rendered svg with the theme's text colours", async ({
		expect,
	}) => {
		const { useMermaid } = await loadComposable()

		const { render } = useMermaid(ref(false))
		await render("id-1", "C4Context")

		expect(c4.themeC4Labels).toHaveBeenCalledTimes(1)
		expect(c4.themeC4Labels).toHaveBeenCalledWith("<svg />", {
			internal: themeColors.primaryForeground,
			external: themeColors.foreground,
		})
	})

	it("clears the loading flag and the load error after a successful load", async ({
		expect,
	}) => {
		const { useMermaid } = await loadComposable()

		const { isLoading, loadError, render } = useMermaid(ref(false))
		await render("id-1", "graph LR")

		expect(isLoading.value).toBe(false)
		expect(loadError.value).toBeNull()
	})

	it("initializes mermaid with the theme colors", async ({ expect }) => {
		const { useMermaid, stub } = await loadComposable()

		const { render } = useMermaid(ref(true))
		await render("id-1", "graph LR")

		const config = initializedConfig(stub)

		expect(config.startOnLoad).toBe(false)
		expect(config.securityLevel).toBe("strict")
		expect(config.suppressErrorRendering).toBe(true)
		expect(config.theme).toBe("base")
		expect(config.darkMode).toBe(true)
		expect(config.fontFamily).toBe(themeColors.fontFamily)
	})

	it("spreads the selectable palette over every indexed theme variable", async ({
		expect,
	}) => {
		const { useMermaid, stub } = await loadComposable()
		// every fifth palette entry from the middle: indexes 7, 12, 1, 6, ...
		const sel = themeColors.selectable

		const { render } = useMermaid(ref(false))
		await render("id-1", "graph LR")

		const vars = (initializedConfig(stub).themeVariables ??
			{}) as ThemeVariables

		expect(vars.cScale0).toBe(sel[7])
		expect(vars.cScale1).toBe(sel[12])
		expect(vars.cScale2).toBe(sel[1])
		expect(vars.cScale11).toBe(sel[14])
		expect(vars.cScaleLabel0).toBe(themeColors.primaryForeground)
		expect(vars.pie1).toBe(sel[7])
		expect(vars.pie12).toBe(sel[14])
		expect(vars.venn8).toBe(sel[10])
		expect(vars.git7).toBe(sel[10])
		expect(vars.actor5).toBe(sel[0])
		expect(vars.xyChart?.plotColorPalette).toMatch(
			new RegExp(`^${sel[7]},${sel[12]},${sel[1]},`),
		)
		expect(vars.radar?.graticuleColor).toBe(themeColors.border)
	})

	it("keeps single-accent roles on the primary colour and text accents plain", async ({
		expect,
	}) => {
		const { useMermaid, stub } = await loadComposable()

		const { render } = useMermaid(ref(false))
		await render("id-1", "gantt")

		const vars = (initializedConfig(stub).themeVariables ??
			{}) as ThemeVariables

		expect(vars.taskBkgColor).toBe(themeColors.primary)
		expect(vars.taskTextColor).toBe(themeColors.primaryForeground)
		expect(vars.activeTaskBkgColor).toBe(themeColors.accent)
		expect(vars.activeTaskBorderColor).toBe(themeColors.primary)
		expect(vars.doneTaskBkgColor).toBe(themeColors.muted)
		expect(vars.taskTextDarkColor).toBe(themeColors.foreground)
		expect(vars.critBkgColor).toBe(themeColors.destructive)
		expect(vars.quadrantPointFill).toBe(themeColors.primary)
		expect(vars.railroad?.ruleNameColor).toBe(themeColors.foreground)
		expect(vars.treeView?.highlightStroke).toBe(themeColors.primary)
	})

	it("colours C4 elements and sankey links through diagram config", async ({
		expect,
	}) => {
		const { useMermaid, stub } = await loadComposable()

		const { render } = useMermaid(ref(false))
		await render("id-1", "C4Context")

		const config = initializedConfig(stub)

		expect(config.c4?.person_bg_color).toBe(themeColors.selectable[7])
		expect(config.c4?.container_db_border_color).toBe(themeColors.selectable[1])
		expect(config.c4?.external_system_bg_color).toBe(themeColors.muted)
		expect(config.c4?.external_system_border_color).toBe(themeColors.border)
		expect(config.sankey?.linkColor).toBe(themeColors.mutedForeground)
	})

	it("overrides the colours mermaid hardcodes through themeCSS", async ({
		expect,
	}) => {
		const { useMermaid, stub } = await loadComposable()

		const { render } = useMermaid(ref(false))
		await render("id-1", "journey")

		const css = initializedConfig(stub).themeCSS ?? ""

		expect(css).toContain(`.face { stroke: ${themeColors.border}; }`)
		expect(css).toContain(
			`.node-icon-text > div { color: ${themeColors.foreground}; }`,
		)
		expect(css).toContain(
			`.architecture-service [style*="#087ebf"], .architecture-groups [style*="#087ebf"] { fill: ${themeColors.primary} !important; rx: 8px; ry: 8px; }`,
		)
		expect(css).toContain(
			`.node[id^="node-"]:nth-child(16n+1) > rect:only-child { fill: ${themeColors.selectable[7]}; }`,
		)
		expect(css).toContain(
			`.node[id^="node-"]:nth-child(16n+16) > rect:only-child { fill: ${themeColors.selectable[2]}; }`,
		)
		expect(css).toContain(
			`.architecture-service text { fill: ${themeColors.foreground}; paint-order: stroke; stroke: ${themeColors.background};`,
		)
		expect(css).toContain(
			`.architecture-groups rect.node-bkg { rx: 8px; ry: 8px; }`,
		)
	})

	it("alternates the journey section fills between the card and accent surfaces", async ({
		expect,
	}) => {
		const { useMermaid, stub } = await loadComposable()

		const { render } = useMermaid(ref(false))
		await render("id-1", "journey")

		const vars = (initializedConfig(stub).themeVariables ??
			{}) as ThemeVariables

		expect(vars.fillType0).toBe(themeColors.card)
		expect(vars.fillType1).toBe(themeColors.accent)
		expect(vars.fillType6).toBe(themeColors.card)
		expect(vars.fillType7).toBe(themeColors.accent)
	})

	it("reinitializes mermaid when the dark flag flips between renders", async ({
		expect,
	}) => {
		const { useMermaid, stub } = await loadComposable()
		const dark = ref(false)

		const { render } = useMermaid(dark)
		await render("id-1", "graph LR")
		dark.value = true
		await render("id-2", "graph LR")

		expect(stub.initialize).toHaveBeenCalledTimes(2)
		expect(initializedConfig(stub, 0).darkMode).toBe(false)
		expect(initializedConfig(stub, 1).darkMode).toBe(true)
	})

	it("keeps the existing configuration when the dark flag is unchanged", async ({
		expect,
	}) => {
		const { useMermaid, stub } = await loadComposable()

		const { render } = useMermaid(ref(false))
		await render("id-1", "graph LR")
		await render("id-2", "graph LR")

		expect(stub.initialize).toHaveBeenCalledTimes(1)
		expect(stub.render).toHaveBeenCalledTimes(2)
	})

	it("loads mermaid once across several composable instances", async ({
		expect,
	}) => {
		const { useMermaid, stub } = await loadComposable()

		const first = useMermaid(ref(false))
		const second = useMermaid(ref(false))
		await first.render("id-1", "graph LR")
		await second.render("id-2", "graph LR")

		expect(stub.initialize).toHaveBeenCalledTimes(1)
	})

	it("reuses the in-flight load promise instead of importing twice", async ({
		expect,
	}) => {
		const { useMermaid, stub } = await loadComposable()

		// the setup call starts the load without awaiting it, so the
		// render below reaches loadMermaid while the promise is pending
		const { render } = useMermaid(ref(false))
		const result = await render("id-1", "graph LR")

		expect(result).toEqual({ svg: "<svg /><!-- themed -->" })
		expect(stub.initialize).toHaveBeenCalledTimes(1)
	})

	it("leaves the module unloaded when initialization throws", async ({
		expect,
	}) => {
		const { useMermaid, stub } = await loadComposable({
			stub: {
				initialize: vi.fn(() => {
					throw new Error("bad config")
				}),
			},
		})

		const { render, loadError } = useMermaid(ref(false))
		const result = await render("id-1", "graph LR")

		expect(result).toEqual({ error: "bad config" })
		expect(loadError.value).toBe("bad config")
		expect(stub.initialize).toHaveBeenCalledTimes(1)
		expect(stub.render).toHaveBeenCalledTimes(0)
	})

	it("surfaces the import failure as the render error", async ({ expect }) => {
		const { useMermaid } = await loadComposable({ failLoad: true })

		const { render, loadError, isLoading } = useMermaid(ref(false))
		const result = await render("id-1", "graph LR")

		expect(result).toEqual({ error: loadError.value })
		expect(loadError.value).toEqual(expect.any(String))
		expect(isLoading.value).toBe(false)
	})

	it("retries the import after a failed load", async ({ expect }) => {
		const { useMermaid } = await loadComposable({ failLoad: true })

		const { render } = useMermaid(ref(false))
		await render("id-1", "graph LR")
		const stub: MermaidStub = {
			initialize: vi.fn(),
			render: vi.fn().mockResolvedValue({ svg: "<svg />" }),
		}
		vi.doMock("mermaid", () => ({ default: stub }))
		const result = await render("id-2", "graph LR")

		expect(result).toEqual({ svg: "<svg /><!-- themed -->" })
		expect(stub.initialize).toHaveBeenCalledTimes(1)
	})

	it("returns the message of an error thrown while rendering", async ({
		expect,
	}) => {
		const { useMermaid } = await loadComposable({
			stub: { render: vi.fn().mockRejectedValue(new Error("bad syntax")) },
		})

		const { render } = useMermaid(ref(false))
		const result = await render("id-1", "graph LR")

		expect(result).toEqual({ error: "bad syntax" })
	})

	it("falls back to the render-failed message for a non-error throw", async ({
		expect,
	}) => {
		const { useMermaid } = await loadComposable({
			stub: { render: vi.fn().mockRejectedValue("boom") },
		})

		const { render } = useMermaid(ref(false))
		const result = await render("id-1", "graph LR")

		expect(result).toEqual({ error: "editor.mermaid.errors.render-failed" })
	})
})
