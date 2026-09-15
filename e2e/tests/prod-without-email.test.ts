import { expect, test, type Page } from "@playwright/test"
import {
	newCredentials,
	submitLoginForm,
	submitSignupForm,
} from "../helpers/auth"
import { sidebarDocument } from "../helpers/editor"
import { t } from "../helpers/i18n"
import { visit } from "../helpers/page"
import { openSettings } from "../helpers/settings"
import {
	signUpWithWorkspaceWithoutEmail,
	WITHOUT_EMAIL_URL,
} from "../helpers/without-email"

// confirms a deletion from settings with the given password and leaves the
// browser wherever the app sends it.
async function confirmAccountDeletion(
	page: Page,
	workspaceName: string,
	password: string,
): Promise<void> {
	const settings = await openSettings(page, workspaceName)
	await settings
		.getByRole("button", {
			name: t("settings.profile.account-deletion-button"),
		})
		.click()

	const action = page.getByRole("dialog", {
		name: t("settings.action-modals.account-deletion.title"),
	})
	await action
		.getByLabel(t("settings.action-modals.account-deletion.password-label"))
		.fill(password)
	await action
		.getByRole("button", {
			name: t("settings.action-modals.account-deletion.confirm-button"),
		})
		.click()
}

// the image started with no email sender. The launcher derives that mode
// from the missing OXYNOTE_SMTP_DSN, which only the all-in-one image does.
test.describe("without an email sender", () => {
	test("signs a new account straight in", async ({ page }) => {
		await submitSignupForm(page, newCredentials(), WITHOUT_EMAIL_URL)

		await expect(page).toHaveURL(`${WITHOUT_EMAIL_URL}/welcome`, {
			timeout: 15_000,
		})
	})

	test("refuses to send a password reset link", async ({ page, request }) => {
		const credentials = newCredentials()
		await submitSignupForm(page, credentials, WITHOUT_EMAIL_URL)
		await expect(page).toHaveURL(`${WITHOUT_EMAIL_URL}/welcome`, {
			timeout: 15_000,
		})

		// the login page offers no reset at all, so the request goes
		// straight to the endpoint it would have called
		const response = await request.post(
			`${WITHOUT_EMAIL_URL}/auth-realtime/api/auth/request-password-reset`,
			{
				headers: { Origin: WITHOUT_EMAIL_URL },
				data: {
					email: credentials.email,
					redirectTo: `${WITHOUT_EMAIL_URL}/reset-password`,
				},
			},
		)

		expect(response.status()).toBe(400)
		expect((await response.json()) as unknown).toMatchObject({
			code: "RESET_PASSWORD_DISABLED",
		})
	})

	test("takes a teammate in through a copied invitation link", async ({
		page,
		browser,
	}) => {
		// two signups, a workspace and an invitation run before the first
		// assertion
		test.slow()

		await page.context().grantPermissions(["clipboard-read", "clipboard-write"])
		const { workspace } = await signUpWithWorkspaceWithoutEmail(page)
		const invitee = newCredentials()

		await openSettings(page, workspace.name)
		await page
			.getByRole("button", {
				name: t("settings.workspace.invitation-button"),
				exact: true,
			})
			.click()
		await page
			.getByPlaceholder(
				t("settings.action-modals.workspace-invitation.email-placeholder"),
			)
			.fill(invitee.email)
		await page
			.getByRole("button", {
				name: t("settings.action-modals.workspace-invitation.submit-button"),
			})
			.click()

		await page
			.getByRole("row")
			.filter({ hasText: invitee.email })
			.getByRole("button", {
				name: t("settings.workspace.members-option-button-screen-reader-hint"),
			})
			.click()
		await page
			.getByRole("menuitem", {
				name: t("settings.workspace.member-options.copy-link.title"),
			})
			.click()
		await expect(
			page.getByText(t("settings.workspace.invitation-link-copied")),
		).toBeVisible()
		const link = await page.evaluate(() => navigator.clipboard.readText())

		const context = await browser.newContext()
		const other = await context.newPage()
		await submitSignupForm(other, invitee, WITHOUT_EMAIL_URL)
		// a fresh account has no workspace yet, so signup lands on
		// onboarding — the invitation is what gets them out of it
		await expect(other).toHaveURL(`${WITHOUT_EMAIL_URL}/welcome`, {
			timeout: 15_000,
		})

		await visit(other, link)
		await other
			.getByRole("button", {
				name: t("onboarding.accept-invite.accept-button"),
			})
			.click()

		await expect(other).toHaveURL(new RegExp(`/${workspace.slug}/`), {
			timeout: 30_000,
		})
		await expect(sidebarDocument(other, "Welcome to Oxynote!")).toBeVisible()

		await context.close()
	})

	test("moves the login to a new address once the password confirms it", async ({
		page,
		browser,
	}) => {
		const { credentials, workspace } =
			await signUpWithWorkspaceWithoutEmail(page)
		const newEmail = newCredentials().email

		const settings = await openSettings(page, workspace.name)
		await settings
			.getByRole("button", {
				name: t("settings.profile.email-change-button-screen-reader-hint"),
			})
			.click()

		const action = page.getByRole("dialog", {
			name: t("settings.action-modals.email-change.title"),
		})
		await action
			.getByPlaceholder(
				t("settings.action-modals.email-change.new-email-placeholder"),
			)
			.fill(newEmail)
		await action
			.getByPlaceholder(
				t("settings.action-modals.email-change.password-placeholder"),
			)
			.fill(credentials.password)
		await action
			.getByRole("button", {
				name: t("settings.action-modals.email-change.submit-button"),
			})
			.click()

		await expect(
			page.getByText(
				t(
					"settings.action-modals.email-change.success-message-without-email.title",
				),
			),
		).toBeVisible()

		// a browser of its own proves the server took the new address,
		// not just the form
		const context = await browser.newContext()
		const fresh = await context.newPage()
		await submitLoginForm(
			fresh,
			{ email: newEmail, password: credentials.password },
			WITHOUT_EMAIL_URL,
		)
		await expect(fresh).toHaveURL(/-[a-z0-9]{20}$/, { timeout: 30_000 })

		await context.close()
	})

	test("deletes the account once the password confirms it", async ({
		page,
	}) => {
		const { credentials, workspace } =
			await signUpWithWorkspaceWithoutEmail(page)

		await confirmAccountDeletion(page, workspace.name, credentials.password)

		await expect(page).toHaveURL(`${WITHOUT_EMAIL_URL}/signup?deletion=success`)

		await submitLoginForm(page, credentials, WITHOUT_EMAIL_URL)
		await expect(
			page.getByText(t("onboarding.login.errors.invalid-credentials")),
		).toBeVisible()
	})

	test("keeps the account when the deletion password is wrong", async ({
		page,
		browser,
	}) => {
		const { credentials, workspace } =
			await signUpWithWorkspaceWithoutEmail(page)

		await confirmAccountDeletion(page, workspace.name, "not-the-Passw0rd!")

		await expect(
			page.getByText(
				t("settings.action-modals.account-deletion.errors.invalid-password"),
			),
		).toBeVisible()

		const context = await browser.newContext()
		const fresh = await context.newPage()
		await submitLoginForm(fresh, credentials, WITHOUT_EMAIL_URL)
		await expect(fresh).toHaveURL(/-[a-z0-9]{20}$/, { timeout: 30_000 })

		await context.close()
	})
})
