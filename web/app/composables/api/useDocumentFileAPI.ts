export interface UploadedDocumentFile {
	name: string
	size: number
	contentType: string
}

// the address ends in "<block id>-<file name>" so it reads as the file it
// is; the server identifies the file by the fixed-length id alone
export function buildDocumentFileSrc(
	documentId: string,
	blockId: string,
	name: string,
): string {
	const { coreAPIBaseHttpURL } = useRuntimeConfig().public

	return `${coreAPIBaseHttpURL}/api/documents/${documentId}/files/${blockId}-${encodeURIComponent(name)}`
}

// isDocumentFileSrc reports whether src points at a document attachment
// core serves: "<base>/api/documents/<id>/files/<name>". Document content
// is untrusted, so a file card links nothing else.
export function isDocumentFileSrc(
	src: string,
	coreAPIBaseHttpURL: string,
): boolean {
	const prefix = `${coreAPIBaseHttpURL}/api/documents/`

	// compared as text, so the base, host included, must appear verbatim
	if (!src.startsWith(prefix)) {
		return false
	}

	// new URL() needs a base to parse a relative path. This placeholder is
	// never requested; only the parsed path is read.
	const base = "http://relative.invalid"

	// parsing resolves "..", backslashes and encoded dots, so a path that
	// passed the text check can still turn out to leave the prefix
	const expected = new URL(prefix, base).pathname
	const { pathname } = new URL(src, base)

	return (
		pathname.startsWith(expected) &&
		// exactly "<id>/files/<name>", nothing nested deeper
		/^[^/]+\/files\/[^/]+$/.test(pathname.slice(expected.length))
	)
}

export default function () {
	const { $coreAPIClient, $host } = useNuxtApp()

	const uploadDocumentFile = useMutation({
		mutation: async ({
			documentId,
			id,
			loc,
			kind,
			file,
		}: {
			documentId: string
			loc: DocumentFileLocation
			kind: DocumentFileKind
			id: string
			file: File
		}): Promise<UploadedDocumentFile> => {
			const body = new FormData()
			body.append("file", file)

			const response = await $coreAPIClient.raw<DocumentFileUpload>(
				`/api/documents/${documentId}/files?id=${encodeURIComponent(id)}&location=${loc}&kind=${kind}`,
				{
					method: "POST",
					body,
				},
			)
			const uploaded = response._data

			if (!uploaded) {
				throw new Error("missing upload response body")
			}

			return {
				name: uploaded.name,
				size: uploaded.size,
				contentType: uploaded.contentType,
			}
		},
	})

	// desktop only: the system browser holds no session, so main saves the
	// file itself, streaming it to where the user picks
	const downloadDocumentFile = useMutation({
		mutation: ({
			src,
			name,
			onProgress,
		}: {
			src: string
			name: string
			onProgress: (received: number, total: number) => void
		}) => {
			if (!$host) {
				throw new Error("desktop host bridge missing")
			}

			return $host.files.download(src, name, onProgress)
		},
	})

	return {
		uploadDocumentFile,
		downloadDocumentFile,
	}
}
