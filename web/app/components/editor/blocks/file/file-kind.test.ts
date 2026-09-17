import { describe, it } from "vitest"
import {
	fileKind,
	fileKindStyle,
	formatFileSize,
	isViewable,
} from "./file-kind"

describe("fileKind", () => {
	it.for([
		{ name: "report.pdf", contentType: null, expected: "pdf" },
		{ name: "clip.mp4", contentType: null, expected: "video" },
		{ name: "clip.MOV", contentType: null, expected: "video" },
		{ name: "song.mp3", contentType: null, expected: "audio" },
		{ name: "photo.jpeg", contentType: null, expected: "image" },
		{ name: "logo.svg", contentType: null, expected: "image" },
		{ name: "notes.zip", contentType: null, expected: "archive" },
		{ name: "site.tar.gz", contentType: null, expected: "archive" },
		{ name: "backup.7z", contentType: null, expected: "archive" },
		{ name: "README.md", contentType: null, expected: "text" },
		{ name: "notes.txt", contentType: null, expected: "text" },
		{ name: "main.go", contentType: null, expected: "code" },
		{ name: "config.yaml", contentType: null, expected: "code" },
		{ name: "data.csv", contentType: null, expected: "code" },
		{ name: "letter.doc", contentType: null, expected: "document" },
		{ name: "letter.odt", contentType: null, expected: "document" },
		{ name: "sheet.xlsx", contentType: null, expected: "spreadsheet" },
		{ name: "budget.ods", contentType: null, expected: "spreadsheet" },
		{ name: "deck.pptx", contentType: null, expected: "presentation" },
		{ name: "slides.odp", contentType: null, expected: "presentation" },
		{ name: "talk.key", contentType: null, expected: "presentation" },
		{ name: "thing.unknown", contentType: null, expected: "generic" },
		{ name: "noextension", contentType: null, expected: "generic" },
		{ name: ".gitignore", contentType: null, expected: "generic" },
		{ name: "trailingdot.", contentType: null, expected: "generic" },
	])(
		"classifies $name by its extension as $expected",
		({ name, contentType, expected }, { expect }) => {
			expect(fileKind(name, contentType)).toBe(expected)
		},
	)

	it.for([
		{ contentType: "application/pdf", expected: "pdf" },
		{ contentType: "video/webm", expected: "video" },
		{ contentType: "audio/ogg; codecs=opus", expected: "audio" },
		{ contentType: "image/heic", expected: "image" },
		{ contentType: "application/zip", expected: "archive" },
		{ contentType: "application/x-tar", expected: "archive" },
		{ contentType: "text/plain; charset=utf-8", expected: "text" },
		{ contentType: "text/markdown", expected: "text" },
		{ contentType: "application/json", expected: "code" },
		{ contentType: "text/html; charset=utf-8", expected: "code" },
		{ contentType: "application/msword", expected: "document" },
		{
			contentType:
				"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
			expected: "document",
		},
		{
			contentType: "application/vnd.ms-word.document.macroEnabled.12",
			expected: "document",
		},
		{
			contentType: "application/vnd.oasis.opendocument.text",
			expected: "document",
		},
		{ contentType: "application/vnd.ms-excel", expected: "spreadsheet" },
		{
			contentType:
				"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			expected: "spreadsheet",
		},
		{
			contentType: "application/vnd.oasis.opendocument.spreadsheet-template",
			expected: "spreadsheet",
		},
		{ contentType: "application/vnd.ms-powerpoint", expected: "presentation" },
		{
			contentType:
				"application/vnd.openxmlformats-officedocument.presentationml.presentation",
			expected: "presentation",
		},
		{
			contentType: "application/vnd.oasis.opendocument.presentation",
			expected: "presentation",
		},
		{
			contentType: "application/vnd.oasis.opendocument.graphics",
			expected: "generic",
		},
		{ contentType: "application/octet-stream", expected: "generic" },
		{ contentType: "", expected: "generic" },
		{ contentType: null, expected: "generic" },
	])(
		"falls back to the content type $contentType as $expected",
		({ contentType, expected }, { expect }) => {
			expect(fileKind("thing", contentType)).toBe(expected)
		},
	)

	it("lets the extension win over the content type", ({ expect }) => {
		expect(fileKind("report.pdf", "application/octet-stream")).toBe("pdf")
	})

	it("classifies a missing name by the content type", ({ expect }) => {
		expect(fileKind(null, "application/pdf")).toBe("pdf")
	})
})

describe("fileKindStyle", () => {
	it("gives every kind its own icon and selectable colour", ({ expect }) => {
		const kinds = [
			"pdf",
			"video",
			"audio",
			"image",
			"archive",
			"text",
			"code",
			"document",
			"spreadsheet",
			"presentation",
			"generic",
		] as const
		const styles = kinds.map((kind) => fileKindStyle(kind))
		const tints = styles.flatMap((style) => style.tint ?? [])

		expect(new Set(styles.map((style) => style.icon)).size).toBe(kinds.length)
		expect(styles.every((style) => style.icon.startsWith("mingcute:"))).toBe(
			true,
		)
		expect(tints).toHaveLength(kinds.length - 1)
		expect(new Set(tints.map((tint) => tint.lightBg)).size).toBe(tints.length)
		expect(
			tints.every((tint) => tint.lightBg.includes("var(--selectable-color-")),
		).toBe(true)
	})

	it("tints a kind's colour for both modes", ({ expect }) => {
		expect(fileKindStyle("pdf").tint).toEqual({
			lightBg: "color-mix(in srgb, var(--selectable-color-1) 13%, transparent)",
			lightFg: "color-mix(in srgb, var(--selectable-color-1) 80%, black)",
			darkBg: "color-mix(in srgb, var(--selectable-color-1) 18%, transparent)",
			darkFg: "color-mix(in srgb, var(--selectable-color-1) 60%, white)",
		})
	})

	it("styles the generic kind as a plain, uncoloured file", ({ expect }) => {
		expect(fileKindStyle("generic")).toEqual({ icon: "mingcute:file-fill" })
	})
})

describe("isViewable", () => {
	it.for([
		{ contentType: "application/pdf", expected: true },
		{ contentType: "image/png", expected: true },
		{ contentType: "image/jpeg", expected: true },
		{ contentType: "image/gif", expected: true },
		{ contentType: "image/webp", expected: true },
		{ contentType: "video/mp4", expected: true },
		{ contentType: "audio/mpeg", expected: true },
		{ contentType: "text/plain; charset=utf-8", expected: true },
		{ contentType: "text/html; charset=utf-8", expected: false },
		{ contentType: "image/svg+xml", expected: false },
		{ contentType: "text/xml", expected: false },
		{ contentType: "text/javascript", expected: false },
		{ contentType: "application/zip", expected: false },
		{ contentType: "", expected: false },
		{ contentType: null, expected: false },
	])(
		"reports $contentType as viewable: $expected",
		({ contentType, expected }, { expect }) => {
			expect(isViewable(contentType)).toBe(expected)
		},
	)
})

describe("formatFileSize", () => {
	it.for([
		{ input: 0, expected: "0 B" },
		{ input: 512, expected: "512 B" },
		{ input: 1023, expected: "1023 B" },
		{ input: 1024, expected: "1 KB" },
		{ input: 1536, expected: "1.5 KB" },
		{ input: 2_516_582, expected: "2.4 MB" },
		{ input: 26_214_400, expected: "25 MB" },
		{ input: 1_048_576, expected: "1 MB" },
	])("formats $input bytes as $expected", ({ input, expected }, { expect }) => {
		expect(formatFileSize(input)).toBe(expected)
	})

	it.for([
		{ name: "a negative size", input: -1 },
		{ name: "an infinite size", input: Number.POSITIVE_INFINITY },
		{ name: "a missing size", input: null },
		{ name: "an undefined size", input: undefined },
	])("formats $name as nothing", ({ input }, { expect }) => {
		expect(formatFileSize(input)).toBe("")
	})
})
