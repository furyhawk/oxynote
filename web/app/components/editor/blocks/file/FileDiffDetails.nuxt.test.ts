import { mountSuspended } from "@nuxt/test-utils/runtime"
import { describe, it } from "vitest"
import FileDiffDetails from "./FileDiffDetails.vue"
import { makeNode } from "../../test-helpers/node-view"
import { FILE_BLOCK_NAME } from "../node-names"
import { formatFileSize } from "./file-kind"
import { DiffStatus } from "~/components/editor/diff/position-map"
import { t } from "~/components/test-helpers"

describe("<FileDiffDetails>", () => {
	it("shows the old and the new file side by side", async ({ expect }) => {
		const wrapper = await mountDetails(storedFile("a.zip"), storedFile("b.pdf"))

		expect(wrapper.findAll(".font-medium").map((name) => name.text())).toEqual([
			"a.zip",
			"b.pdf",
		])
		expect(wrapper.text()).toContain(formatFileSize(1024))
	})

	it("shows an empty side for a newly uploaded file", async ({ expect }) => {
		const wrapper = await mountDetails({}, storedFile("b.pdf"))

		expect(wrapper.findAll(".font-medium").map((name) => name.text())).toEqual([
			"b.pdf",
		])
		expect(wrapper.text()).toContain(t("editor.file.empty"))
	})

	it("renders nothing when the file itself is unchanged", async ({
		expect,
	}) => {
		const wrapper = await mountDetails(
			{ ...storedFile("a.zip"), uploading: true },
			{ ...storedFile("a.zip"), uploading: false },
		)

		expect(wrapper.html()).toBe("<!--v-if-->")
	})
})

function storedFile(name: string): Record<string, unknown> {
	return {
		src: `/files/${name}`,
		name: name,
		size: 1024,
		contentType: "application/octet-stream",
	}
}

function mountDetails(
	oldAttrs: Record<string, unknown>,
	newAttrs: Record<string, unknown>,
) {
	return mountSuspended(FileDiffDetails, {
		props: {
			node: makeNode(
				{
					...newAttrs,
					diffStatus: DiffStatus.Modified,
					oldNode: { attrs: oldAttrs },
				},
				{ typeName: FILE_BLOCK_NAME },
			),
		},
	})
}
