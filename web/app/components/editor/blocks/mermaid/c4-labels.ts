export interface C4LabelColors {
	internal: string
	external: string
}

// mermaid writes every C4 label colour inline with !important, which no
// stylesheet can override, so the rendered svg is rewritten instead. The
// label group carries `color` and each text element its own `fill`.
export function themeC4Labels(svg: string, colors: C4LabelColors): string {
	if (!svg.includes("c4-shape")) {
		return svg
	}

	const template = document.createElement("template")
	template.innerHTML = svg

	for (const shape of template.content.querySelectorAll(".c4-shape")) {
		const color = shape.classList.contains("c4-external")
			? colors.external
			: colors.internal

		for (const label of shape.querySelectorAll<SVGElement>(".label")) {
			label.style.setProperty("color", color, "important")
		}

		for (const text of shape.querySelectorAll<SVGElement>(".label text")) {
			text.style.setProperty("fill", color, "important")
		}
	}

	return template.innerHTML
}
