export interface OrganizationMember {
	id: string
	organizationId: string
	createdAt?: Date
	userId?: string
	invitationPending?: boolean
	invitationUrl?: string
	role: string
	user: {
		name: string
		email: string
		image?: string
	}
}
