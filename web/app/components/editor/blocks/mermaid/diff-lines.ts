import {
	TextSegmentKind,
	type TextSegment,
} from "~/components/editor/diff/change-count"

const INDENT_RE = /^[ \t]*/

export interface DiffLine {
	// the line's number in the new text. Null for a line that holds only
	// removed text, since the new text has no such line.
	number: number | null
	segments: TextSegment[]
	changed: boolean
}

// split the segments of a diffed text into lines. A newline inside removed
// text is gone from the new text, so it does not move the numbering on.
export function diffLines(segments: TextSegment[]): DiffLine[] {
	let number = 1
	const lines: DiffLine[] = [{ number: number, segments: [], changed: false }]

	for (const segment of segments) {
		for (const [index, text] of segment.text.split("\n").entries()) {
			if (index > 0) {
				// a newline that was added or removed changes the line it ends
				const ended = lines[lines.length - 1]
				if (ended && segment.kind !== TextSegmentKind.Equal) {
					ended.changed = true
				}

				if (segment.kind !== TextSegmentKind.Removed) {
					number++
				}

				lines.push({ number: number, segments: [], changed: false })
			}

			const line = lines[lines.length - 1]
			if (line && text) {
				line.segments.push({ kind: segment.kind, text: text })
				line.changed ||= segment.kind !== TextSegmentKind.Equal
			}
		}
	}

	for (const line of lines) {
		const onlyRemoved =
			line.segments.length > 0 &&
			line.segments.every((s) => s.kind === TextSegmentKind.Removed)
		if (onlyRemoved) {
			line.number = null
		}
	}

	return lines
}

// strip the indentation all lines share, so a snippet from deep inside the
// code starts at the left edge. Only unchanged text counts as indentation,
// so a changed indent still shows. An empty line has no say.
export function dedentLines<T extends DiffLine>(lines: T[]): T[] {
	const indents = lines
		.filter((line) => line.segments.length > 0)
		.map((line) => {
			const first = line.segments[0]

			return first?.kind === TextSegmentKind.Equal
				? (INDENT_RE.exec(first.text)?.[0].length ?? 0)
				: 0
		})
	const shared = indents.length > 0 ? Math.min(...indents) : 0
	if (shared === 0) {
		return lines
	}

	return lines.map((line) => {
		const [first, ...rest] = line.segments
		if (!first) {
			return line
		}

		const text = first.text.slice(shared)

		return {
			...line,
			segments: text ? [{ ...first, text: text }, ...rest] : rest,
		}
	})
}
