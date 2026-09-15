import {
	mkdtempSync,
	mkdirSync,
	readdirSync,
	statSync,
	writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "vitest"
import { ensureSecrets } from "./secrets.js"

function tempDir(): string {
	return join(mkdtempSync(join(tmpdir(), "oxynote-secrets-")), "secrets")
}

const noOverrides = {
	authSecret: undefined,
	dataSourceEncryptionKeys: undefined,
}

// a key in the shape ensureSecrets generates.
const validKey = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="

describe("ensureSecrets", () => {
	it("generates every secret on first boot and persists it", ({
		expect,
	}) => {
		const dir = tempDir()

		const { secrets, report } = ensureSecrets(dir, noOverrides)

		// 32 random bytes as standard base64, the one key of a fresh
		// keyring
		expect(secrets.dataSourceEncryptionKeys).toMatch(
			/^[A-Za-z0-9+/]{43}=$/,
		)

		for (const [name, value] of Object.entries(secrets)) {
			if (name === "dataSourceEncryptionKeys") {
				continue
			}

			// 24 random bytes as base64url — 32 ASCII characters,
			// satisfying the 32-byte signing constraints
			expect(value).toMatch(/^[A-Za-z0-9_-]{32}$/)
		}

		expect(report.generated.toSorted()).toEqual([
			"auth-secret",
			"data-source-encryption-key",
			"database-password",
			"github-installation-signing-secret",
			"slack-installation-signing-secret",
		])
		expect(readdirSync(dir).toSorted()).toEqual(
			report.generated.toSorted(),
		)
	})

	it("writes owner-only files inside an owner-only directory", ({
		expect,
	}) => {
		const dir = tempDir()

		ensureSecrets(dir, noOverrides)

		expect(statSync(dir).mode & 0o777).toBe(0o700)

		for (const file of readdirSync(dir)) {
			expect(statSync(join(dir, file)).mode & 0o777).toBe(
				0o600,
			)
		}
	})

	it("reuses the persisted secrets on later boots", ({ expect }) => {
		const dir = tempDir()

		const first = ensureSecrets(dir, noOverrides)
		const second = ensureSecrets(dir, noOverrides)

		expect(second.secrets).toEqual(first.secrets)
		expect(second.report.generated).toEqual([])
		expect(second.report.fromVolume.toSorted()).toEqual(
			first.report.generated.toSorted(),
		)
	})

	it("trims whitespace from a stored secret", ({ expect }) => {
		const dir = tempDir()

		mkdirSync(dir, { recursive: true })
		writeFileSync(join(dir, "auth-secret"), "  stored-value\n")

		const { secrets } = ensureSecrets(dir, noOverrides)

		expect(secrets.authSecret).toBe("stored-value")
	})

	it("lets an explicit override win without persisting it", ({
		expect,
	}) => {
		const dir = tempDir()

		const { secrets, report } = ensureSecrets(dir, {
			authSecret: "operator-provided",
			dataSourceEncryptionKeys: undefined,
		})

		expect(secrets.authSecret).toBe("operator-provided")
		expect(report.fromEnv).toEqual(["auth-secret"])
		expect(readdirSync(dir)).not.toContain("auth-secret")
	})

	it("passes an overridden keyring through as it is", ({ expect }) => {
		const dir = tempDir()
		const keys = `${validKey},ZmVkY2JhOTg3NjU0MzIxMGZlZGNiYTk4NzY1NDMyMTA=`

		const { secrets, report } = ensureSecrets(dir, {
			authSecret: undefined,
			dataSourceEncryptionKeys: keys,
		})

		expect(secrets.dataSourceEncryptionKeys).toBe(keys)
		expect(report.fromEnv).toEqual(["data-source-encryption-key"])
		expect(readdirSync(dir)).not.toContain(
			"data-source-encryption-key",
		)
	})

	it("reuses a stored data-source key of the right shape", ({
		expect,
	}) => {
		const dir = tempDir()

		mkdirSync(dir, { recursive: true })
		writeFileSync(join(dir, "data-source-encryption-key"), validKey)

		const { secrets } = ensureSecrets(dir, noOverrides)

		expect(secrets.dataSourceEncryptionKeys).toBe(validKey)
	})

	it("keeps an overridden secret out of the volume across boots", ({
		expect,
	}) => {
		const dir = tempDir()

		ensureSecrets(dir, {
			authSecret: "operator-provided",
			dataSourceEncryptionKeys: undefined,
		})
		const { secrets } = ensureSecrets(dir, {
			authSecret: "operator-provided",
			dataSourceEncryptionKeys: undefined,
		})

		expect(secrets.authSecret).toBe("operator-provided")
		expect(readdirSync(dir)).not.toContain("auth-secret")
	})

	it("propagates an unreadable secret file", ({ expect }) => {
		const dir = tempDir()

		// a directory where the secret file should be makes the read
		// fail with something other than ENOENT
		mkdirSync(join(dir, "auth-secret"), { recursive: true })

		expect(() => ensureSecrets(dir, noOverrides)).toThrow()
	})

	it("explains the volume requirement when persisting fails", ({
		expect,
	}) => {
		const dir = tempDir()

		// an empty pre-existing file reads as absent, and the wx write
		// then fails on it
		mkdirSync(dir, { recursive: true })
		writeFileSync(join(dir, "auth-secret"), "")

		expect(() => ensureSecrets(dir, noOverrides)).toThrow(
			"writable data volume",
		)
	})
})
