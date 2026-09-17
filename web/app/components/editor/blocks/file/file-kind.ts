// the visual family a file belongs to: what icon and accent the card
// shows, decided by extension first and content type second
export type FileKind =
	| "pdf"
	| "video"
	| "audio"
	| "image"
	| "archive"
	| "text"
	| "code"
	| "document"
	| "spreadsheet"
	| "presentation"
	| "generic"

// FileKindTint is how a kind's colour lands on the card's icon badge.
// Light and dark each tint it differently, so both are derived together
// and handed to css as custom properties.
interface FileKindTint {
	lightBg: string
	lightFg: string
	darkBg: string
	darkFg: string
}

export interface FileKindStyle {
	icon: string
	// the generic kind carries no tint and stays neutral
	tint?: FileKindTint
}

const EXTENSION_KINDS: Record<string, FileKind> = {
	pdf: "pdf",
	mp4: "video",
	webm: "video",
	mov: "video",
	mkv: "video",
	avi: "video",
	m4v: "video",
	mp3: "audio",
	wav: "audio",
	ogg: "audio",
	m4a: "audio",
	flac: "audio",
	aac: "audio",
	png: "image",
	jpg: "image",
	jpeg: "image",
	gif: "image",
	webp: "image",
	svg: "image",
	bmp: "image",
	tif: "image",
	tiff: "image",
	heic: "image",
	zip: "archive",
	tar: "archive",
	gz: "archive",
	tgz: "archive",
	bz2: "archive",
	xz: "archive",
	"7z": "archive",
	rar: "archive",
	txt: "text",
	md: "text",
	markdown: "text",
	rtf: "text",
	log: "text",
	js: "code",
	mjs: "code",
	cjs: "code",
	ts: "code",
	jsx: "code",
	tsx: "code",
	vue: "code",
	go: "code",
	py: "code",
	rb: "code",
	rs: "code",
	java: "code",
	kt: "code",
	swift: "code",
	c: "code",
	h: "code",
	cpp: "code",
	cs: "code",
	php: "code",
	sh: "code",
	json: "code",
	yaml: "code",
	yml: "code",
	toml: "code",
	xml: "code",
	html: "code",
	css: "code",
	sql: "code",
	csv: "code",
	doc: "document",
	docx: "document",
	odt: "document",
	pages: "document",
	xls: "spreadsheet",
	xlsx: "spreadsheet",
	ods: "spreadsheet",
	numbers: "spreadsheet",
	ppt: "presentation",
	pptx: "presentation",
	odp: "presentation",
	key: "presentation",
}

const CONTENT_TYPE_KINDS: Record<string, FileKind> = {
	"application/pdf": "pdf",
	"application/zip": "archive",
	"application/gzip": "archive",
	"application/x-gzip": "archive",
	"application/x-tar": "archive",
	"application/x-bzip2": "archive",
	"application/x-xz": "archive",
	"application/x-7z-compressed": "archive",
	"application/x-rar-compressed": "archive",
	"application/vnd.rar": "archive",
	"text/plain": "text",
	"text/markdown": "text",
	"text/rtf": "text",
	"application/rtf": "text",
	"application/json": "code",
	"application/xml": "code",
	"application/javascript": "code",
	"text/javascript": "code",
	"application/msword": "document",
}

// tint takes one of the theme's selectable colours by its slot: 13%
// behind darkened text in light mode, 18% behind lightened text in dark
function tint(slot: number): FileKindTint {
	const color = `var(--selectable-color-${slot})`

	return {
		lightBg: `color-mix(in srgb, ${color} 13%, transparent)`,
		lightFg: `color-mix(in srgb, ${color} 80%, black)`,
		darkBg: `color-mix(in srgb, ${color} 18%, transparent)`,
		darkFg: `color-mix(in srgb, ${color} 60%, white)`,
	}
}

const FILE_KIND_STYLES: Record<FileKind, FileKindStyle> = {
	pdf: { icon: "mingcute:pdf-fill", tint: tint(1) },
	video: { icon: "mingcute:video-fill", tint: tint(14) },
	audio: { icon: "mingcute:file-music-fill", tint: tint(16) },
	image: { icon: "mingcute:pic-fill", tint: tint(5) },
	archive: { icon: "mingcute:file-zip-fill", tint: tint(4) },
	text: { icon: "mingcute:document-fill", tint: tint(9) },
	code: { icon: "mingcute:file-code-fill", tint: tint(12) },
	document: { icon: "mingcute:doc-fill", tint: tint(11) },
	spreadsheet: { icon: "mingcute:xls-fill", tint: tint(7) },
	presentation: { icon: "mingcute:ppt-fill", tint: tint(2) },
	generic: { icon: "mingcute:file-fill" },
}

// the types a browser renders rather than runs, mirrored from the
// server's allowlist: the server serves these inline and the card opens
// them in a new tab, everything else is a download
const VIEWABLE_TYPES = new Set([
	"application/pdf",
	"image/png",
	"image/jpeg",
	"image/gif",
	"image/webp",
	"text/plain",
])

function mediaType(contentType: string | null | undefined): string {
	return (contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? ""
}

function extension(name: string | null | undefined): string {
	const trimmed = (name ?? "").trim()
	const dot = trimmed.lastIndexOf(".")

	if (dot <= 0 || dot === trimmed.length - 1) {
		return ""
	}

	return trimmed.slice(dot + 1).toLowerCase()
}

export function fileKind(
	name: string | null | undefined,
	contentType: string | null | undefined,
): FileKind {
	const byExtension = EXTENSION_KINDS[extension(name)]

	if (byExtension) {
		return byExtension
	}

	const type = mediaType(contentType)
	const byType = CONTENT_TYPE_KINDS[type]

	if (byType) {
		return byType
	}

	if (type.startsWith("video/")) {
		return "video"
	}

	if (type.startsWith("audio/")) {
		return "audio"
	}

	if (type.startsWith("image/")) {
		return "image"
	}

	if (type.startsWith("text/")) {
		return "code"
	}

	// the office families by their OOXML, OpenDocument and legacy
	// Microsoft types, templates and macro-enabled variants included
	if (
		type.includes("wordprocessingml") ||
		type.includes("opendocument.text") ||
		type.startsWith("application/vnd.ms-word")
	) {
		return "document"
	}

	if (
		type.includes("spreadsheetml") ||
		type.includes("opendocument.spreadsheet") ||
		type.startsWith("application/vnd.ms-excel")
	) {
		return "spreadsheet"
	}

	if (
		type.includes("presentationml") ||
		type.includes("opendocument.presentation") ||
		type.startsWith("application/vnd.ms-powerpoint")
	) {
		return "presentation"
	}

	return "generic"
}

export function fileKindStyle(kind: FileKind): FileKindStyle {
	return FILE_KIND_STYLES[kind]
}

export function isViewable(contentType: string | null | undefined): boolean {
	const type = mediaType(contentType)

	return (
		VIEWABLE_TYPES.has(type) ||
		type.startsWith("video/") ||
		type.startsWith("audio/")
	)
}

// one decimal, dropped when it is zero: "2 KB" rather than "2.0 KB"
function oneDecimal(value: number): string {
	return value.toFixed(1).replace(/\.0$/, "")
}

export function formatFileSize(bytes: number | null | undefined): string {
	if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) {
		return ""
	}

	if (bytes < 1024) {
		return `${bytes} B`
	}

	const kb = bytes / 1024

	if (kb < 1024) {
		return `${oneDecimal(kb)} KB`
	}

	return `${oneDecimal(kb / 1024)} MB`
}
