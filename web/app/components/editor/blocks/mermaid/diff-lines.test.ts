import { describe, it } from "vitest"
import { dedentLines, diffLines } from "./diff-lines"
import { TextSegmentKind } from "~/components/editor/diff/change-count"

const { Equal, Removed, Added } = TextSegmentKind

describe("diffLines", () => {
	it("splits segments into numbered lines and flags the changed ones", ({
		expect,
	}) => {
		const lines = diffLines([
			{ kind: Equal, text: "graph TD\nA-->" },
			{ kind: Removed, text: "B" },
			{ kind: Added, text: "C" },
			{ kind: Equal, text: "\nC-->D" },
		])

		expect(lines).toEqual([
			{
				number: 1,
				changed: false,
				segments: [{ kind: Equal, text: "graph TD" }],
			},
			{
				number: 2,
				changed: true,
				segments: [
					{ kind: Equal, text: "A-->" },
					{ kind: Removed, text: "B" },
					{ kind: Added, text: "C" },
				],
			},
			{ number: 3, changed: false, segments: [{ kind: Equal, text: "C-->D" }] },
		])
	})

	it("leaves a line of only removed text unnumbered", ({ expect }) => {
		const lines = diffLines([
			{ kind: Equal, text: "graph TD" },
			{ kind: Removed, text: "\nA-->B" },
			{ kind: Equal, text: "\nB-->C" },
		])

		expect(lines.map((line) => [line.number, line.changed])).toEqual([
			[1, true],
			[null, true],
			[2, false],
		])
	})

	it("numbers an added line by its place in the new text", ({ expect }) => {
		const lines = diffLines([
			{ kind: Equal, text: "graph TD" },
			{ kind: Added, text: "\nA-->B" },
		])

		expect(lines.map((line) => [line.number, line.changed])).toEqual([
			[1, true],
			[2, true],
		])
	})

	it("flags the line whose newline was removed", ({ expect }) => {
		const lines = diffLines([
			{ kind: Equal, text: "A-->B" },
			{ kind: Removed, text: "\n" },
			{ kind: Equal, text: "B-->C" },
		])

		expect(lines.map((line) => [line.number, line.changed])).toEqual([
			[1, true],
			[1, false],
		])
	})
})

describe("dedentLines", () => {
	it("strips the indentation every line shares", ({ expect }) => {
		const lines = dedentLines(
			diffLines([
				{ kind: Equal, text: "    B-->" },
				{ kind: Removed, text: "C" },
				{ kind: Equal, text: "\n      D-->" },
				{ kind: Added, text: "E" },
			]),
		)

		expect(lines.map((line) => line.segments)).toEqual([
			[
				{ kind: Equal, text: "B-->" },
				{ kind: Removed, text: "C" },
			],
			[
				{ kind: Equal, text: "  D-->" },
				{ kind: Added, text: "E" },
			],
		])
	})

	it("keeps an indent that is itself a change", ({ expect }) => {
		const lines = diffLines([
			{ kind: Equal, text: "    B-->C\n" },
			{ kind: Added, text: "    D-->E" },
		])

		expect(dedentLines(lines)).toEqual(lines)
	})

	it("ignores empty lines when finding the shared indent", ({ expect }) => {
		const lines = dedentLines(
			diffLines([
				{ kind: Equal, text: "    A" },
				{ kind: Added, text: "\n" },
				{ kind: Equal, text: "\n    B" },
			]),
		)

		expect(lines.map((line) => line.segments)).toEqual([
			[{ kind: Equal, text: "A" }],
			[],
			[{ kind: Equal, text: "B" }],
		])
	})

	it("drops a segment that was only indentation", ({ expect }) => {
		const lines = dedentLines(
			diffLines([
				{ kind: Equal, text: "  " },
				{ kind: Added, text: "A" },
			]),
		)

		expect(lines.map((line) => line.segments)).toEqual([
			[{ kind: Added, text: "A" }],
		])
	})
})
