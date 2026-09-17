import { app, BrowserWindow, dialog, ipcMain, net } from "electron"
import type { IpcMainInvokeEvent, SaveDialogOptions } from "electron"
import { createWriteStream } from "node:fs"
import { unlink } from "node:fs/promises"
import path from "node:path"
import { Readable, Transform } from "node:stream"
import { pipeline } from "node:stream/promises"
import type { ReadableStream as NodeReadableStream } from "node:stream/web"
import { authClient } from "./auth-client"

export type FileDownloadResult = "completed" | "cancelled"

interface FileDownloadRequest {
	id: number
	url: string
	name: string
}

// the address core serves a document's attachment under, whatever path
// prefix the front door mounts core at
const DOCUMENT_FILE_PATH = /\/api\/documents\/[^/]+\/files\/[^/]+$/

// progress reaches the renderer at most this often; the final count is
// always sent
const PROGRESS_INTERVAL_MS = 100

// registerFileDownloadIpcHandler lets the renderer save a document's
// attachment without holding it: main asks where to save, then streams
// the response to disk and reports progress. Only attachments on the api
// origin are fetched, since the request carries the session cookie.
export function registerFileDownloadIpcHandler(apiOrigin: string) {
	ipcMain.handle(
		"file:download",
		(event, request: unknown): Promise<FileDownloadResult> =>
			download(event, request, apiOrigin),
	)
}

async function download(
	event: IpcMainInvokeEvent,
	request: unknown,
	apiOrigin: string,
): Promise<FileDownloadResult> {
	if (!isFileDownloadRequest(request, apiOrigin)) {
		throw new Error("refused to download a file outside the api")
	}

	const options: SaveDialogOptions = {
		defaultPath: path.join(app.getPath("downloads"), fileName(request.name)),
	}
	const parent = BrowserWindow.fromWebContents(event.sender)
	const { canceled, filePath } = parent
		? await dialog.showSaveDialog(parent, options)
		: await dialog.showSaveDialog(options)

	if (canceled || !filePath) {
		return "cancelled"
	}

	const cookie = authClient.getCookie().replace(/^;\s*/, "")
	const response = await net.fetch(request.url, {
		headers: cookie ? { Cookie: cookie } : {},
	})

	if (!response.ok || !response.body) {
		throw new Error(`file download failed with status ${response.status}`)
	}

	const total = Number(response.headers.get("content-length")) || 0
	let received = 0
	let reportedAt = 0

	const report = () => {
		if (!event.sender.isDestroyed()) {
			event.sender.send("file:download-progress", request.id, received, total)
		}
	}

	const counter = new Transform({
		transform(chunk: Buffer, _encoding, done) {
			received += chunk.length

			const now = Date.now()
			if (now - reportedAt >= PROGRESS_INTERVAL_MS) {
				reportedAt = now
				report()
			}

			done(null, chunk)
		},
	})

	try {
		await pipeline(
			Readable.fromWeb(response.body as NodeReadableStream),
			counter,
			createWriteStream(filePath),
		)
	} catch (error) {
		// a partial file at the chosen path would pass for the real one
		await unlink(filePath).catch(() => undefined)
		throw error
	}

	report()

	return "completed"
}

function isFileDownloadRequest(
	request: unknown,
	apiOrigin: string,
): request is FileDownloadRequest {
	if (typeof request !== "object" || request === null) {
		return false
	}

	const { id, url, name } = request as Record<string, unknown>
	if (
		typeof id !== "number" ||
		typeof url !== "string" ||
		typeof name !== "string"
	) {
		return false
	}

	try {
		const parsed = new URL(url)

		return (
			parsed.origin === apiOrigin && DOCUMENT_FILE_PATH.test(parsed.pathname)
		)
	} catch {
		return false
	}
}

// the name comes from document content, so only its last segment may
// reach the save dialog
function fileName(name: string): string {
	return path.basename(name.replaceAll("\\", "/")) || "download"
}
