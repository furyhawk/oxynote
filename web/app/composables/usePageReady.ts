// whether the document page has finished loading and fading in: the
// sidebar, the header and the content, dynamic blocks included. False
// again while another document is loading.
export default function () {
	return useState<boolean>("pageReady", () => false)
}
