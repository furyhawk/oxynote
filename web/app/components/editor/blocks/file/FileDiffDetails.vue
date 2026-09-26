<script lang="ts" setup>
import type { Node as PMNode } from "@tiptap/pm/model"
import { collectAttributeChanges } from "~/components/editor/diff/change-count"
import DiffBeforeAfter from "~/components/editor/diff/DiffBeforeAfter.vue"
import { fileKind, fileKindStyle, formatFileSize } from "./file-kind"

interface StoredFile {
	name?: string
	size?: number
	contentType?: string
}

const props = defineProps<{
	node: PMNode
}>()

const { t } = useI18n({ useScope: "global" })

// the file's attributes change together, so they arrive as one group
const fileChange = computed(() =>
	collectAttributeChanges(props.node).find((change) => change.name === "file"),
)

function describe(value: unknown) {
	if (!value) {
		return undefined
	}

	const file = value as StoredFile

	return {
		name: file.name ?? "",
		size: formatFileSize(file.size),
		icon: fileKindStyle(fileKind(file.name ?? "", file.contentType ?? "")).icon,
	}
}
</script>

<template>
	<DiffBeforeAfter
		v-if="fileChange"
		v-slot="{ value }"
		:before="describe(fileChange.oldValue)"
		:after="describe(fileChange.newValue)"
		:empty-label="t('editor.file.empty')"
		class="w-80"
	>
		<div class="flex w-full min-w-0 items-center gap-2 p-2">
			<span
				class="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
			>
				<Icon :name="value.icon" class="size-4" />
			</span>
			<span class="flex min-w-0 flex-col">
				<span class="line-clamp-6 text-xs font-medium break-words">
					{{ value.name }}
				</span>
				<span v-if="value.size" class="text-xs text-muted-foreground">
					{{ value.size }}
				</span>
			</span>
		</div>
	</DiffBeforeAfter>
</template>
