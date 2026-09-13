import { shallowRef, ref, readonly, type Ref } from "vue"
import type { MermaidConfig } from "mermaid"
import { mermaidThemeColors } from "~/assets/css"
import { themeC4Labels, type C4LabelColors } from "./c4-labels"

type RenderMermaid = (
	id: string,
	source: string,
) => Promise<{ svg: string } | { error: string }>

const mermaidModule = shallowRef<typeof import("mermaid") | null>(null)
const isLoading = ref(false)
const loadError = ref<string | null>(null)
let loadPromise: Promise<void> | null = null
let lastInitializedDark: boolean | null = null
let c4Labels: C4LabelColors = { internal: "", external: "" }

// numbered theme variables such as cScale0..cScale11 or pie1..pie12
function numbered(prefix: string, colors: string[], from = 0) {
	return Object.fromEntries(
		colors.map((color, index) => [`${prefix}${from + index}`, color]),
	)
}

function repeat(color: string, count: number) {
	return Array.from({ length: count }, () => color)
}

function buildMermaidTheme(dark: boolean) {
	const c = mermaidThemeColors()
	// the selectable palette runs through the hues in order, so a series
	// takes every fifth entry, starting mid-list, to keep consecutive
	// colours apart
	const series = [7, 12, 1, 6, 11, 0, 5, 10, 15, 4, 9, 14, 3, 8, 13, 2].flatMap(
		(index) => c.selectable[index] ?? [],
	)
	const scale = series.slice(0, 12)
	// text drawn on a series colour or on the primary colour
	const onSeries = c.primaryForeground
	const line = c.mutedForeground
	const text = c.foreground

	// C4 element colours are diagram config, not theme variables, and their
	// labels are recoloured on the rendered svg (see themeC4Labels). External
	// elements stay neutral so the internal ones stand out.
	const [person, system, container, component] = series
	const c4Types: [string, string | undefined][] = [
		["person", person],
		["system", system],
		["system_db", system],
		["system_queue", system],
		["container", container],
		["container_db", container],
		["container_queue", container],
		["component", component],
		["component_db", component],
		["component_queue", component],
	]
	const c4 = Object.fromEntries(
		c4Types.flatMap(([type, color]) => [
			[`${type}_bg_color`, color],
			[`${type}_border_color`, color],
			[`external_${type}_bg_color`, c.muted],
			[`external_${type}_border_color`, c.border],
		]),
	)

	const config = {
		startOnLoad: false,
		securityLevel: "strict",
		suppressErrorRendering: true,
		darkMode: dark,
		theme: "base",
		fontFamily: c.fontFamily,
		themeVariables: {
			background: c.background,
			fontFamily: c.fontFamily,
			primaryColor: c.card,
			primaryTextColor: text,
			primaryBorderColor: c.border,
			secondaryColor: c.muted,
			secondaryTextColor: text,
			secondaryBorderColor: c.border,
			tertiaryColor: c.accent,
			tertiaryTextColor: text,
			tertiaryBorderColor: c.border,
			noteBkgColor: c.accent,
			noteTextColor: text,
			noteBorderColor: c.border,
			lineColor: line,
			arrowheadColor: line,
			textColor: text,
			titleColor: text,
			labelColor: text,
			labelBackground: c.background,
			border2: c.border,
			nodeBkg: c.card,
			mainBkg: c.card,
			secondBkg: c.muted,
			nodeBorder: c.border,
			clusterBkg: c.muted,
			clusterBorder: c.border,
			defaultLinkColor: line,
			edgeLabelBackground: c.background,
			nodeTextColor: text,
			rectBkgColor: c.accent,
			classText: text,
			errorBkgColor: c.destructive,
			errorTextColor: onSeries,
			// Sequence diagram
			actorBorder: c.border,
			actorBkg: c.card,
			actorTextColor: text,
			actorLineColor: line,
			labelBoxBkgColor: c.card,
			labelBoxBorderColor: c.border,
			labelTextColor: text,
			loopTextColor: text,
			signalColor: line,
			signalTextColor: text,
			activationBorderColor: c.border,
			activationBkgColor: c.muted,
			sequenceNumberColor: c.background,
			// Gantt
			sectionBkgColor: c.muted,
			altSectionBkgColor: c.background,
			sectionBkgColor2: c.card,
			excludeBkgColor: c.accent,
			// active and done bars share their text colour with the labels
			// outside bars, so they sit on light surfaces
			taskBorderColor: c.primary,
			taskBkgColor: c.primary,
			activeTaskBorderColor: c.primary,
			activeTaskBkgColor: c.accent,
			doneTaskBkgColor: c.muted,
			doneTaskBorderColor: c.border,
			critBorderColor: c.destructive,
			critBkgColor: c.destructive,
			todayLineColor: c.destructive,
			vertLineColor: line,
			gridColor: c.border,
			taskTextColor: onSeries,
			taskTextLightColor: onSeries,
			taskTextDarkColor: text,
			taskTextOutsideColor: text,
			taskTextClickableColor: onSeries,
			// C4
			personBorder: c.border,
			personBkg: c.card,
			// Tables
			rowOdd: c.card,
			rowEven: c.muted,
			attributeBackgroundColorOdd: c.card,
			attributeBackgroundColorEven: c.muted,
			// State diagram
			transitionColor: line,
			transitionLabelColor: text,
			stateLabelColor: text,
			stateBkg: c.card,
			stateBorder: c.border,
			labelBackgroundColor: c.background,
			compositeBackground: c.background,
			altBackground: c.muted,
			compositeTitleBackground: c.card,
			compositeBorder: c.border,
			innerEndBackground: line,
			specialStateColor: text,
			// Colour scales: mindmap, timeline, treemap and radar sections
			...numbered("cScale", scale),
			...numbered("cScalePeer", scale),
			...numbered("cScaleInv", repeat(onSeries, scale.length)),
			...numbered("cScaleLabel", repeat(onSeries, scale.length)),
			// Pie chart
			...numbered("pie", scale, 1),
			pieTitleTextColor: text,
			pieSectionTextColor: onSeries,
			pieLegendTextColor: text,
			pieStrokeColor: c.background,
			pieOuterStrokeColor: c.background,
			// Venn
			...numbered("venn", series.slice(0, 8), 1),
			vennTitleTextColor: text,
			vennSetTextColor: text,
			// Requirement diagram
			requirementBackground: c.card,
			requirementBorderColor: c.border,
			requirementTextColor: text,
			relationColor: line,
			relationLabelBackground: c.background,
			relationLabelColor: text,
			// Git graph
			...numbered("git", series.slice(0, 8)),
			...numbered("gitInv", repeat(text, 8)),
			...numbered("gitBranchLabel", repeat(onSeries, 8)),
			branchLabelColor: onSeries,
			commitLineColor: line,
			commitLabelColor: text,
			commitLabelBackground: c.background,
			tagLabelColor: text,
			tagLabelBackground: c.muted,
			tagLabelBorder: c.border,
			// User journey: sections alternate between two surfaces
			...numbered(
				"fillType",
				repeat(c.card, 4).flatMap((card) => [card, c.accent]),
			),
			...numbered("actor", series.slice(0, 6)),
			faceColor: c.accent,
			// Quadrant chart
			quadrant1Fill: c.card,
			quadrant2Fill: c.muted,
			quadrant3Fill: c.accent,
			quadrant4Fill: c.card,
			quadrant1TextFill: text,
			quadrant2TextFill: text,
			quadrant3TextFill: text,
			quadrant4TextFill: text,
			quadrantPointFill: c.primary,
			quadrantPointTextFill: text,
			quadrantXAxisTextFill: text,
			quadrantYAxisTextFill: text,
			quadrantInternalBorderStrokeFill: c.border,
			quadrantExternalBorderStrokeFill: c.border,
			quadrantTitleFill: text,
			// XY chart
			xyChart: {
				backgroundColor: c.background,
				titleColor: text,
				dataLabelColor: text,
				legendTextColor: text,
				xAxisTitleColor: text,
				xAxisLabelColor: text,
				xAxisTickColor: text,
				xAxisLineColor: c.border,
				yAxisTitleColor: text,
				yAxisLabelColor: text,
				yAxisTickColor: text,
				yAxisLineColor: c.border,
				plotColorPalette: series.join(","),
			},
			// Architecture
			archEdgeColor: line,
			archEdgeArrowColor: line,
			archGroupBorderColor: c.border,
			// Radar
			radar: {
				axisColor: line,
				graticuleColor: c.border,
			},
			// Packet
			packet: {
				startByteColor: line,
				endByteColor: line,
				labelColor: text,
				titleColor: text,
				blockStrokeColor: c.border,
				blockFillColor: c.card,
			},
			// Treemap
			treemap: {
				sectionStrokeColor: c.border,
				sectionFillColor: c.muted,
				leafStrokeColor: c.border,
				leafFillColor: c.card,
				titleColor: text,
				labelColor: text,
				valueColor: text,
			},
			// Tree view
			treeView: {
				labelColor: text,
				lineColor: line,
				iconColor: line,
				descriptionColor: line,
				highlightBg: c.accent,
				highlightStroke: c.primary,
			},
			// Railroad (ABNF, EBNF, PEG)
			railroad: {
				terminalFill: c.accent,
				terminalStroke: c.border,
				terminalTextColor: text,
				nonTerminalFill: c.card,
				nonTerminalStroke: c.border,
				nonTerminalTextColor: text,
				lineColor: line,
				markerFill: line,
				commentFill: c.muted,
				commentStroke: c.border,
				commentTextColor: line,
				specialFill: c.card,
				specialStroke: line,
				ruleNameColor: text,
			},
			// Cynefin: the domain fills are drawn translucent
			cynefin: {
				boundaryColor: line,
				cliffColor: c.destructive,
				arrowColor: line,
				complexBg: series[0],
				complicatedBg: series[1],
				chaoticBg: series[2],
				clearBg: series[3],
				confusionBg: series[4],
				textColor: text,
				labelColor: text,
			},
			// Wardley map
			wardleyEvolutionColor: c.destructive,
			wardley: {
				backgroundColor: c.background,
				axisColor: line,
				axisTextColor: text,
				gridColor: c.border,
				componentFill: c.card,
				componentStroke: text,
				componentLabelColor: text,
				linkStroke: line,
				evolutionStroke: c.destructive,
				annotationStroke: line,
				annotationTextColor: text,
				annotationFill: c.card,
			},
			// Event modelling: its html labels take the page text colour, so
			// the category colour goes on the stroke rather than the fill
			emUiFill: c.card,
			emUiStroke: c.border,
			emProcessorFill: c.card,
			emProcessorStroke: series[0],
			emReadModelFill: c.card,
			emReadModelStroke: series[1],
			emCommandFill: c.card,
			emCommandStroke: series[2],
			emEventFill: c.card,
			emEventStroke: series[3],
			emSwimlaneBackgroundOdd: c.muted,
			emSwimlaneBackgroundStroke: c.border,
			emArrowhead: line,
			emRelationStroke: line,
		},
		c4,
		sankey: {
			linkColor: line,
		},
		// colours mermaid writes straight into attributes or hardcodes in a
		// diagram's stylesheet, out of reach of any theme variable. This
		// sheet is appended after mermaid's own rules, so equal specificity
		// wins; only inline style attributes need !important. Attribute
		// selectors name mermaid's literal defaults, so user-styled elements
		// are left alone. The one selector naming our own border colour is
		// the state diagram's end marker, whose inner dot mermaid fills with
		// the border colour and draws without any class.
		themeCSS: `
			.face { stroke: ${c.border}; }
			.mouth, [stroke="#666"] { stroke: ${line}; }
			[fill="#666"] { fill: ${line}; }
			circle[stroke="#000"] { stroke: ${c.background}; }
			line[stroke="black"], .lineWrapper line { stroke: ${line}; }
			marker[id$="-arrowhead"] path, marker[id$="-arrowend"] path, marker[id$="-filled-head"] path { fill: ${line}; stroke: ${line}; }
			marker[id$="-crosshead"] path { stroke: ${line}; }
			.disabled, .disabled circle, .disabled text { fill: ${line}; }
			.node .katex path { fill: ${text}; stroke: ${text}; }
			.stateGroup .alt-composit { fill: ${c.muted}; }
			.commit-id, .commit-msg, .branch-label { fill: ${text}; color: ${text}; }
			circle.commit-cherry-pick[fill] { fill: ${c.background}; }
			line.commit-cherry-pick { stroke: ${c.background}; }
			rect[stroke="rgb(0,0,0, 0.5)"] { stroke: ${c.border}; }
			path[fill="${c.border}"] { fill: ${text}; }
			[stroke="#444444"], [stroke="#000000"] { stroke: ${line}; }
			path[fill="black"] { fill: ${line}; }
			text[fill="#444444"], text[fill="black"], .architecture-service text { fill: ${text}; paint-order: stroke; stroke: ${c.background}; stroke-width: 4px; stroke-linejoin: round; }
			.node-icon-text > div { color: ${text}; }
			.architecture-service [style*="#087ebf"], .architecture-groups [style*="#087ebf"] { fill: ${c.primary} !important; rx: 8px; ry: 8px; }
			.architecture-service [style*="stroke: #fff"], .architecture-groups [style*="stroke: #fff"] { stroke: ${onSeries} !important; }
			.architecture-groups rect.node-bkg { rx: 8px; ry: 8px; }
			${series
				.map(
					(color, index) =>
						`.node[id^="node-"]:nth-child(${series.length}n+${index + 1}) > rect:only-child { fill: ${color}; }`,
				)
				.join("\n")}
			[fill="white"] { fill: ${c.card}; }
			.wardley-stages line { stroke: ${line}; }
		`,
	} satisfies MermaidConfig

	return {
		config,
		c4Labels: { internal: onSeries, external: text } satisfies C4LabelColors,
	}
}

function applyTheme(mod: typeof import("mermaid"), dark: boolean) {
	const theme = buildMermaidTheme(dark)

	mod.default.initialize(theme.config)
	c4Labels = theme.c4Labels
	lastInitializedDark = dark
}

async function loadMermaid(dark: boolean) {
	if (mermaidModule.value) return
	if (loadPromise) {
		await loadPromise
		return
	}

	isLoading.value = true
	loadError.value = null

	loadPromise = import("mermaid")
		.then((mod) => {
			applyTheme(mod, dark)
			mermaidModule.value = mod
		})
		.catch((err: unknown) => {
			loadError.value = err instanceof Error ? err.message : null
			loadPromise = null
		})
		.finally(() => {
			isLoading.value = false
		})

	await loadPromise
}

export function useMermaid(dark: Ref<boolean>) {
	const { t } = useI18n({ useScope: "global" })

	void loadMermaid(dark.value)

	const render: RenderMermaid = async (id, source) => {
		await loadMermaid(dark.value)

		if (!mermaidModule.value) {
			return {
				error: loadError.value ?? t("editor.mermaid.errors.load-failed"),
			}
		}

		try {
			if (lastInitializedDark !== dark.value) {
				applyTheme(mermaidModule.value, dark.value)
			}

			const { svg } = await mermaidModule.value.default.render(id, source)

			return { svg: themeC4Labels(svg, c4Labels) }
		} catch (err: unknown) {
			return {
				error:
					err instanceof Error
						? err.message
						: t("editor.mermaid.errors.render-failed"),
			}
		}
	}

	return {
		render,
		isLoading: readonly(isLoading),
		loadError: readonly(loadError),
	}
}
