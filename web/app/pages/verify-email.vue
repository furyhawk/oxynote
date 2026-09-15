<script lang="ts" setup>
definePageMeta({
	middleware: async (to) => {
		if (!to.query.new || typeof to.query.new !== "string") {
			return navigateTo("/")
		}
	},
})

const { t } = useI18n({ useScope: "global" })
useHead({
	title: () => t("general.verify-email-page-title"),
})
const { fetchAuthSession } = useAuthSession()
const pageRoute = useRoute()

// both steps of a change of address land here through the same callback
// url, and only the session separates them: better-auth writes the new
// address into it once the change is applied, creating a session first if
// the link was opened in a browser that had none. The page is exempt from
// the global middleware, so nothing has read the session yet.
await fetchAuthSession.refresh()

const changeApplied = computed(
	() =>
		fetchAuthSession.state.value.data?.data?.user.email === pageRoute.query.new,
)
</script>
<template>
	<main
		class="flex min-h-svh min-w-svw items-center justify-center bg-background text-foreground"
	>
		<div class="flex w-67 flex-col items-center gap-5">
			<div class="flex flex-col items-center gap-6">
				<Icon name="custom-icons:main-logo" class="size-12" />
				<div class="text-lg font-semibold">
					{{
						pageRoute.query.sent
							? $t("onboarding.verify-email.sent-heading")
							: changeApplied
								? $t("onboarding.verify-email.heading")
								: $t("onboarding.verify-email.approved-heading")
					}}
				</div>
			</div>
			<div class="flex w-full flex-col gap-3">
				<i18n-t
					v-if="pageRoute.query.sent"
					scope="global"
					keypath="onboarding.verify-email.sent-title"
					tag="div"
					class="text-center text-xs text-accent-foreground"
				>
					<template #email>{{ pageRoute.query.new }}</template>
				</i18n-t>
				<i18n-t
					v-else-if="changeApplied"
					scope="global"
					keypath="onboarding.verify-email.title"
					tag="div"
					class="text-center text-xs text-accent-foreground"
				>
					<template #email>{{ pageRoute.query.new }}</template>
				</i18n-t>
				<i18n-t
					v-else
					scope="global"
					keypath="onboarding.verify-email.approved-title"
					tag="div"
					class="text-center text-xs text-accent-foreground"
				>
					<template #email>{{ pageRoute.query.new }}</template>
				</i18n-t>
				<ShadcnUiButton
					v-if="pageRoute.query.sent"
					type="button"
					size="lg"
					variant="ghost"
					class="h-10 w-full text-muted-foreground"
					@click="navigateTo({ name: 'login' })"
				>
					{{ $t("onboarding.verify-email.back-to-login") }}
				</ShadcnUiButton>
				<ShadcnUiButton
					v-else
					type="button"
					size="lg"
					variant="ghost"
					class="h-10 w-full text-muted-foreground"
					@click="navigateTo('/')"
				>
					{{ $t("onboarding.verify-email.button") }}
				</ShadcnUiButton>
			</div>
		</div>
	</main>
</template>
