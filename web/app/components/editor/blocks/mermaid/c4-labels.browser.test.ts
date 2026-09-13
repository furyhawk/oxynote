import { describe, it } from "vitest"
import { themeC4Labels } from "./c4-labels"

// rgb form, because the CSSOM hands inline colours back normalised
const colors = { internal: "rgb(192, 0, 11)", external: "rgb(0, 0, 2)" }

// the markup mermaid emits for one C4 element: the shape fill inline, the
// label group's colour inline and every text's fill inline, all !important
function shape(classes: string, name: string): string {
	return [
		`<g class="node c4-shape ${classes}" id="${name}">`,
		'<g class="basic label-container"><rect style="fill:#2563eb !important;stroke:#2563eb !important"></rect></g>',
		'<g class="label" style="color:#FFFFFF !important">',
		'<rect class="background" style="stroke: none"></rect>',
		`<g class="c4-name"><text style="fill:#FFFFFF !important"><tspan>${name}</tspan></text></g>`,
		'<g class="c4-type"><text style="fill:#FFFFFF !important"><tspan>[Person]</tspan></text></g>',
		"</g></g>",
	].join("")
}

function parse(svg: string): HTMLElement {
	const host = document.createElement("div")
	host.innerHTML = svg

	return host
}

describe("themeC4Labels", () => {
	it("recolours internal and external labels with their own colours", ({
		expect,
	}) => {
		const host = parse(
			themeC4Labels(
				`<svg>${shape("c4-person", "Customer")}${shape("c4-external_person c4-external", "Admin")}</svg>`,
				colors,
			),
		)

		const internal = host.querySelector<SVGElement>("#Customer .label")
		const external = host.querySelector<SVGElement>("#Admin .label")
		expect(internal?.style.getPropertyValue("color")).toBe(colors.internal)
		expect(internal?.style.getPropertyPriority("color")).toBe("important")
		expect(external?.style.getPropertyValue("color")).toBe(colors.external)
		expect(
			[...host.querySelectorAll<SVGElement>("#Customer .label text")].map(
				(text) => text.style.getPropertyValue("fill"),
			),
		).toEqual([colors.internal, colors.internal])
		expect(
			[...host.querySelectorAll<SVGElement>("#Admin .label text")].map((text) =>
				text.style.getPropertyValue("fill"),
			),
		).toEqual([colors.external, colors.external])
	})

	it("leaves the shape fill and the label's background rect alone", ({
		expect,
	}) => {
		const host = parse(
			themeC4Labels(`<svg>${shape("c4-person", "Customer")}</svg>`, colors),
		)

		expect(
			host
				.querySelector<SVGElement>(".label-container rect")
				?.style.getPropertyValue("fill"),
		).toBe("rgb(37, 99, 235)")
		expect(
			host
				.querySelector<SVGElement>(".label rect.background")
				?.getAttribute("style"),
		).toBe("stroke: none")
	})

	it("returns any other diagram untouched", ({ expect }) => {
		const svg =
			'<svg><g class="node"><text style="fill:#FFFFFF">A</text></g></svg>'

		expect(themeC4Labels(svg, colors)).toBe(svg)
	})
})
