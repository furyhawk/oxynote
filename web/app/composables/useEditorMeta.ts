export const EDITOR_COMPACT_MAX_WIDTH_PX = 1280

export default function () {
	// the reader's own read/edit choice. Whether the page can actually be
	// edited also depends on the branch, so consumers read isEditable
	const editablePreference = usePersistentState<boolean>({
		key: "editor-editable",
		defaultValue: true,
	})

	// compact view caps and centers the editor column on wide screens
	const compactViewPreference = usePersistentState<boolean>({
		key: "editor-compact-view",
		defaultValue: true,
	})

	const editorStore = useEditorStore()

	const isEditable = computed(
		() => editablePreference.value && !editorStore.activeBranchProtected,
	)

	function toggleIsEditable() {
		editablePreference.value = !editablePreference.value
	}

	function setEditable(v: boolean) {
		editablePreference.value = v
	}

	function toggleCompactView() {
		compactViewPreference.value = !compactViewPreference.value
	}

	function updateLock(v: boolean) {
		editorStore.updateLock(v)
	}

	return {
		isEditable,
		toggleIsEditable,
		setEditable,
		isCompactView: computed(() => compactViewPreference.value),
		toggleCompactView,
		isBranchProtected: computed(() => editorStore.activeBranchProtected),
		isLocked: computed(() => editorStore.locked), // locks are used by drag handle menus
		updateLock,
		isEditableAndUnlocked: computed(
			() => isEditable.value && !editorStore.locked,
		),
	}
}
