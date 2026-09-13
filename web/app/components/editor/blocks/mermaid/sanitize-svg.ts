import DOMPurify from "dompurify"

// mermaid draws html labels inside <foreignObject>, centred by inline
// styles on nested divs. DOMPurify only lets html elements below an svg
// parent through at a declared integration point; without it the divs
// are dropped and the bare text lands in the box's top-left corner.
export function sanitizeMermaidSvg(svg: string): string {
	return DOMPurify.sanitize(svg, {
		USE_PROFILES: { html: true, svg: true, svgFilters: true },
		ADD_TAGS: ["foreignObject"],
		ADD_ATTR: ["dominant-baseline"],
		HTML_INTEGRATION_POINTS: { foreignobject: true },
	})
}
