const AUTH_QUERY_KEYS = {
	config: ["auth", "config"] as const,
}

export default function () {
	const { $authRealtimeAPIClient } = useNuxtApp()

	const fetchAuthConfig = useQuery({
		key: AUTH_QUERY_KEYS.config,
		query: async () => {
			return await $authRealtimeAPIClient<AuthConfig>(`/api/auth-config`, {
				method: "GET",
			})
		},
		refetchOnMount: false,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
		staleTime: 5 * 60 * 1000, // 5 mins
	})

	// until the config arrives email is assumed to be delivered, so a page
	// renders the flows every configured server supports.
	const isEmailEnabled = computed(
		() => fetchAuthConfig.state.value.data?.emailEnabled ?? true,
	)

	return { fetchAuthConfig, isEmailEnabled }
}
