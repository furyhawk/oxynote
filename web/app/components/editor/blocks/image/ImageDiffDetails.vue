<script lang="ts" setup>
import type { Node as PMNode } from "@tiptap/pm/model"
import {
	collectAttributeChanges,
	displayValue,
	formatChange,
	type FieldChange,
} from "~/components/editor/diff/change-count"
import DiffBeforeAfter from "~/components/editor/diff/DiffBeforeAfter.vue"
import DiffFieldChanges from "~/components/editor/diff/DiffFieldChanges.vue"

const props = defineProps<{
	node: PMNode
}>()

const { t } = useI18n({ useScope: "global" })

const changes = computed(() => collectAttributeChanges(props.node))
const srcChange = computed(() =>
	changes.value.find((change) => change.name === "src"),
)
const rows = computed<FieldChange[]>(() =>
	changes.value
		.filter((change) => change.name === "width")
		.map((change) => ({
			label: t("editor.image.diff.width"),
			...formatChange(change, pixels, t("editor.diff-change-marker.auto")),
		})),
)

function pixels(value: unknown): string {
	return t("editor.diff-change-marker.pixels", { value: displayValue(value) })
}

function imageSrc(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined
}
</script>

<template>
	<div class="flex w-72 flex-col gap-3">
		<DiffBeforeAfter
			v-if="srcChange"
			v-slot="{ value }"
			:before="imageSrc(srcChange.oldValue)"
			:after="imageSrc(srcChange.newValue)"
			:empty-label="t('editor.image.empty')"
		>
			<img
				:src="value"
				:alt="t('editor.image.diff.image')"
				class="h-20 w-full object-cover"
			/>
		</DiffBeforeAfter>
		<DiffFieldChanges v-if="rows.length" :rows="rows" />
	</div>
</template>
