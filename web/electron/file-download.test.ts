import path from "node:path"
import { Writable } from "node:stream"
import { beforeEach, describe, it, vi } from "vitest"
import { registerFileDownloadIpcHandler } from "./file-download"

const mocks = vi.hoisted(() => ({
	ipcHandle: vi.fn(),
	getPath: vi.fn(),
	fromWebContents: vi.fn(),
	showSaveDialog: vi.fn(),
	netFetch: vi.fn(),
	createWriteStream: vi.fn(),
	unlink: vi.fn(),
	getCookie: vi.fn(),
}))

vi.mock("electron", () => ({
	app: { getPath: mocks.getPath },
	BrowserWindow: { fromWebContents: mocks.fromWebContents },
	dialog: { showSaveDialog: mocks.showSaveDialog },
	ipcMain: { handle: mocks.ipcHandle },
	net: { fetch: mocks.netFetch },
}))

vi.mock("node:fs", () => ({ createWriteStream: mocks.createWriteStream }))

vi.mock("node:fs/promises", () => ({ unlink: mocks.unlink }))

vi.mock("./auth-client", () => ({
	authClient: { getCookie: mocks.getCookie },
}))

const API_ORIGIN = "http://test.local"
const FILE_URL = `${API_ORIGIN}/core/api/documents/doc-1/files/file-1-notes.zip`
const DOWNLOADS = "/home/me/Downloads"
const PARENT_WINDOW = { marker: "window" }

type Handler = (event: unknown, request: unknown) => Promise<unknown>

function registeredHandler(): Handler {
	registerFileDownloadIpcHandler(API_ORIGIN)

	const call = mocks.ipcHandle.mock.calls[0] as [string, Handler] | undefined

	if (!call) {
		throw new Error("no ipc handler was registered")
	}

	return call[1]
}

function makeSender(destroyed = false) {
	return { isDestroyed: vi.fn(() => destroyed), send: vi.fn() }
}

// a response whose body arrives as the given chunks, so the progress
// reports can be counted per chunk
function chunkedResponse(chunks: string[], headers: Record<string, string>) {
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			for (const chunk of chunks) {
				controller.enqueue(new TextEncoder().encode(chunk))
			}

			controller.close()
		},
	})

	return new Response(body, { headers })
}

// a write stream that keeps what it is given, or fails on the first write
function memoryWriteStream(failure?: Error) {
	const written: Buffer[] = []
	const stream = new Writable({
		write(chunk: Buffer, _encoding, done) {
			if (failure) {
				done(failure)
				return
			}

			written.push(chunk)
			done()
		},
	})

	return { stream, written }
}

function request(overrides: Record<string, unknown> = {}) {
	return { id: 7, url: FILE_URL, name: "notes.zip", ...overrides }
}

// sequential by exception: every test accounts calls on the vi.mock
// singletons, which cannot be isolated across interleaving tests
describe("registerFileDownloadIpcHandler", { concurrent: false }, () => {
	beforeEach(() => {
		for (const mock of Object.values(mocks)) {
			mock.mockReset()
		}

		mocks.getPath.mockReturnValue(DOWNLOADS)
		mocks.fromWebContents.mockReturnValue(PARENT_WINDOW)
		mocks.showSaveDialog.mockResolvedValue({
			canceled: false,
			filePath: "/tmp/notes.zip",
		})
		mocks.netFetch.mockResolvedValue(
			chunkedResponse(["zipped"], { "content-length": "6" }),
		)
		mocks.unlink.mockResolvedValue(undefined)
		mocks.getCookie.mockReturnValue("; auth.session=abc")
	})

	it("registers the download channel", ({ expect }) => {
		registerFileDownloadIpcHandler(API_ORIGIN)

		expect(mocks.ipcHandle).toHaveBeenCalledExactlyOnceWith(
			"file:download",
			expect.any(Function),
		)
	})

	it.for([
		{
			name: "an attachment on another origin",
			input: request({
				url: "https://files.example.net/core/api/documents/doc-1/files/file-1-q3.exe",
			}),
		},
		{
			name: "an api path that is no attachment",
			input: request({ url: `${API_ORIGIN}/core/api/documents/doc-1` }),
		},
		{
			name: "a path climbing out of the attachment",
			input: request({
				url: `${API_ORIGIN}/core/api/documents/doc-1/files/../../../users/me`,
			}),
		},
		{ name: "an unparsable address", input: request({ url: "http://[" }) },
		{ name: "a request without an id", input: request({ id: undefined }) },
		{ name: "a request without a name", input: request({ name: 3 }) },
		{ name: "a missing request", input: null },
	])("refuses $name", async ({ input }, { expect }) => {
		const handler = registeredHandler()

		await expect(handler({ sender: makeSender() }, input)).rejects.toThrow(
			"refused to download a file outside the api",
		)

		expect(mocks.showSaveDialog).toHaveBeenCalledTimes(0)
		expect(mocks.netFetch).toHaveBeenCalledTimes(0)
		expect(mocks.createWriteStream).toHaveBeenCalledTimes(0)
	})

	it("fetches nothing when the save dialog is dismissed", async ({
		expect,
	}) => {
		mocks.showSaveDialog.mockResolvedValue({ canceled: true, filePath: "" })
		const handler = registeredHandler()
		const sender = makeSender()

		await expect(handler({ sender }, request())).resolves.toBe("cancelled")

		expect(mocks.showSaveDialog).toHaveBeenCalledTimes(1)
		expect(mocks.netFetch).toHaveBeenCalledTimes(0)
		expect(mocks.createWriteStream).toHaveBeenCalledTimes(0)
		expect(sender.send).toHaveBeenCalledTimes(0)
	})

	it("streams the attachment to the chosen path with the session cookie", async ({
		expect,
	}) => {
		const { stream, written } = memoryWriteStream()
		mocks.createWriteStream.mockReturnValue(stream)
		const handler = registeredHandler()
		const sender = makeSender()

		const result = await handler({ sender }, request())

		expect(result).toBe("completed")
		expect.soft(mocks.fromWebContents).toHaveBeenCalledExactlyOnceWith(sender)
		expect
			.soft(mocks.showSaveDialog)
			.toHaveBeenCalledExactlyOnceWith(PARENT_WINDOW, {
				defaultPath: path.join(DOWNLOADS, "notes.zip"),
			})
		expect.soft(mocks.getPath).toHaveBeenCalledExactlyOnceWith("downloads")
		expect.soft(mocks.netFetch).toHaveBeenCalledExactlyOnceWith(FILE_URL, {
			headers: { Cookie: "auth.session=abc" },
		})
		expect
			.soft(mocks.createWriteStream)
			.toHaveBeenCalledExactlyOnceWith("/tmp/notes.zip")
		expect.soft(Buffer.concat(written).toString()).toBe("zipped")
		expect
			.soft(sender.send)
			.toHaveBeenLastCalledWith("file:download-progress", 7, 6, 6)
		expect.soft(mocks.unlink).toHaveBeenCalledTimes(0)
	})

	it("opens an unparented save dialog when the sender has no window", async ({
		expect,
	}) => {
		mocks.fromWebContents.mockReturnValue(null)
		mocks.createWriteStream.mockReturnValue(memoryWriteStream().stream)
		const handler = registeredHandler()

		await handler({ sender: makeSender() }, request())

		expect(mocks.showSaveDialog).toHaveBeenCalledExactlyOnceWith({
			defaultPath: path.join(DOWNLOADS, "notes.zip"),
		})
	})

	it.for([
		{ input: "../../secrets/notes.zip", expected: "notes.zip" },
		{ input: "..\\..\\secrets\\notes.zip", expected: "notes.zip" },
		{ input: "", expected: "download" },
	])(
		"suggests $expected for the name $input",
		async ({ input, expected }, { expect }) => {
			mocks.showSaveDialog.mockResolvedValue({ canceled: true, filePath: "" })
			const handler = registeredHandler()

			await handler({ sender: makeSender() }, request({ name: input }))

			expect(mocks.showSaveDialog).toHaveBeenCalledExactlyOnceWith(
				PARENT_WINDOW,
				{ defaultPath: path.join(DOWNLOADS, expected) },
			)
		},
	)

	it("sends no cookie without a session", async ({ expect }) => {
		mocks.getCookie.mockReturnValue("; ")
		mocks.createWriteStream.mockReturnValue(memoryWriteStream().stream)
		const handler = registeredHandler()

		await handler({ sender: makeSender() }, request())

		expect(mocks.netFetch).toHaveBeenCalledExactlyOnceWith(FILE_URL, {
			headers: {},
		})
	})

	it("reports progress at most once per interval and always at the end", async ({
		expect,
	}) => {
		vi.spyOn(Date, "now").mockReturnValue(1_000)
		mocks.netFetch.mockResolvedValue(
			chunkedResponse(["zip", "ped"], { "content-length": "6" }),
		)
		mocks.createWriteStream.mockReturnValue(memoryWriteStream().stream)
		const handler = registeredHandler()
		const sender = makeSender()

		await handler({ sender }, request())

		expect(sender.send.mock.calls).toEqual([
			["file:download-progress", 7, 3, 6],
			["file:download-progress", 7, 6, 6],
		])
	})

	it("reports an unknown total as zero", async ({ expect }) => {
		mocks.netFetch.mockResolvedValue(chunkedResponse(["zipped"], {}))
		mocks.createWriteStream.mockReturnValue(memoryWriteStream().stream)
		const handler = registeredHandler()
		const sender = makeSender()

		await handler({ sender }, request())

		expect(sender.send).toHaveBeenLastCalledWith(
			"file:download-progress",
			7,
			6,
			0,
		)
	})

	it("stops reporting to a closed window", async ({ expect }) => {
		mocks.createWriteStream.mockReturnValue(memoryWriteStream().stream)
		const handler = registeredHandler()
		const sender = makeSender(true)

		await expect(handler({ sender }, request())).resolves.toBe("completed")

		expect(sender.send).toHaveBeenCalledTimes(0)
	})

	it("rejects a failed response without writing", async ({ expect }) => {
		mocks.netFetch.mockResolvedValue(new Response(null, { status: 404 }))
		const handler = registeredHandler()
		const sender = makeSender()

		await expect(handler({ sender }, request())).rejects.toThrow(
			"file download failed with status 404",
		)

		expect(mocks.createWriteStream).toHaveBeenCalledTimes(0)
		expect(mocks.unlink).toHaveBeenCalledTimes(0)
		expect(sender.send).toHaveBeenCalledTimes(0)
	})

	it("removes the partial file when writing fails", async ({ expect }) => {
		const failure = new Error("disk full")
		mocks.createWriteStream.mockReturnValue(memoryWriteStream(failure).stream)
		const handler = registeredHandler()
		const sender = makeSender()

		await expect(handler({ sender }, request())).rejects.toBe(failure)

		expect(mocks.unlink).toHaveBeenCalledExactlyOnceWith("/tmp/notes.zip")
		expect(sender.send).toHaveBeenCalledExactlyOnceWith(
			"file:download-progress",
			7,
			6,
			6,
		)
	})

	it("still rejects with the write failure when removing the file fails", async ({
		expect,
	}) => {
		const failure = new Error("disk full")
		mocks.createWriteStream.mockReturnValue(memoryWriteStream(failure).stream)
		mocks.unlink.mockRejectedValue(new Error("already gone"))
		const handler = registeredHandler()

		await expect(handler({ sender: makeSender() }, request())).rejects.toBe(
			failure,
		)

		expect(mocks.unlink).toHaveBeenCalledTimes(1)
	})
})
