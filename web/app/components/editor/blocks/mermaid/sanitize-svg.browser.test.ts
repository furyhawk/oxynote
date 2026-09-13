import { describe, it } from "vitest"
import { sanitizeMermaidSvg } from "./sanitize-svg"

// the markup mermaid emits for a user journey section: an html label
// centred by inline styles, with a plain <text> fallback beside it
const sectionSvg = [
	"<svg><switch>",
	'<foreignObject x="0" y="0" width="150" height="50">',
	'<div style="display: table; height: 100%; width: 100%;">',
	'<div class="label" style="display: table-cell; text-align: center; vertical-align: middle;">Go to work</div>',
	"</div></foreignObject>",
	'<text x="75" y="25" dominant-baseline="central">Go to work</text>',
	"</switch></svg>",
].join("")

function sanitized(svg: string): HTMLElement {
	const host = document.createElement("div")
	host.innerHTML = sanitizeMermaidSvg(svg)

	return host
}

describe("sanitizeMermaidSvg", () => {
	it("keeps the html label and the inline styles that centre it", ({
		expect,
	}) => {
		const host = sanitized(sectionSvg)

		const label = host.querySelector<HTMLElement>("foreignObject div.label")
		expect(label?.textContent).toBe("Go to work")
		expect(label?.style.display).toBe("table-cell")
		expect(label?.style.textAlign).toBe("center")
		expect(label?.style.verticalAlign).toBe("middle")
		expect(label?.parentElement?.style.display).toBe("table")
		expect(host.querySelector("text")?.getAttribute("dominant-baseline")).toBe(
			"central",
		)
	})

	it("strips scripts and event handlers but keeps their surrounding text", ({
		expect,
	}) => {
		const host = sanitized(
			'<svg><foreignObject><div onclick="alert(1)">label</div></foreignObject>' +
				"<script>alert(2)</script><text>kept</text></svg>",
		)

		expect(host.innerHTML).not.toContain("alert")
		expect(host.querySelector("foreignObject div")?.textContent).toBe("label")
		expect(host.querySelector("text")?.textContent).toBe("kept")
	})
})
